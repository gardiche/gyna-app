import Link from "next/link";
import { redirect } from "next/navigation";
import type { AdPlatform } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { listVentures } from "@/lib/data";
import { AgentAvatar } from "@/components/AgentAvatar";
import type { AdRow } from "@/components/AdDetail";
import { AdBoard, type AdBatch } from "@/components/AdBoard";
import { AssetLibrary, type Asset } from "@/components/AssetLibrary";

export const dynamic = "force-dynamic";

const fmt = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));

export default async function PubsPage({ searchParams }: { searchParams: Promise<{ venture?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const ventures = await listVentures(db);
  const viewer = session.campaignViewer;
  const venture = ventures.find((v) => v.slug === sp.venture) ?? ventures[0] ?? null;

  const [{ data: batches }, { count: competitors }, { data: assetRows }] = venture
    ? await Promise.all([
        db
          .from("ad_batches")
          .select(
            "id, title, platform, objective, audience, rationale, created_at, ads(id, position, format, template, angle, awareness, headline, primary_text, description, cta, visual_brief, grounding, hypothesis, status, rejection_reason, external_status, ad_images(id, url, aspect, created_at, checks))",
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

  return (
    <>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          <AgentAvatar agent="ads" size={56} />
          <div>
            <h1 className="page-title">Pubs</h1>
            <p className="page-sub">Les pubs proposées pour {name}. {viewer ? "Ouvrez-en une pour voir sa créative et ses textes." : "Ouvrez-en une pour la relire, la corriger et la décider."}</p>
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
          {viewer ? null : <a href={ask(`Pubs ${name} : crée 12 pubs Meta pour `)} className="btn btn-lime btn-sm">Demander des pubs à Gyna</a>}
        </div>
      </div>

      {venture && !viewer ? (
        <details className="card card-pad fold-card">
          <summary>
            <span>Bibliothèque de visuels</span>
            <span className="muted">{assets.length ? `${assets.length} élément${assets.length > 1 ? "s" : ""} : ` : ""}logo, vraies photos, charte et inspirations de {name}</span>
          </summary>
          <AssetLibrary ventureId={venture.id} assets={assets} />
        </details>
      ) : null}

      {batches?.length ? (
        <AdBoard
          assets={assets}
          readOnly={viewer}
          batches={batches.map((b: any): AdBatch => ({
            id: b.id,
            title: b.title,
            platform: b.platform as AdPlatform,
            objective: b.objective,
            audience: b.audience,
            rationale: b.rationale,
            date: fmt(b.created_at),
            ads: ((b.ads ?? []) as Array<AdRow & { position: number }>).slice().sort((x, y) => x.position - y.position),
          }))}
        />
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
