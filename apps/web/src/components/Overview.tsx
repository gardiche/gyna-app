import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HEAT_LABEL, type Heat } from "@gyna/schemas";
import { cumulative, draftHeats, pendingApprovals, ventureFunnel, type AgentKey, type MissionSummary, type Venture } from "@/lib/data";

const AGENTS: Array<{ key: AgentKey; label: string }> = [
  { key: "sourcing", label: "Sourcing" },
  { key: "qualification", label: "Qualification" },
  { key: "redaction", label: "Rédaction" },
];
const HEAT_PILL: Record<Heat, string> = { hot: "pill pill-hot", warm: "pill pill-warm", cold: "pill pill-cold" };
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

/** Colonne de droite : suivi de mission, validations en attente, avancement de la venture. */
export async function Overview({ db, venture, mission, budgetEur }: { db: SupabaseClient; venture: Venture | null; mission: MissionSummary | null; budgetEur: number }) {
  const [funnel, pending] = await Promise.all([
    venture ? ventureFunnel(db, venture.id) : Promise.resolve(null),
    pendingApprovals(db, 4),
  ]);
  const heats = await draftHeats(db, pending.filter((a) => a.kind === "draft").map((a) => a.ref_id));
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
          {AGENTS.map((a) => {
            const last = mission?.agents[a.key] ?? null;
            return (
              <li key={a.key}>
                <strong>{a.label}</strong>
                <span title={last ?? undefined}>{last ?? (mission ? "N'est pas intervenu" : "En attente d'une mission")}</span>
              </li>
            );
          })}
        </ul>
        <p className="side-note">{mission ? timing(mission) : "Confiez une mission à Gyna pour suivre ici le travail des agents."}</p>
      </section>

      <section className="side-card side-lime" aria-label="À valider">
        <h2>À valider{pending.length ? <span className="pill pill-ink">{pending.length}</span> : null}</h2>
        {pending.length === 0 ? (
          <p className="side-note">Rien en attente. Les brouillons de Gyna arrivent ici.</p>
        ) : (
          <ul className="side-list">
            {pending.map((a) => {
              const heat = a.kind === "draft" ? heats.get(a.ref_id) ?? null : null;
              return (
                <li key={a.id}>
                  <Link href="/validations" className="side-inset side-item">
                    <span>{a.summary}</span>
                    {a.kind === "mission_budget" ? <span className="pill pill-warm">Budget</span> : a.kind === "skill_update" ? <span className="pill pill-lavender">Skill</span> : heat ? <span className={HEAT_PILL[heat]}>{HEAT_LABEL[heat]}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/validations" className="card-link">Ouvrir la file de validation</Link>
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
