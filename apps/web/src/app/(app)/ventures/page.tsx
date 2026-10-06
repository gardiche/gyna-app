import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { cumulative, listVentures, ventureFunnel } from "@/lib/data";
import { createVenture } from "./actions";

export const dynamic = "force-dynamic";

export default async function VenturesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const ventures = await listVentures(db);
  const funnels = await Promise.all(ventures.map((v) => ventureFunnel(db, v.id)));

  return (
    <>
      <div>
        <h1 className="page-title">Ventures</h1>
        <p className="page-sub">Chaque venture a son brief GTM : c'est ce que Gyna lit avant chaque mission.</p>
      </div>
      <div className="workspace">
        <div className="card-main stack" style={{ gap: 20 }}>
          {ventures.map((v, i) => {
            const s = cumulative(funnels[i]!);
            return (
              <Link key={v.id} href={`/ventures/${v.slug}`} className="card card-pad stack" style={{ textDecoration: "none" }}>
                <div className="row between">
                  <h2 style={{ fontSize: 20, fontWeight: 600 }}>{v.name}</h2>
                  <span className="pill pill-lime">Brief et segments</span>
                </div>
                <p className="muted">
                  {funnels[i]!.total} prospects, {s.qualified} qualifiés, {s.contacted} contactés, {s.enrolled} inscrits
                  {v.enrollment_goal ? ` (objectif : ${v.enrollment_goal})` : ""}.
                </p>
              </Link>
            );
          })}
          {ventures.length === 0 ? <section className="card"><p className="empty">Aucune venture pour l'instant.</p></section> : null}
        </div>
        <aside>
          <form action={createVenture} className="card-lime" style={{ paddingBottom: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Nouvelle venture</h2>
            <label className="field" style={{ color: "var(--ink)" }}>Nom<input name="name" required /></label>
            <label className="field" style={{ color: "var(--ink)" }}>Objectif<input name="goal" placeholder="Par exemple : 10 à 15 inscrits" /></label>
            <button type="submit" className="btn btn-dark">Créer</button>
          </form>
        </aside>
      </div>
    </>
  );
}
