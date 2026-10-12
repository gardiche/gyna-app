import Link from "next/link";
import { redirect } from "next/navigation";
import type { AdPlatform } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { listVentures } from "@/lib/data";
import { AgentAvatar } from "@/components/AgentAvatar";
import { AdCard, type AdRow } from "@/components/AdCard";
import { AssetLibrary, type Asset } from "@/components/AssetLibrary";

export const dynamic = "force-dynamic";

const PLATFORM: Record<string, string> = { meta: "Meta", linkedin: "LinkedIn", google: "Google", tiktok: "TikTok", other: "Autre" };
const fmt = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export default async function PubsPage({ searchParams }: { searchParams: Promise<{ venture?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const ventures = await listVentures(db);
  const venture = ventures.find((v) => v.slug === sp.venture) ?? ventures[0] ?? null;

  const [{ data: batches }, { count: competitors }, { data: assetRows }] = venture
    ? await Promise.all([
        db
          .from("ad_batches")
          .select(
            "id, title, platform, objective, audience, rationale, created_at, ads(id, position, format, template, angle, awareness, headline, primary_text, description, cta, visual_brief, grounding, hypothesis, status, rejection_reason, ad_images(id, url, aspect, created_at))",
          )
          .eq("venture_id", venture.id)
          .eq("kind", "ad")
          .order("created_at", { ascending: false })
          .limit(30),
        db.from("competitors").select("id", { count: "exact", head: true }).eq("venture_id", venture.id),
        db.from("venture_assets").select("id, kind, url, note, description").eq("venture_id", venture.id).order("kind").order("created_at", { ascending: false }),
      ])
    : [{ data: [] as any[] }, { count: 0 }, { data: [] as any[] }];
  const assets = (assetRows ?? []) as Asset[];

  const ask = (text: string) => `/nouvelle?prompt=${encodeURIComponent(text)}`;
  const name = venture?.name ?? "la venture";
  const all = (batches ?? []).flatMap((b: any) => b.ads ?? []);
  const waiting = all.filter((a: any) => a.status === "pending").length;

  return (
    <>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          <AgentAvatar agent="ads" size={56} />
          <div>
            <h1 className="page-title">Pubs</h1>
            <p className="page-sub">
              Les pubs proposées pour {name}. Vous choisissez, corrigez ou refusez chacune ; rien n'est publié par les agents.
            </p>
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {ventures.length > 1 ? (
            <form method="get" className="row" style={{ gap: 8 }}>
              <label className="sr-only" htmlFor="pubs-venture">Venture</label>
              <select id="pubs-venture" name="venture" defaultValue={venture?.slug}>
                {ventures.map((v) => <option key={v.id} value={v.slug}>{v.name}</option>)}
              </select>
              <button type="submit" className="btn btn-sm">Afficher</button>
            </form>
          ) : null}
          <a href={ask(`Pubs ${name} : crée 12 pubs Meta pour `)} className="btn btn-lime btn-sm">Demander des pubs à Gyna</a>
        </div>
      </div>

      {venture ? (
        <section className="card card-pad stack" aria-labelledby="bibliotheque">
          <div className="card-head">
            <h2 id="bibliotheque" style={{ fontSize: 18, fontWeight: 600 }}>Bibliothèque de visuels</h2>
            <span className="muted">Logo, vraies photos, charte et inspirations de {name}</span>
          </div>
          <AssetLibrary ventureId={venture.id} assets={assets} />
        </section>
      ) : null}

      {batches?.length ? (
        <>
          <div className="stats">
            <div className="stat"><span>À choisir</span><strong className="tabular">{waiting}</strong></div>
            <div className="stat"><span>Approuvées</span><strong className="tabular">{all.filter((a: any) => a.status === "approved").length}</strong></div>
            <div className="stat"><span>Refusées</span><strong className="tabular">{all.filter((a: any) => a.status === "rejected").length}</strong></div>
            <div className="stat"><span>Lots</span><strong className="tabular">{batches.length}</strong></div>
          </div>
          {batches.map((b: any) => {
            const ads = ((b.ads ?? []) as Array<AdRow & { position: number }>).slice().sort((x, y) => x.position - y.position);
            const left = ads.filter((a) => a.status === "pending").length;
            return (
              <section key={b.id} id={`lot-${b.id}`} className="card card-pad ad-batch" aria-labelledby={`lot-title-${b.id}`}>
                <div className="card-head">
                  <div className="row" style={{ gap: 10 }}>
                    <h2 id={`lot-title-${b.id}`} style={{ fontSize: 18, fontWeight: 600 }}>{b.title}</h2>
                    <span className="pill pill-cold">{PLATFORM[b.platform] ?? b.platform}</span>
                    {left ? <span className="pill pill-warm">{plural(left, "pub à choisir", "pubs à choisir")}</span> : <span className="pill pill-lime">Lot traité</span>}
                  </div>
                  <span className="muted">{fmt(b.created_at)}</span>
                </div>
                <dl className="ad-batch-meta">
                  {b.objective ? <><dt>Objectif</dt><dd>{b.objective}</dd></> : null}
                  {b.audience ? <><dt>Public</dt><dd>{b.audience}</dd></> : null}
                  <dt>Pourquoi ces angles</dt><dd>{b.rationale}</dd>
                </dl>
                <div className="ad-grid">
                  {ads.map((a) => <AdCard key={a.id} ad={a} platform={b.platform as AdPlatform} brand={name} assets={assets} />)}
                </div>
              </section>
            );
          })}
        </>
      ) : (
        <section className="card card-pad stack">
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Aucune pub pour l'instant</h2>
          <p className="muted">
            Demandez à Gyna un lot de pubs pour une plateforme et un public. L'agent Ads part du brief de {name}, de la veille concurrentielle et de vos retours sur les pubs précédentes.
          </p>
          {competitors ? null : (
            <p className="muted">
              Aucune veille n'existe encore pour {name} : les pubs seront plus justes si vous la lancez d'abord. <Link href="/veille" className="card-link">Ouvrir la veille</Link>
            </p>
          )}
          <div className="row">
            <a
              href={ask(`Pubs ${name} : crée 12 pubs Meta pour les salariés qui veulent entreprendre, avec 4 angles différents. Objectif : des pré-inscriptions.`)}
              className="btn btn-dark btn-sm"
            >
              Lancer un premier lot
            </a>
            <Link href="/agents/ads" className="card-link">Voir l'agent Ads</Link>
          </div>
        </section>
      )}
    </>
  );
}
