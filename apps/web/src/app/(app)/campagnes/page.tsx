import Link from "next/link";
import { redirect } from "next/navigation";
import { CAMPAIGN_DOC_KINDS, CAMPAIGN_DOC_LABEL } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { listVentures } from "@/lib/data";
import { Markdown } from "@/components/Markdown";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PilotCard, type PilotState } from "@/components/PilotCard";
import { parisNow, pilotGuardReady } from "@/lib/pilot";
import { pilotReport } from "@/lib/pilot-report";
import { PilotDashboard, type DashboardAction } from "@/components/PilotDashboard";

export const dynamic = "force-dynamic";

type Kind = (typeof CAMPAIGN_DOC_KINDS)[number];
interface Doc { id: string; kind: Kind; title: string; content: string; created_at: string }

const fmt = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));

const EMPTY: Record<Kind, string> = {
  mesure: "Ce qu'il faut poser sur le site et dans chaque plateforme avant de dépenser : événements, liens balisés, consentement, vérifications.",
  plan: "Plateformes, structure des campagnes, budget, coût visé par pré-inscription, règles pour couper ou pousser une pub, liste de contrôle avant lancement.",
  bilan: "La lecture des résultats que vous lui donnez : ce qui marche, ce qui ne marche pas, et les changements proposés, chacun avec son retour en arrière.",
};

export default async function CampagnesPage({ searchParams }: { searchParams: Promise<{ venture?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const ventures = await listVentures(db);
  const venture = ventures.find((v) => v.slug === sp.venture) ?? ventures[0] ?? null;

  const [{ data: rows }, { count: approved }] = venture
    ? await Promise.all([
        db.from("campaign_docs").select("id, kind, title, content, created_at").eq("venture_id", venture.id).order("created_at", { ascending: false }).limit(40),
        db.from("ads").select("id, ad_batches!inner(venture_id, kind)", { count: "exact", head: true }).eq("ad_batches.venture_id", venture.id).eq("ad_batches.kind", "ad").eq("status", "approved"),
      ])
    : [{ data: [] as Doc[] }, { count: 0 }];
  const docs = (rows ?? []) as Doc[];
  // Pilotage autonome : l'enveloppe, et les pubs Meta approuvées (prêtes si elles ont un visuel, lancées si l'agent l'a déclaré).
  const [{ data: pilotRow }, { data: metaAds }] = venture
    ? await Promise.all([
        db.from("ad_pilots").select("status, total_budget_eur, target_cost_eur, starts_on, ends_on, last_run_on, conversation_id").eq("venture_id", venture.id).maybeSingle(),
        db.from("ads").select("id, headline, external_id, external_status, ad_images(id), ad_batches!inner(venture_id, kind, platform)").eq("ad_batches.venture_id", venture.id).eq("ad_batches.kind", "ad").eq("ad_batches.platform", "meta").eq("status", "approved"),
      ])
    : [{ data: null }, { data: [] }];
  const pilot = pilotRow
    ? ({ ...pilotRow, total_budget_eur: Number(pilotRow.total_budget_eur), target_cost_eur: pilotRow.target_cost_eur === null ? null : Number(pilotRow.target_cost_eur) } as PilotState)
    : null;
  const ready = (metaAds ?? []).filter((a: any) => a.ad_images?.length).length;
  const launched = (metaAds ?? []).filter((a: any) => a.external_status === "active").length;

  // Suivi : les chiffres de Meta sur la période de l'enveloppe, et les derniers gestes de l'agent.
  const today = parisNow().day;
  const started = Boolean(pilot && today >= pilot.starts_on);
  const until = pilot && today > pilot.ends_on ? pilot.ends_on : today;
  const [report, { data: recent }] = pilot && started
    ? await Promise.all([
        pilotReport(pilot.starts_on, until),
        db.from("actions").select("id, created_at, result_summary, status")
          .in("tool", ["record_ad_launch", "log_action", "save_campaign_doc", "subagent_complete", "pilot_start", "pilot_stop"])
          .in("agent", ["campagnes", "associe"])
          .gte("created_at", `${pilot.starts_on}T00:00:00Z`)
          .order("created_at", { ascending: false })
          .limit(10),
      ])
    : [null, { data: [] as DashboardAction[] }];
  const daysLeft = pilot ? Math.max(Math.round((Date.parse(pilot.ends_on) - Date.parse(today)) / 86_400_000) + 1, 0) : 0;
  const name = venture?.name ?? "la venture";
  const ask = (text: string) => `/nouvelle?prompt=${encodeURIComponent(text)}`;
  const PROMPT: Record<Kind, string> = {
    mesure: `Campagnes ${name} : prépare le plan de mesure pour Meta, Google et LinkedIn. Le site est sur Lovable et rien n'est encore installé.`,
    plan: `Campagnes ${name} : prépare le plan de campagne à partir des pubs approuvées. Budget : `,
    bilan: `Campagnes ${name} : fais le bilan à partir de ces chiffres et dis-moi quoi couper, garder ou pousser.\n\n`,
  };

  return (
    <>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          <AgentAvatar agent="campagnes" size={56} />
          <div>
            <h1 className="page-title">Campagnes</h1>
            <p className="page-sub">La mesure, la structure et le pilotage des pubs de {name}. Sur Meta, l'agent peut lancer et piloter seul les pubs que vous avez approuvées, dans l'enveloppe que vous fixez ; ailleurs, il propose et vous appliquez.</p>
          </div>
        </div>
        {ventures.length > 1 ? (
          <form method="get" className="row" style={{ gap: 8 }}>
            <label className="sr-only" htmlFor="camp-venture">Venture</label>
            <select id="camp-venture" name="venture" defaultValue={venture?.slug}>
              {ventures.map((v) => <option key={v.id} value={v.slug}>{v.name}</option>)}
            </select>
            <button type="submit" className="btn btn-sm">Afficher</button>
          </form>
        ) : null}
      </div>

      <div className="stats">
        <div className="stat"><span>Pubs approuvées à diffuser</span><strong className="tabular">{approved ?? 0}</strong></div>
        <div className="stat"><span>Bilans</span><strong className="tabular">{docs.filter((d) => d.kind === "bilan").length}</strong></div>
        <div className="stat">
          <span>Dernier bilan</span>
          <strong style={{ fontSize: 15 }}>{docs.find((d) => d.kind === "bilan") ? fmt(docs.find((d) => d.kind === "bilan")!.created_at) : "–"}</strong>
        </div>
      </div>
      {approved ? null : (
        <p className="notice">
          Aucune pub approuvée pour {name} : le plan de campagne s'appuie sur les pubs que vous validez. <Link href="/pubs" className="card-link">Ouvrir les pubs</Link>
        </p>
      )}

      {venture ? <PilotCard key={venture.id} ventureId={venture.id} ventureName={name} pilot={pilot} ready={ready} launched={launched} guard={pilotGuardReady()} /> : null}
      {pilot && report && "error" in report ? <p className="notice notice-error">Meta n'a pas répondu pour le suivi de la campagne : {report.error}</p> : null}
      {pilot && report && !("error" in report) ? (
        <PilotDashboard
          report={report}
          budget={pilot.total_budget_eur}
          target={pilot.target_cost_eur}
          daysLeft={daysLeft}
          ads={(metaAds ?? []).map((a: any) => ({ external_id: a.external_id, headline: a.headline, ref: String(a.id).slice(0, 8) }))}
          actions={(recent ?? []) as DashboardAction[]}
        />
      ) : null}

      {CAMPAIGN_DOC_KINDS.map((kind) => {
        const all = docs.filter((d) => d.kind === kind);
        const current = all[0];
        return (
          <section key={kind} className="card card-pad stack" aria-labelledby={`doc-${kind}`}>
            <div className="card-head">
              <div className="row" style={{ gap: 10 }}>
                <h2 id={`doc-${kind}`} style={{ fontSize: 18, fontWeight: 600 }}>{CAMPAIGN_DOC_LABEL[kind]}</h2>
                {current ? <span className="muted">{current.title} · {fmt(current.created_at)}</span> : null}
              </div>
              <a href={ask(PROMPT[kind])} className={current ? "btn btn-sm" : "btn btn-dark btn-sm"}>
                {kind === "bilan" ? "Demander un bilan" : current ? "Mettre à jour" : "Demander à Gyna"}
              </a>
            </div>
            {current ? (
              <>
                <div className="agent-sheet"><Markdown>{current.content}</Markdown></div>
                {all.length > 1 ? (
                  <details className="comp-details">
                    <summary>{all.length - 1} version{all.length > 2 ? "s" : ""} précédente{all.length > 2 ? "s" : ""}</summary>
                    {all.slice(1).map((d) => (
                      <details key={d.id} className="comp-details">
                        <summary>{d.title}<span className="muted"> · {fmt(d.created_at)}</span></summary>
                        <div className="agent-sheet"><Markdown>{d.content}</Markdown></div>
                      </details>
                    ))}
                  </details>
                ) : null}
              </>
            ) : (
              <p className="muted">{EMPTY[kind]}</p>
            )}
          </section>
        );
      })}
    </>
  );
}
