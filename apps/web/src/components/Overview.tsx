import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AgentAvatar } from "./AgentAvatar";
import { QuotaBars } from "./QuotaBars";
import { cumulative, usageTotals, ventureFunnel, type AgentKey, type MissionSummary, type Venture } from "@/lib/data";

const AGENTS: Array<{ key: AgentKey; label: string }> = [
  { key: "sourcing", label: "Sourcing" },
  { key: "qualification", label: "Qualification" },
  { key: "redaction", label: "Rédaction" },
  { key: "veille", label: "Veille" },
  { key: "ads", label: "Ads" },
  { key: "campagnes", label: "Campagnes" },
];
// Affichés seulement quand ils sont intervenus dans la mission.
const OPTIONAL: AgentKey[] = ["veille", "ads", "campagnes"];
/** « 1,2 M », « 48 k », « 950 » : un nombre de tokens lisible d'un coup d'œil. */
function tokens(n: number): string {
  const f = (v: number, d: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }).format(v);
  return n >= 1e6 ? `${f(n / 1e6, 2)} M` : n >= 1e3 ? `${f(n / 1e3, n >= 1e5 ? 0 : 1)} k` : f(n, 0);
}
/** Début de la journée à Paris, en UTC. */
function startOfToday(): string {
  const now = new Date();
  const paris = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  paris.setHours(0, 0, 0, 0);
  return new Date(now.getTime() - (new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" })).getTime() - paris.getTime())).toISOString();
}
const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

const MISSION_TITLE: Record<MissionSummary["status"], string> = {
  running: "Mission en cours",
  awaiting_approval: "Mission en pause",
  done: "Dernière mission, terminée",
  failed: "Dernière mission, en échec",
  cancelled: "Dernière mission, arrêtée",
};

function minutes(from: string, to: string | null): number {
  return Math.max(0, Math.round(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60_000));
}
const fmtMin = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);

function timing(m: MissionSummary): string {
  if (m.status === "running" || m.status === "awaiting_approval") {
    const min = minutes(m.started_at, null);
    return min < 1 ? "Démarrée à l'instant" : `Démarrée il y a ${fmtMin(min)}`;
  }
  const day = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(m.started_at));
  return `Le ${day}${m.ended_at ? `, ${fmtMin(minutes(m.started_at, m.ended_at))}` : ""}`;
}

/** Colonne de droite : suivi de mission, consommation, avancement de la venture. */
export async function Overview({ db, venture, mission, budgetEur }: { db: SupabaseClient; venture: Venture | null; mission: MissionSummary | null; budgetEur: number }) {
  const [funnel, today, week] = await Promise.all([
    venture ? ventureFunnel(db, venture.id) : Promise.resolve(null),
    usageTotals(db, startOfToday()),
    usageTotals(db, new Date(Date.now() - 7 * 86_400_000).toISOString()),
  ]);
  const u = mission?.usage ?? null;
  const live = mission?.status === "running";
  const steps = funnel ? cumulative(funnel) : null;
  const used = mission ? Math.min(100, Math.round((mission.cost_eur / Math.max(mission.budget_cap_eur, 0.01)) * 100)) : 0;

  return (
    <aside className="side" aria-label="Vue d'ensemble">
      <section className="side-card side-lavender" aria-label="Suivi de mission">
        <h2>
          {mission?.status === "running" ? <span className="dot dot-ink" aria-hidden="true" /> : null}
          {mission ? MISSION_TITLE[mission.status] : "Aucune mission pour l'instant"}
        </h2>
        <div className="side-inset">
          <div className="kv">
            <span>Budget</span>
            <strong className="tabular">{mission ? `${eur(mission.cost_eur)} sur ${eur(mission.budget_cap_eur)}` : `${eur(0)} sur ${eur(budgetEur)}`}</strong>
          </div>
          <div className="meter" role="img" aria-label={`Budget consommé : ${used} %`}><span style={{ width: `${used}%` }} /></div>
        </div>
        {mission?.status === "awaiting_approval" ? (
          <p className="side-note">Budget dépassé : la mission attend l'accord d'un associé. <Link href="/validations">Décider</Link></p>
        ) : null}
        <ul className="agents">
          {AGENTS.filter((a) => !OPTIONAL.includes(a.key) || mission?.agents[a.key]).map((a) => {
            const last = mission?.agents[a.key] ?? null;
            return (
              <li key={a.key}>
                <strong className="agent-name"><AgentAvatar agent={a.key} size={22} working={mission?.status === "running" && !!last} />{a.label}</strong>
                <span title={last ?? undefined}>{last ?? (mission ? "N'est pas intervenu" : "En attente d'une mission")}</span>
              </li>
            );
          })}
        </ul>
        <p className="side-note">{mission ? timing(mission) : "Confiez une mission à Gyna pour suivre ici le travail des agents."}</p>
      </section>

      <section className="side-card side-lime" aria-label="Consommation">
        <h2>
          {live ? <span className="dot dot-ink" aria-hidden="true" /> : null}
          Consommation
        </h2>
        <div className="side-inset">
          <div className="kv">
            <span>{live ? "Mission en cours" : "Dernière mission"}</span>
            <strong className="tabular">{u ? `${tokens(u.total + u.subagent_tokens)} tokens` : "–"}</strong>
          </div>
          {u ? (
            <ul className="usage-detail">
              <li><span>Gyna</span><span className="tabular">{tokens(u.total)}, {u.calls} appel{u.calls > 1 ? "s" : ""}</span></li>
              <li><span>Entrée / sortie</span><span className="tabular">{tokens(u.input)} / {tokens(u.output)}</span></li>
              {u.reasoning ? <li><span>Dont réflexion</span><span className="tabular">{tokens(u.reasoning)}</span></li> : null}
              <li>
                <span>Sous-agents</span>
                <span className="tabular">
                  {u.subagent_runs
                    ? u.subagent_tokens ? `${tokens(u.subagent_tokens)}, ${u.subagent_runs} tâche${u.subagent_runs > 1 ? "s" : ""}` : `${u.subagent_runs} tâche${u.subagent_runs > 1 ? "s" : ""}, tokens non transmis`
                    : "aucun"}
                </span>
              </li>
              {u.cache_hit_pct !== undefined ? <li><span>Lu depuis le cache</span><span className="tabular">{u.cache_hit_pct} %</span></li> : null}
            </ul>
          ) : (
            <p className="side-note">{mission ? "Pas de relevé pour cette mission." : "Le relevé arrive dès la première mission."}</p>
          )}
        </div>
        <div className="side-inset">
          <ul className="usage-detail">
            <li><span>Aujourd'hui</span><span className="tabular">{tokens(today.tokens)} tokens, {eur(today.apify_eur)} d'Apify</span></li>
            <li><span>7 derniers jours</span><span className="tabular">{tokens(week.tokens)} tokens, {eur(week.apify_eur)} d'Apify</span></li>
          </ul>
        </div>
        <QuotaBars />
        {u?.model ? <p className="side-note">Modèle : {u.model.replace(/^.*\//, "")}</p> : null}
      </section>

      <section className="side-card side-white" aria-label={venture ? `Avancement de ${venture.name}` : "Avancement"}>
        <div className="card-head">
          <h2>{venture?.name ?? "Ventures"}</h2>
          {venture ? <Link href={`/prospects?venture=${venture.slug}`} className="card-link">Prospects</Link> : null}
        </div>
        {funnel && steps ? (
          <>
            <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
              <span className="side-big tabular">{steps.enrolled}</span>
              <span className="muted" style={{ paddingBottom: 3 }}>
                {venture?.enrollment_goal ? `inscrits sur un objectif de ${venture.enrollment_goal}` : "inscrits"}
              </span>
            </div>
            <ul className="side-funnel">
              <li><span>À examiner</span><strong className="tabular">{steps.to_review}</strong></li>
              <li><span>Qualifiés</span><strong className="tabular">{steps.qualified}</strong></li>
              <li><span>Contactés</span><strong className="tabular">{steps.contacted}</strong></li>
              <li><span>Ont répondu</span><strong className="tabular">{steps.replied}</strong></li>
            </ul>
            <Link href="/dashboard" className="card-link">Tableau de bord</Link>
          </>
        ) : (
          <p className="muted">Créez une venture pour suivre ses prospects. <Link href="/ventures" className="card-link">Ventures</Link></p>
        )}
      </section>
    </aside>
  );
}
