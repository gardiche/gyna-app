import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const AGENTS = ["gyna", "sourcing", "qualification", "redaction", "veille", "associe", "system"];
const LABEL: Record<string, string> = {
  gyna: "Gyna", sourcing: "Sourcing", qualification: "Qualification", redaction: "Rédaction", veille: "Veille", associe: "Associé", system: "Système",
};
const fmt = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ agent?: string; mission?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  let q = session.supabase
    .from("actions")
    .select("id, agent, tool, result_summary, status, cost_eur, created_at, mission_id")
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
