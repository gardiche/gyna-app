import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { AGENTS, type AgentName } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { AGENT_PROFILES } from "@/lib/agents";
import { teamStatus } from "@/lib/data";
import { env } from "@/lib/env";
import { Markdown } from "@/components/Markdown";

export const dynamic = "force-dynamic";

const fmt = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));
const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

type Stat = { label: string; value: string };

/** Quelques chiffres sur le travail de l'agent, sur 30 jours ou depuis le début. */
async function statsFor(db: SupabaseClient, key: AgentName): Promise<Stat[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  if (key === "gyna") {
    const { data } = await db.from("missions").select("cost_eur, status").gte("started_at", since);
    const cost = (data ?? []).reduce((s, m) => s + Number(m.cost_eur), 0);
    return [
      { label: "Missions sur 30 jours", value: String(data?.length ?? 0) },
      { label: "Dépensé sur 30 jours", value: eur(cost) },
      { label: "Missions en échec", value: String((data ?? []).filter((m) => m.status === "failed").length) },
    ];
  }
  if (key === "sourcing") {
    const [{ count: recent }, { count: total }] = await Promise.all([
      db.from("prospect_ventures").select("id", { count: "exact", head: true }).gte("created_at", since),
      db.from("prospect_ventures").select("id", { count: "exact", head: true }),
    ]);
    return [
      { label: "Profils trouvés sur 30 jours", value: String(recent ?? 0) },
      { label: "Profils au total", value: String(total ?? 0) },
    ];
  }
  if (key === "qualification") {
    const { data } = await db.from("prospect_ventures").select("heat, status").not("heat", "is", null);
    const n = (h: string) => (data ?? []).filter((r) => r.heat === h).length;
    return [
      { label: "Chauds", value: String(n("hot")) },
      { label: "Tièdes", value: String(n("warm")) },
      { label: "Froids", value: String(n("cold")) },
      { label: "Écartés", value: String((data ?? []).filter((r) => r.status === "discarded").length) },
    ];
  }
  const { data } = await db.from("drafts").select("status, body, original_body");
  const decided = (data ?? []).filter((d) => d.status !== "pending");
  const asIs = decided.filter((d) => d.status !== "rejected" && d.body === d.original_body).length;
  return [
    { label: "Brouillons rédigés", value: String(data?.length ?? 0) },
    { label: "Approuvés sans retouche", value: decided.length ? `${Math.round((asIs / decided.length) * 100)} %` : "–" },
    { label: "Corrigés", value: String(decided.filter((d) => d.status !== "rejected" && d.body !== d.original_body).length) },
    { label: "Refusés", value: String(decided.filter((d) => d.status === "rejected").length) },
  ];
}

export default async function AgentPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!(AGENTS as readonly string[]).includes(key)) notFound();
  const agent = AGENT_PROFILES[key as AgentName];
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;

  const [status, stats, { data: skills }, { data: actions }, { data: feedback }] = await Promise.all([
    teamStatus(db),
    statsFor(db, agent.key),
    db.from("skills").select("slug, name, agent, active").or(`agent.eq.${agent.key},agent.is.null`).order("agent", { nullsFirst: true }).order("name"),
    db.from("actions").select("id, result_summary, tool, status, created_at, mission_id").eq("agent", agent.key).order("created_at", { ascending: false }).limit(12),
    agent.key === "redaction" || agent.key === "qualification"
      ? db.from("drafts").select("id, status, body, original_body, rejection_reason, decided_at").not("decided_at", "is", null).order("decided_at", { ascending: false }).limit(30)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const me = status[agent.key];
  const lessons = (feedback ?? []).filter((d: any) => d.status === "rejected" || d.body !== d.original_body).slice(0, 5);
  const askGyna = `/nouvelle?prompt=${encodeURIComponent(`Je voudrais faire évoluer le travail de l'agent ${agent.name} : `)}`;

  return (
    <>
      <div className="agent-head">
        <span className="agent-avatar agent-avatar-lg" style={{ background: agent.color, color: agent.fg }} aria-hidden="true">
          {agent.initials}
          {me.live ? <span className="agent-live" /> : null}
        </span>
        <div className="stack" style={{ gap: 6 }}>
          <div className="row">
            <h1 className="page-title" style={{ fontSize: 32 }}>{agent.name}</h1>
            <span className="pill pill-lime">{agent.tag}</span>
            {me.live ? <span className="pill pill-lavender">Au travail</span> : null}
          </div>
          <p className="page-sub" style={{ marginTop: 0 }}>{agent.summary}</p>
          <p className="on-shell-muted" style={{ fontSize: 13 }}>
            Modèle : celui de la conversation ({env.defaultModel().replace(/^.*\//, "")} par défaut)
            {agent.key === "gyna" ? "" : ", transmis par Gyna à chaque délégation"}.
          </p>
        </div>
      </div>

      <div className="workspace">
        <div className="card-main stack" style={{ gap: 20 }}>
          <section className="card card-pad stack" aria-labelledby="role">
            <div className="card-head">
              <h2 id="role">Rôle et méthode</h2>
              <span className="muted">Fiche reçue par l'agent à chaque mission</span>
            </div>
            <div className="agent-sheet"><Markdown>{agent.sheet}</Markdown></div>
          </section>

          <section className="card card-pad stack" aria-labelledby="activity">
            <div className="card-head">
              <h2 id="activity">Activité</h2>
              <Link href={`/journal?agent=${agent.key}`} className="card-link">Tout le journal</Link>
            </div>
            <div className="stats">
              {stats.map((s) => (
                <div key={s.label} className="stat"><span>{s.label}</span><strong className="tabular">{s.value}</strong></div>
              ))}
            </div>
            {actions?.length ? (
              <ul className="activity-list">
                {actions.map((a) => (
                  <li key={a.id}>
                    <span className="tabular muted">{fmt(a.created_at)}</span>
                    <span>
                      {a.result_summary ?? a.tool}
                      {a.status !== "ok" ? <span className="pill pill-hot" style={{ marginLeft: 8 }}>Erreur</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Aucune action journalisée pour l'instant.</p>
            )}
          </section>

          {agent.key === "redaction" || agent.key === "qualification" ? (
            <section className="card card-pad stack" aria-labelledby="feedback">
              <div className="card-head">
                <h2 id="feedback">Retours des associés</h2>
                <span className="muted">Relus par l'agent avant chaque tâche</span>
              </div>
              {lessons.length ? (
                <ul className="lessons">
                  {lessons.map((d: any) => (
                    <li key={d.id}>
                      <div className="row between">
                        <span className={d.status === "rejected" ? "pill pill-hot" : "pill pill-lime"}>{d.status === "rejected" ? "Refusé" : "Corrigé"}</span>
                        <span className="muted">{fmt(d.decided_at)}</span>
                      </div>
                      {d.status === "rejected" ? (
                        <p>{d.rejection_reason ? `« ${d.rejection_reason} »` : <span className="muted">Sans raison donnée.</span>}</p>
                      ) : (
                        <div className="lesson-diff">
                          <p><span className="muted">Proposé</span>{clip(d.original_body)}</p>
                          <p><span className="muted">Envoyé</span>{clip(d.body)}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Pas encore de correction ni de refus. Les retours apparaissent ici dès qu'un associé corrige ou refuse un brouillon.</p>
              )}
            </section>
          ) : null}
        </div>

        <aside>
          <section className="card-lime" style={{ paddingBottom: 22 }} aria-labelledby="skills">
            <div className="card-head">
              <h2 id="skills">Skills</h2>
              <Link href="/skills" className="card-link">Gérer</Link>
            </div>
            {skills?.length ? (
              <ul className="side-list">
                {skills.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/skills/${s.slug}`} className="side-inset side-item" style={{ opacity: s.active ? 1 : 0.55 }}>
                      <span>{s.name}</span>
                      <span className="pill" style={{ background: "#fff" }}>{!s.active ? "Désactivé" : s.agent ? "Le sien" : "Partagé"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 14 }}>Aucun skill pour cet agent.</p>
            )}
          </section>

          <section className="card-lavender" aria-labelledby="tools">
            <h2 id="tools" style={{ fontSize: 16, fontWeight: 600 }}>Outils</h2>
            <ul className="tool-list">
              {agent.tools.map((t) => (
                <li key={t.name}><strong>{t.name}</strong><span>{t.detail}</span></li>
              ))}
            </ul>
          </section>

          <section className="card card-pad stack">
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Le faire évoluer</h2>
            <p className="muted" style={{ fontSize: 14 }}>
              Décrivez à Gyna ce qui doit changer. Elle propose un skill nouveau ou modifié, qu'un associé valide avant qu'il ne s'applique.
            </p>
            <a href={askGyna} className="btn btn-dark">Demander à Gyna</a>
          </section>
        </aside>
      </div>
    </>
  );
}
