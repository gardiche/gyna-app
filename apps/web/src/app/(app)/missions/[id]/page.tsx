import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { AGENT_LABEL, details } from "@/lib/work-details";

export const dynamic = "force-dynamic";

const TZ = "Europe/Paris";
const clock = (d: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ }).format(new Date(d));
const since = (d: string, start: string) => {
  const s = Math.max(0, Math.round((new Date(d).getTime() - new Date(start).getTime()) / 1000));
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const STATUS: Record<string, string> = { running: "En cours", done: "Terminée", failed: "Échouée", awaiting_approval: "Attend un accord", cancelled: "Annulée" };
const TASK_STATUS: Record<string, string> = { open: "En cours", done: "Rendue", partial: "Rendue en partie", failed: "Échouée" };
const nf = (n: unknown) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));

/** Une mission racontée de bout en bout : la demande, les fiches de tâche, ce que chaque agent a fait et quand, ce qui en est sorti. */
export default async function MissionWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.fullMember) redirect("/login");
  const db = session.supabase;

  const { data: m } = await db
    .from("missions")
    .select("id, status, objective, created_at, ended_at, started_at, cost_eur, budget_cap_eur, usage, sandbox, conversation_id, ventures(name, slug)")
    .eq("id", id)
    .maybeSingle();
  if (!m) notFound();

  const [{ data: messages }, { data: tasks }, { data: actions }, { count: foundCount }, { data: lists }, { count: draftCount }] = await Promise.all([
    db.from("messages").select("role, content, created_at").eq("mission_id", id).order("created_at"),
    db.from("agent_tasks").select("seq, agent, status, objective, background, criteria, exclusions, scope, deliverable, budget_eur, understood, result, created_at, completed_at").eq("mission_id", id).order("seq"),
    db.from("actions").select("id, agent, tool, input, result_summary, status, cost_eur, created_at").eq("mission_id", id).order("created_at"),
    db.from("prospect_ventures").select("id", { count: "exact", head: true }).eq("mission_id", id),
    db.from("prospect_lists").select("seq, name, prospect_list_members(count)").eq("mission_id", id),
    db.from("drafts").select("id", { count: "exact", head: true }).eq("mission_id", id),
  ]);

  const start = m.started_at ?? m.created_at;
  const end = m.ended_at ?? new Date().toISOString();
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
  const usage = (m.usage ?? {}) as Record<string, unknown>;
  const tokens = Number(usage.total ?? 0) + Number(usage.subagent_tokens ?? 0);
  const venture = m.ventures as unknown as { name: string; slug: string } | null;
  const asked = (messages ?? []).find((x) => x.role === "user");
  const answers = (messages ?? []).filter((x) => x.role === "assistant");

  return (
    <>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Les agents au travail</h1>
          <p className="page-sub">
            {venture?.name ?? "Sans venture"} · {STATUS[m.status] ?? m.status} · {minutes} min · {nf(tokens)} jetons · {Number(m.cost_eur ?? 0).toFixed(2)} € d'outils sur {Number(m.budget_cap_eur ?? 0).toFixed(2)} €
            {m.sandbox ? " · mission d'essai" : ""}
          </p>
        </div>
        <Link href={`/c/${m.conversation_id}`} className="btn">Retour au chat</Link>
      </div>

      <section className="card card-pad stack">
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>La demande</h2>
        <p className="draft-body" style={{ whiteSpace: "pre-wrap" }}>{asked?.content ?? m.objective}</p>
      </section>

      <section className="card card-pad stack">
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Fiches de tâche ({tasks?.length ?? 0})</h2>
        {!tasks?.length ? <p className="muted">Gyna n'a pas écrit de fiche pour cette mission : pas de délégation, ou une délégation sans fiche.</p> : null}
        {(tasks ?? []).map((t: any) => {
          const r = (t.result ?? {}) as { summary?: string; counts?: Record<string, number>; cost_eur?: number };
          return (
            <article key={t.seq} className="task-card">
              <div className="row between">
                <strong>T{t.seq} · {AGENT_LABEL[t.agent] ?? t.agent}</strong>
                <span className={t.status === "done" ? "pill pill-lime" : t.status === "failed" ? "pill pill-hot" : "pill"}>{TASK_STATUS[t.status] ?? t.status}</span>
              </div>
              <p>{t.objective}</p>
              <dl className="task-fields">
                <div><dt>Contexte retenu</dt><dd>{t.background}</dd></div>
                {t.criteria?.length ? <div><dt>Critères de l'associé</dt><dd><ul>{t.criteria.map((c: string) => <li key={c}>{c}</li>)}</ul></dd></div> : null}
                {t.exclusions?.length ? <div><dt>Exclusions</dt><dd><ul>{t.exclusions.map((c: string) => <li key={c}>{c}</li>)}</ul></dd></div> : null}
                <div><dt>Périmètre</dt><dd>{t.scope}</dd></div>
                <div><dt>Livrable attendu</dt><dd>{t.deliverable}</dd></div>
              </dl>
              {t.understood ? <div className="task-answer"><strong>Ce que l'agent a compris</strong><p>{t.understood}</p></div> : null}
              {r.summary ? (
                <div className="task-answer">
                  <strong>Compte rendu de l'agent</strong>
                  <p style={{ whiteSpace: "pre-wrap" }}>{r.summary}</p>
                  {r.counts && Object.keys(r.counts).length ? <p className="muted">{Object.entries(r.counts).map(([k, v]) => `${k} : ${v}`).join(" · ")}{r.cost_eur !== undefined ? ` · coût ${Number(r.cost_eur).toFixed(2)} €` : ""}</p> : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      <section className="card card-pad stack">
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Déroulé ({actions?.length ?? 0} gestes)</h2>
        <p className="muted" style={{ fontSize: 13 }}>Ce qui passe par les outils de Gyna, dans l'ordre et à la minute près. Les recherches web des agents ne sont pas listées ici.</p>
        <ol className="work-steps">
          {(actions ?? []).map((a: any) => {
            const d = details(a.input);
            return (
              <li key={a.id}>
                <span className="work-time tabular" title={clock(a.created_at)}>{since(a.created_at, start)}</span>
                <span className="work-agent">{AGENT_LABEL[a.agent] ?? a.agent}</span>
                <span className="work-what">
                  <strong>{a.tool.replace(/_/g, " ")}</strong> {a.result_summary ? <span className="muted">· {a.result_summary}</span> : null}
                  {a.status !== "ok" ? <span className="pill pill-hot" style={{ marginLeft: 8 }}>Erreur</span> : null}
                  {Number(a.cost_eur) > 0 ? <span className="pill" style={{ marginLeft: 8 }}>{Number(a.cost_eur).toFixed(2)} €</span> : null}
                  {d.length ? (
                    <details>
                      <summary><small>Détail</small></summary>
                      <dl className="stack" style={{ gap: 6, marginTop: 6 }}>
                        {d.map(([k, v]) => <div key={k}><dt><small><strong>{k}</strong></small></dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}><small>{v}</small></dd></div>)}
                      </dl>
                    </details>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card card-pad stack">
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Ce que la mission a produit</h2>
        <ul className="work-out">
          <li><strong>{foundCount ?? 0}</strong> prospect{(foundCount ?? 0) > 1 ? "s" : ""} enregistré{(foundCount ?? 0) > 1 ? "s" : ""} ou rattaché{(foundCount ?? 0) > 1 ? "s" : ""} à la venture par cette mission</li>
          {((lists ?? []) as any[]).map((l) => <li key={l.seq}>Liste <strong>L{l.seq} « {l.name} »</strong> : {l.prospect_list_members?.[0]?.count ?? 0} personne{(l.prospect_list_members?.[0]?.count ?? 0) > 1 ? "s" : ""}</li>)}
          <li><strong>{draftCount ?? 0}</strong> brouillon{(draftCount ?? 0) > 1 ? "s" : ""} de message</li>
          <li><Link href={`/prospects?venture=${venture?.slug ?? ""}&source=${id}`}>Voir ses prospects dans la page Prospects</Link></li>
        </ul>
      </section>

      {answers.length ? (
        <section className="card card-pad stack">
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Ce que Gyna a répondu</h2>
          {answers.map((x, i) => <details key={i} open={i === answers.length - 1}><summary><small>{clock(x.created_at)}</small></summary><p className="draft-body" style={{ whiteSpace: "pre-wrap" }}>{x.content}</p></details>)}
        </section>
      ) : null}
    </>
  );
}
