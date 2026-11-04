import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { cumulative, listVentures, ventureFunnel } from "@/lib/data";
import { createSandbox, createVenture, resetSandbox } from "./actions";

export const dynamic = "force-dynamic";

export default async function VenturesPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
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
      {ok === "essai" ? <p className="notice">Venture d'essai créée : choisis-la dans le chat pour lancer une mission d'essai.</p> : null}
      {ok === "reinit" ? <p className="notice">Essai réinitialisé : la venture d'essai est de nouveau une copie propre de la vraie.</p> : null}
      <div className="workspace">
        <div className="card-main stack" style={{ gap: 20 }}>
          {ventures.map((v, i) => {
            const s = cumulative(funnels[i]!);
            const hasSandbox = ventures.some((x) => x.is_sandbox && x.slug === `${v.slug}-essai`);
            return (
              <section key={v.id} className="card card-pad stack">
                <Link href={`/ventures/${v.slug}`} className="stack" style={{ textDecoration: "none", gap: 8 }}>
                  <div className="row between">
                    <h2 style={{ fontSize: 20, fontWeight: 600 }}>{v.name}</h2>
                    {v.is_sandbox ? <span className="pill pill-lavender">Essai</span> : <span className="pill pill-lime">Brief et segments</span>}
                  </div>
                  <p className="muted">
                    {funnels[i]!.total} prospects, {s.qualified} qualifiés, {s.contacted} contactés, {s.enrolled} inscrits
                    {v.enrollment_goal ? ` (objectif : ${v.enrollment_goal})` : ""}.
                  </p>
                </Link>
                {v.is_sandbox ? (
                  <form action={resetSandbox} className="row" style={{ gap: 10 }}>
                    <input type="hidden" name="venture_id" value={v.id} />
                    <button type="submit" className="btn btn-sm">Réinitialiser l'essai</button>
                    <span className="muted" style={{ fontSize: 13 }}>Copie de travail : les missions d'essai ne touchent qu'à elle, volumes plafonnés, budget de 0,30 €.</span>
                  </form>
                ) : !hasSandbox ? (
                  <form action={createSandbox} className="row" style={{ gap: 10 }}>
                    <input type="hidden" name="venture_id" value={v.id} />
                    <button type="submit" className="btn btn-ghost btn-sm">Créer une venture d'essai</button>
                    <span className="muted" style={{ fontSize: 13 }}>Pour tester les agents sur un échantillon sans toucher au CRM.</span>
                  </form>
                ) : null}
              </section>
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
