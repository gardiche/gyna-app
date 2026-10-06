import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cumulative, pendingApprovals, ventureFunnel, type Venture } from "@/lib/data";
import { Flame, Mountain } from "./icons";
import { ApproveButton } from "./ApproveButton";

/** Colonne de droite de l'écran principal : récap des prospects et validations en attente. */
export async function Overview({ db, venture }: { db: SupabaseClient; venture: Venture | null }) {
  const [funnel, pending] = await Promise.all([
    venture ? ventureFunnel(db, venture.id) : Promise.resolve(null),
    pendingApprovals(db, 3),
  ]);
  const steps = funnel ? cumulative(funnel) : null;
  const qualifiedTotal = funnel ? funnel.byHeat.hot + funnel.byHeat.warm + funnel.byHeat.cold : 0;

  return (
    <aside aria-label="Vue d'ensemble">
      <section className="card-lavender" aria-label="Récap des prospects">
        <div className="card-head">
          <h2>{venture ? `Prospects ${venture.name}` : "Prospects"}</h2>
          <Link href={venture ? `/prospects?venture=${venture.slug}` : "/prospects"} className="card-link">Tout voir</Link>
        </div>
        {funnel && steps ? (
          <>
            <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
              <span className="big-number tabular">{funnel.total}</span>
              <span style={{ fontSize: 14, paddingBottom: 4 }}>prospects, dont {qualifiedTotal} qualifiés</span>
            </div>
            {qualifiedTotal > 0 ? (
              <div className="stack" style={{ gap: 10 }}>
                <div role="img" aria-label={`Chaleur : ${funnel.byHeat.hot} chauds, ${funnel.byHeat.warm} tièdes, ${funnel.byHeat.cold} froids`}
                  style={{ display: "flex", gap: 4, height: 12 }}>
                  {funnel.byHeat.hot > 0 && <span style={{ flex: funnel.byHeat.hot, borderRadius: 6, background: "var(--hot)" }} />}
                  {funnel.byHeat.warm > 0 && <span style={{ flex: funnel.byHeat.warm, borderRadius: 6, background: "var(--warm)" }} />}
                  {funnel.byHeat.cold > 0 && <span style={{ flex: funnel.byHeat.cold, borderRadius: 6, background: "var(--cold)" }} />}
                </div>
                <div className="row" style={{ gap: 14, fontSize: 13 }}>
                  <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: "var(--hot)" }} />{funnel.byHeat.hot} chauds</span>
                  <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: "var(--warm)" }} />{funnel.byHeat.warm} tièdes</span>
                  <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: "var(--cold)" }} />{funnel.byHeat.cold} froids</span>
                </div>
              </div>
            ) : null}
            <ol className="inset inset-list">
              <li><span>À examiner</span><strong className="tabular">{steps.to_review}</strong></li>
              <li><span>Qualifiés</span><strong className="tabular">{steps.qualified}</strong></li>
              <li><span>Contactés</span><strong className="tabular">{steps.contacted}</strong></li>
              <li><span>Ont répondu</span><strong className="tabular">{steps.replied}</strong></li>
              <li>
                <span>Inscrits</span>
                <span><strong className="tabular">{steps.enrolled}</strong>{venture?.enrollment_goal ? <span>, objectif {venture.enrollment_goal}</span> : null}</span>
              </li>
            </ol>
          </>
        ) : (
          <p style={{ fontSize: 14 }}>Créez une venture pour suivre ses prospects.</p>
        )}
      </section>

      <section className="card-lime" aria-label="À valider" style={{ paddingBottom: 110 }}>
        <div className="card-head">
          <h2>À valider</h2>
          {pending.length ? (
            <span className="pill" style={{ background: "var(--ink)", color: "#fff" }}>{pending.length}</span>
          ) : null}
        </div>
        {pending.length === 0 ? (
          <p style={{ fontSize: 14, position: "relative", zIndex: 1 }}>Rien en attente. Les brouillons de Gyna apparaîtront ici.</p>
        ) : (
          pending.map((a) => (
            <div key={a.id} className="inset" style={{ padding: "14px 16px", position: "relative", zIndex: 1, background: "rgba(255,255,255,0.7)" }}>
              <div className="row between">
                <span style={{ fontSize: 14, fontWeight: 600 }}>{a.summary}</span>
                {a.kind === "draft" ? <Flame size={12} /> : null}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <ApproveButton approvalId={a.id} />
                <Link href="/validations" className="btn btn-ghost btn-sm" style={{ color: "var(--ink)" }}>Relire</Link>
              </div>
            </div>
          ))
        )}
        <Link href="/validations" className="card-link" style={{ position: "relative", zIndex: 1 }}>Ouvrir la file de validation</Link>
        <Mountain />
      </section>
    </aside>
  );
}
