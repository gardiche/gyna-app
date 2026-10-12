import Link from "next/link";
import { redirect } from "next/navigation";
import type { PostPlatform } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { listVentures } from "@/lib/data";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PostCard, type PostRow } from "@/components/PostCard";
import type { Asset } from "@/components/AssetLibrary";

export const dynamic = "force-dynamic";

const PLATFORM: Record<string, string> = { linkedin: "LinkedIn", instagram: "Instagram" };
const day = (d: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const stamp = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date(d));
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ venture?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const ventures = await listVentures(db);
  const venture = ventures.find((v) => v.slug === sp.venture) ?? ventures[0] ?? null;

  const [{ data: batches }, { data: assetRows }] = venture
    ? await Promise.all([
        db
          .from("ad_batches")
          .select(
            "id, title, platform, author, rationale, created_at, ads(id, position, format, template, angle, headline, primary_text, description, visual_brief, slides, scheduled_for, published_at, grounding, status, rejection_reason, ad_images(id, url, aspect, created_at))",
          )
          .eq("venture_id", venture.id)
          .eq("kind", "post")
          .order("created_at", { ascending: false })
          .limit(30),
        db.from("venture_assets").select("id, kind, url, note, description").eq("venture_id", venture.id).order("kind").order("created_at", { ascending: false }),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
  const assets = (assetRows ?? []) as Asset[];
  const name = venture?.name ?? "la venture";
  const ask = (text: string) => `/nouvelle?prompt=${encodeURIComponent(text)}`;

  const all = (batches ?? []).flatMap((b: any) => (b.ads ?? []).map((a: PostRow) => ({ ...a, platform: b.platform as string, author: b.author as string })));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = all
    .filter((p) => p.status === "approved" && !p.published_at && p.scheduled_for)
    .sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!));

  return (
    <>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          <AgentAvatar agent="ads" size={56} />
          <div>
            <h1 className="page-title">Posts</h1>
            <p className="page-sub">Les posts proposés pour les comptes LinkedIn et Instagram de {name}. Vous choisissez, corrigez et publiez ; l'agent ne publie rien.</p>
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {ventures.length > 1 ? (
            <form method="get" className="row" style={{ gap: 8 }}>
              <label className="sr-only" htmlFor="posts-venture">Venture</label>
              <select id="posts-venture" name="venture" defaultValue={venture?.slug}>
                {ventures.map((v) => <option key={v.id} value={v.slug}>{v.name}</option>)}
              </select>
              <button type="submit" className="btn btn-sm">Afficher</button>
            </form>
          ) : null}
          <a href={ask(`Posts ${name} : prépare les posts LinkedIn de la semaine prochaine pour `)} className="btn btn-lime btn-sm">Demander des posts à Gyna</a>
        </div>
      </div>

      {batches?.length ? (
        <>
          <div className="stats">
            <div className="stat"><span>À choisir</span><strong className="tabular">{all.filter((p) => p.status === "pending").length}</strong></div>
            <div className="stat"><span>Approuvés, à publier</span><strong className="tabular">{all.filter((p) => p.status === "approved" && !p.published_at).length}</strong></div>
            <div className="stat"><span>Publiés</span><strong className="tabular">{all.filter((p) => p.published_at).length}</strong></div>
          </div>

          {upcoming.length ? (
            <section className="card card-pad stack" aria-labelledby="calendrier">
              <h2 id="calendrier" style={{ fontSize: 18, fontWeight: 600 }}>À publier</h2>
              <ul className="calendar">
                {upcoming.map((p) => (
                  <li key={p.id} className={p.scheduled_for! < today ? "is-late" : undefined}>
                    <span className="tabular">{day(p.scheduled_for!)}{p.scheduled_for! < today ? " (en retard)" : ""}</span>
                    <span className="pill pill-cold">{PLATFORM[p.platform] ?? p.platform}</span>
                    <span className="muted">{p.author}</span>
                    <span className="calendar-text">{p.headline ?? p.primary_text.slice(0, 90)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {batches.map((b: any) => {
            const posts = ((b.ads ?? []) as Array<PostRow & { position: number }>).slice().sort((x, y) => x.position - y.position);
            const left = posts.filter((p) => p.status === "pending").length;
            return (
              <section key={b.id} id={`lot-${b.id}`} className="card card-pad ad-batch" aria-labelledby={`lot-title-${b.id}`}>
                <div className="card-head">
                  <div className="row" style={{ gap: 10 }}>
                    <h2 id={`lot-title-${b.id}`} style={{ fontSize: 18, fontWeight: 600 }}>{b.title}</h2>
                    <span className="pill pill-cold">{PLATFORM[b.platform] ?? b.platform}</span>
                    <span className="pill">{b.author}</span>
                    {left ? <span className="pill pill-warm">{plural(left, "post à choisir", "posts à choisir")}</span> : <span className="pill pill-lime">Lot traité</span>}
                  </div>
                  <span className="muted">{stamp(b.created_at)}</span>
                </div>
                <dl className="ad-batch-meta"><dt>Ligne éditoriale</dt><dd>{b.rationale}</dd></dl>
                <div className="ad-grid">
                  {posts.map((p) => <PostCard key={p.id} post={p} platform={b.platform as PostPlatform} author={b.author ?? name} assets={assets} />)}
                </div>
              </section>
            );
          })}
        </>
      ) : (
        <section className="card card-pad stack">
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Aucun post pour l'instant</h2>
          <p className="muted">
            Demandez à Gyna les posts d'une semaine pour un compte : la page {name} ou le profil d'un associé. Plus vous donnez de matière réelle (une anecdote, une photo, un chiffre, une question reçue), plus les posts vous ressemblent.
          </p>
          <div className="row">
            <a href={ask(`Posts ${name} : prépare 3 posts LinkedIn et 3 posts Instagram pour la semaine prochaine, pour la page ${name}. Matière : `)} className="btn btn-dark btn-sm">
              Lancer une première semaine
            </a>
            <Link href="/pubs" className="card-link">Déposer des visuels dans la bibliothèque</Link>
          </div>
        </section>
      )}
    </>
  );
}
