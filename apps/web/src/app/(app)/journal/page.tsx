import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const AGENTS = ["gyna", "sourcing", "qualification", "redaction", "veille", "ads", "campagnes", "associe", "system"];
const LABEL: Record<string, string> = {
  gyna: "Gyna", sourcing: "Sourcing", qualification: "Qualification", redaction: "Rédaction", veille: "Veille", ads: "Ads", campagnes: "Campagnes", associe: "Associé", system: "Système",
};
/** Champs détaillés montrés sous une ligne : consigne et compte rendu des sous-agents, paramètres d'une recherche. */
const DETAIL_LABEL: Record<string, string> = {
  goal: "Tâche", context: "Consigne de Gyna", summary: "Compte rendu", status: "Statut",
  titles: "Intitulés cherchés", locations: "Lieux", max_profiles: "Nombre demandé", recent_only: "Moins d'un an dans le poste",
  small_companies: "Petites entreprises", company_sizes: "Tailles d'entreprise", industries: "Secteurs", keywords: "Mots-clés",
  segment: "Segment", queries: "Termes cherchés", location: "Lieu", radius_km: "Rayon (km)",
  list: "Liste", name: "Nom", purpose: "Usage", scale: "Échelle", added: "Ajoutés", updated: "Mis à jour", unknown: "Inconnus",
  task: "Tâche", objective: "Objectif", background: "Contexte retenu", criteria: "Critères de l'associé", exclusions: "Exclusions",
  scope: "Périmètre", deliverable: "Livrable attendu", budget_eur: "Budget (€)", understood: "Ce que l'agent a compris", counts: "Chiffres",
};

function details(input: unknown): Array<[string, string]> {
  if (!input || typeof input !== "object") return [];
  return Object.entries(input as Record<string, unknown>)
    .filter(([k, v]) => DETAIL_LABEL[k] && v !== null && v !== undefined && v !== "")
    .map(([k, v]) => [DETAIL_LABEL[k]!, Array.isArray(v) ? v.join(" ; ") : typeof v === "boolean" ? (v ? "oui" : "non") : typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([n, c]) => `${n} : ${c}`).join(", ") : String(v)]);
}

const fmt = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ agent?: string; mission?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  let q = session.supabase
    .from("actions")
    .select("id, agent, tool, input, result_summary, status, cost_eur, created_at, mission_id")
    .order("created_at", { ascending: false })
    .limit(300);
  if (sp.agent && AGENTS.includes(sp.agent)) q = q.eq("agent", sp.agent);
  if (sp.mission) q = q.eq("mission_id", sp.mission);
  const { data: rows } = await q;

  return (
    <>
      <div>
        <h1 className="page-title">Journal</h1>
        <p className="page-sub">Tout ce qu'ont fait les agents et les associés. Ces lignes ne peuvent être ni modifiées ni supprimées.</p>
      </div>
      <section className="card card-pad stack">
        <form className="filters" method="get">
          <label className="field">
            Agent
            <select name="agent" defaultValue={sp.agent ?? ""}>
              <option value="">Tous</option>
              {AGENTS.map((a) => <option key={a} value={a}>{LABEL[a]}</option>)}
            </select>
          </label>
          {sp.mission ? <input type="hidden" name="mission" value={sp.mission} /> : null}
          <button type="submit" className="btn btn-dark">Filtrer</button>
        </form>
        {!rows?.length ? (
          <p className="empty">Aucune action pour l'instant.</p>
        ) : (
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 640 }}>
              <thead><tr><th scope="col">Date</th><th scope="col">Agent</th><th scope="col">Action</th><th scope="col">Coût</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular" style={{ whiteSpace: "nowrap" }}>{fmt(r.created_at)}</td>
                    <td>{LABEL[r.agent] ?? r.agent}</td>
                    <td>
                      {r.result_summary ?? r.tool}
                      {r.status !== "ok" ? <span className="pill pill-hot" style={{ marginLeft: 8 }}>Erreur</span> : null}
                      {r.mission_id ? <small><a href={`/journal?mission=${r.mission_id}`}>Voir la mission</a></small> : null}
                      {(() => {
                        const d = details(r.input);
                        if (!d.length || (r.tool !== "subagent_start" && r.tool !== "subagent_complete" && r.tool !== "create_task" && r.tool !== "complete_task" && r.tool !== "create_list" && r.tool !== "add_to_list" && !r.tool.startsWith("search_"))) return null;
                        return (
                          <details style={{ marginTop: 4 }}>
                            <summary><small>Détail</small></summary>
                            <dl className="stack" style={{ gap: 6, marginTop: 6 }}>
                              {d.map(([k, v]) => (
                                <div key={k}>
                                  <dt><small><strong>{k}</strong></small></dt>
                                  <dd style={{ margin: 0, whiteSpace: "pre-wrap" }}><small>{v}</small></dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        );
                      })()}
                    </td>
                    <td className="tabular">{Number(r.cost_eur) > 0 ? `${Number(r.cost_eur).toFixed(2)} €` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
