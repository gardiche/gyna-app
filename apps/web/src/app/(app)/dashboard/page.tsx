import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { cumulative, listVentures, ventureFunnel } from "@/lib/data";

export const dynamic = "force-dynamic";

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const ventures = await listVentures(db);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const blocks = await Promise.all(
    ventures.map(async (v) => {
      const [funnel, { data: missions }, { data: rows }] = await Promise.all([
        ventureFunnel(db, v.id),
        db.from("missions").select("cost_eur").eq("venture_id", v.id).gte("started_at", monthStart.toISOString()),
        db.from("prospect_ventures").select("heat, status").eq("venture_id", v.id).not("heat", "is", null),
      ]);
      const cost = (missions ?? []).reduce((s, m) => s + Number(m.cost_eur), 0);
      // Qualité de la chaleur : part des prospects contactés qui ont répondu, par niveau.
      const reply = { hot: [0, 0], warm: [0, 0], cold: [0, 0] } as Record<string, [number, number]>;
      for (const r of rows ?? []) {
        const contacted = ["contacted", "replied", "enrolled"].includes(r.status);
        const replied = ["replied", "enrolled"].includes(r.status);
        if (contacted && reply[r.heat]) {
          reply[r.heat]![1]++;
          if (replied) reply[r.heat]![0]++;
        }
      }
      return { v, funnel, steps: cumulative(funnel), cost, missions: missions?.length ?? 0, reply };
    }),
  );

  return (
    <>
      <div>
        <h1 className="page-title">Tableau de bord</h1>
        <p className="page-sub">Le parcours des prospects par venture, et ce qu'il coûte.</p>
      </div>
      {blocks.map(({ v, funnel, steps, cost, missions, reply }) => (
        <div key={v.id} className="workspace">
          <section className="card card-pad card-main stack">
            <div className="row between">
              <h2 style={{ fontSize: 20, fontWeight: 600 }}>{v.name}</h2>
              {v.enrollment_goal ? <span className="pill pill-lime">Objectif : {v.enrollment_goal}</span> : null}
            </div>
            <div className="table-wrap">
              <table className="data">
                <caption className="sr-only">Parcours des prospects de {v.name}</caption>
                <thead><tr><th scope="col">Étape</th><th scope="col">Prospects</th><th scope="col">Passage depuis l'étape précédente</th></tr></thead>
                <tbody>
                  <tr><td>Trouvés</td><td className="tabular">{funnel.total}</td><td /></tr>
                  <tr><td>Qualifiés</td><td className="tabular">{steps.qualified}</td><td className="tabular">{pct(steps.qualified, funnel.total)}</td></tr>
                  <tr><td>Contactés</td><td className="tabular">{steps.contacted}</td><td className="tabular">{pct(steps.contacted, steps.qualified)}</td></tr>
                  <tr><td>Ont répondu</td><td className="tabular">{steps.replied}</td><td className="tabular">{pct(steps.replied, steps.contacted)}</td></tr>
                  <tr><td>Inscrits</td><td className="tabular">{steps.enrolled}</td><td className="tabular">{pct(steps.enrolled, steps.replied)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="muted">
              Taux de réponse des contactés : chauds {pct(reply.hot![0], reply.hot![1])}, tièdes {pct(reply.warm![0], reply.warm![1])}, froids {pct(reply.cold![0], reply.cold![1])}.
              Si les chauds ne répondent pas plus que les autres, le skill de qualification est à revoir.
            </p>
          </section>
          <aside>
            <section className="card-lavender">
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Inscrits</h2>
              <span className="big-number tabular">{steps.enrolled}</span>
              <span style={{ fontSize: 14 }}>{v.enrollment_goal ? `sur un objectif de ${v.enrollment_goal}` : "inscrits"}</span>
            </section>
            <section className="card card-pad stack">
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Coûts du mois</h2>
              <p style={{ fontSize: 32, fontWeight: 300 }} className="tabular">{cost.toFixed(2)} €</p>
              <p className="muted">
                {missions} mission(s). {steps.qualified > 0 ? `${(cost / steps.qualified).toFixed(2)} € par prospect qualifié` : "Aucun prospect qualifié"}
                {steps.enrolled > 0 ? `, ${(cost / steps.enrolled).toFixed(2)} € par inscrit.` : "."}
              </p>
            </section>
          </aside>
        </div>
      ))}
      {!blocks.length ? <section className="card"><p className="empty">Créez une venture pour voir ses résultats.</p></section> : null}
    </>
  );
}
