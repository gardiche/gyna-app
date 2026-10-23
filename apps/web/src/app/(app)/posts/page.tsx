import Link from "next/link";
import { redirect } from "next/navigation";
import type { PostPlatform } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { listVentures } from "@/lib/data";
import { AgentAvatar } from "@/components/AgentAvatar";
import type { PostRow } from "@/components/PostDetail";
import { PostBoard, type PostBatch } from "@/components/PostBoard";
import type { Asset } from "@/components/AssetLibrary";
import { PostRequest } from "@/components/PostRequest";
import { publishingStatus } from "@/lib/publish";

export const dynamic = "force-dynamic";

const stamp = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date(d));

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
            "id, title, platform, author, rationale, created_at, ads(id, position, format, template, angle, headline, primary_text, description, visual_brief, slides, scheduled_for, published_at, scheduled_at, publish_status, publish_error, published_url, also_facebook, facebook_url, grounding, status, rejection_reason, ad_images(id, url, aspect, created_at, slide))",
          )
          .eq("venture_id", venture.id)
          .eq("kind", "post")
          .order("created_at", { ascending: false })
          .limit(30),
        db.from("venture_assets").select("id, kind, url, note, description").eq("venture_id", venture.id).order("kind").order("created_at", { ascending: false }),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
  const assets = (assetRows ?? []) as Asset[];
  const connected = publishingStatus();
  const name = venture?.name ?? "la venture";

  return (
    <>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          <AgentAvatar agent="ads" size={56} />
          <div>
            <h1 className="page-title">Posts</h1>
            <p className="page-sub">Les posts proposés pour les comptes LinkedIn et Instagram de {name}. Ouvrez-en un pour le relire, le corriger et le publier.</p>
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
        </div>
      </div>

      <details className="card card-pad fold-card" open={!batches?.length}>
        <summary>
          <span>Demander un lot de posts</span>
          <span className={connected.instagram ? "pill pill-lime" : "pill"}>{connected.instagram ? "Instagram relié" : "Instagram non relié : publication à la main"}</span>
          <span className={connected.facebook ? "pill pill-lime" : "pill"}>{connected.facebook ? "Page Facebook reliée" : "Page Facebook non reliée"}</span>
        </summary>
        <PostRequest venture={name} />
      </details>

      {batches?.length ? (
        <PostBoard
          assets={assets}
          connected={connected}
          today={new Date().toISOString().slice(0, 10)}
          batches={batches.map((b: any): PostBatch => ({
            id: b.id,
            title: b.title,
            platform: b.platform as PostPlatform,
            author: b.author ?? name,
            rationale: b.rationale,
            date: stamp(b.created_at),
            posts: ((b.ads ?? []) as Array<PostRow & { position: number }>).slice().sort((x, y) => x.position - y.position),
          }))}
        />
      ) : (
        <section className="card card-pad stack">
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Aucun post pour l'instant</h2>
          <p className="muted">
            Demandez à Gyna les posts d'une semaine pour un compte : la page {name} ou le profil d'un associé. Plus vous donnez de matière réelle (une anecdote, une photo, un chiffre, une question reçue), plus les posts vous ressemblent.
          </p>
          <div className="row">
            <Link href="/pubs" className="card-link">Déposer des visuels dans la bibliothèque</Link>
          </div>
        </section>
      )}
    </>
  );
}
