import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { listVentures } from "@/lib/data";
import { Markdown } from "@/components/Markdown";
import { AgentAvatar } from "@/components/AgentAvatar";

export const dynamic = "force-dynamic";

const PLATFORM: Record<string, string> = { meta: "Meta", linkedin: "LinkedIn", google: "Google", tiktok: "TikTok", other: "Autre" };
const FORMAT: Record<string, string> = { image: "Image", video: "Vidéo", carousel: "Carrousel", text: "Texte", document: "Document", other: "Autre" };

const fmt = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(d));

/** « Depuis 42 jours », jusqu'à aujourd'hui pour une pub active, jusqu'au dernier jour connu sinon. */
function running(started: string | null, last: string | null, active: boolean | null): string | null {
  if (!started) return null;
  const end = active || !last ? Date.now() : new Date(last).getTime();
  const days = Math.max(0, Math.round((end - new Date(started).getTime()) / 86_400_000));
  return active ? `Active depuis ${days} jour${days > 1 ? "s" : ""}` : `Diffusée ${days} jour${days > 1 ? "s" : ""}`;
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

interface Ad {
  id: string;
  competitor_id: string;
  platform: string;
  url: string;
  started_at: string | null;
  last_seen_at: string | null;
  active: boolean | null;
  format: string | null;
  headline: string | null;
  body: string | null;
  cta: string | null;
  angle: string | null;
  hook: string | null;
  promise: string | null;
  audience: string | null;
  reach: string | null;
}

function AdItem({ ad }: { ad: Ad }) {
  const since = running(ad.started_at, ad.last_seen_at, ad.active);
  return (
    <li className="ad-item">
      <div className="ad-meta">
        <span className="pill">{PLATFORM[ad.platform] ?? ad.platform}</span>
        {ad.format ? <span className="muted">{FORMAT[ad.format] ?? ad.format}</span> : null}
        {since ? <span className={ad.active ? "ad-live" : "muted"}>{since}</span> : null}
        {ad.reach ? <span className="muted">Portée {ad.reach}</span> : null}
        <a href={ad.url} target="_blank" rel="noreferrer" className="card-link ad-open">Voir la pub</a>
      </div>
      {ad.headline ? <strong className="ad-headline">{ad.headline}</strong> : null}
      {ad.body ? <p className="ad-body">{ad.body}</p> : null}
      {ad.angle || ad.promise || ad.hook || ad.audience || ad.cta ? (
        <dl className="ad-analysis">
          {ad.angle ? <><dt>Angle</dt><dd>{ad.angle}</dd></> : null}
          {ad.promise ? <><dt>Promesse</dt><dd>{ad.promise}</dd></> : null}
          {ad.hook ? <><dt>Accroche</dt><dd>{ad.hook}</dd></> : null}
          {ad.audience ? <><dt>Public visé</dt><dd>{ad.audience}</dd></> : null}
          {ad.cta ? <><dt>Appel à l'action</dt><dd>{ad.cta}</dd></> : null}
        </dl>
      ) : null}
    </li>
  );
}

export default async function VeillePage({ searchParams }: { searchParams: Promise<{ venture?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const ventures = await listVentures(db);
  const venture = ventures.find((v) => v.slug === sp.venture) ?? ventures[0] ?? null;

  const [{ data: competitors }, { data: ads }, { data: summary }] = venture
    ? await Promise.all([
        db
          .from("competitors")
          .select("id, name, kind, website, linkedin_url, facebook_url, instagram_url, summary, profile, profiled_at")
          .eq("venture_id", venture.id)
          .order("kind")
          .order("name"),
        db
          .from("competitor_ads")
          .select("id, competitor_id, platform, url, started_at, last_seen_at, active, format, headline, body, cta, angle, hook, promise, audience, reach, competitors!inner(venture_id)")
          .eq("competitors.venture_id", venture.id)
          .order("active", { ascending: false, nullsFirst: false })
          .order("started_at", { ascending: true, nullsFirst: false })
          .limit(500),
        db.from("watch_summaries").select("content, created_at").eq("venture_id", venture.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }, { data: null }];

  const adsBy = new Map<string, Ad[]>();
  for (const a of (ads ?? []) as Ad[]) adsBy.set(a.competitor_id, [...(adsBy.get(a.competitor_id) ?? []), a]);
  const ask = (text: string) => `/nouvelle?prompt=${encodeURIComponent(text)}`;
  const name = venture?.name ?? "la venture";

  return (
    <>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          <AgentAvatar agent="veille" size={56} />
          <div>
            <h1 className="page-title">Veille</h1>
            <p className="page-sub">Les concurrents de {name}, leur positionnement et ce qu'ils mettent en avant dans leurs publicités.</p>
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {ventures.length > 1 ? (
            <form method="get" className="row" style={{ gap: 8 }}>
              <label className="sr-only" htmlFor="veille-venture">Venture</label>
              <select id="veille-venture" name="venture" defaultValue={venture?.slug}>
                {ventures.map((v) => <option key={v.id} value={v.slug}>{v.name}</option>)}
              </select>
              <button type="submit" className="btn btn-sm">Afficher</button>
            </form>
          ) : null}
          <a href={ask(`Veille ${name} : `)} className="btn btn-lime btn-sm">Demander une veille à Gyna</a>
        </div>
      </div>

      <section className="card card-pad stack" aria-labelledby="synthese">
        <div className="card-head">
          <h2 id="synthese">Synthèse</h2>
          {summary ? <span className="muted">Mise à jour le {fmt(summary.created_at)}</span> : null}
        </div>
        {summary ? (
          <div className="agent-sheet"><Markdown>{summary.content}</Markdown></div>
        ) : (
          <p className="muted">
            Pas encore de synthèse. Elle arrive à la fin d'une mission de veille : les angles qui reviennent, ce que personne ne dit, et ce que {name} peut en tirer.
          </p>
        )}
      </section>

      {competitors?.length ? (
        <div className="skill-grid">
          {competitors.map((c: any) => {
            const list = adsBy.get(c.id) ?? [];
            const active = list.filter((a) => a.active).length;
            const platforms = [...new Set(list.map((a) => PLATFORM[a.platform] ?? a.platform))];
            const links = [
              c.website && { href: c.website, label: host(c.website) },
              c.linkedin_url && { href: c.linkedin_url, label: "LinkedIn" },
              c.facebook_url && { href: c.facebook_url, label: "Facebook" },
              c.instagram_url && { href: c.instagram_url, label: "Instagram" },
            ].filter(Boolean) as Array<{ href: string; label: string }>;
            return (
              <section key={c.id} className="card skill-card" aria-labelledby={`comp-${c.id}`}>
                <div className="stack" style={{ gap: 6 }}>
                  <div className="row between">
                    <h2 id={`comp-${c.id}`} style={{ fontSize: 18, fontWeight: 600 }}>{c.name}</h2>
                    <span className={c.kind === "direct" ? "pill pill-hot" : "pill pill-cold"}>{c.kind === "direct" ? "Direct" : "Indirect"}</span>
                  </div>
                  {c.summary ? <p style={{ fontSize: 14, lineHeight: 1.5 }}>{c.summary}</p> : null}
                  {links.length ? (
                    <p className="comp-links">
                      {links.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>)}
                    </p>
                  ) : null}
                </div>
                <div className="stats">
                  <div className="stat"><span>Pubs observées</span><strong className="tabular">{list.length}</strong></div>
                  <div className="stat"><span>Encore actives</span><strong className="tabular">{active}</strong></div>
                  <div className="stat"><span>Plateformes</span><strong style={{ fontSize: 15 }}>{platforms.join(", ") || "–"}</strong></div>
                </div>
                {c.profile ? (
                  <details className="comp-details">
                    <summary>Fiche complète{c.profiled_at ? <span className="muted"> · {fmt(c.profiled_at)}</span> : null}</summary>
                    <div className="agent-sheet"><Markdown>{c.profile}</Markdown></div>
                  </details>
                ) : (
                  <p className="muted" style={{ fontSize: 13 }}>Fiche pas encore rédigée.</p>
                )}
                {list.length ? (
                  <details className="comp-details" open={list.length <= 3}>
                    <summary>{list.length} pub{list.length > 1 ? "s" : ""}, les plus anciennes encore actives d'abord</summary>
                    <ul className="ad-list">{list.map((a) => <AdItem key={a.id} ad={a} />)}</ul>
                  </details>
                ) : (
                  <p className="muted" style={{ fontSize: 13 }}>Aucune pub trouvée dans les bibliothèques publicitaires pour l'instant.</p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <section className="card card-pad stack">
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Aucun concurrent suivi</h2>
          <p className="muted">
            Donnez à Gyna les concurrents de {name} (nom et site), ou laissez la Veille les identifier. Elle lit leurs sites et leurs pubs dans les bibliothèques publicitaires de Meta, LinkedIn et Google.
          </p>
          <div className="row">
            <a href={ask(`Veille ${name} : identifie nos principaux concurrents, analyse leur positionnement et leurs publicités, puis fais la synthèse.`)} className="btn btn-dark btn-sm">
              Lancer une première veille
            </a>
            <Link href="/agents/veille" className="card-link">Voir l'agent Veille</Link>
          </div>
        </section>
      )}
    </>
  );
}
