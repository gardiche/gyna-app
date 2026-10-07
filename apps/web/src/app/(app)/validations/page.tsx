import Link from "next/link";
import { redirect } from "next/navigation";
import type { Heat } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { pendingApprovals } from "@/lib/data";
import { ApproveButton } from "@/components/ApproveButton";
import { DraftDecision } from "@/components/DraftDecision";
import { HeatLabel } from "@/components/heat";
import { AGENT_LABEL } from "@/lib/agents";

export const dynamic = "force-dynamic";

export default async function ValidationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const pending = await pendingApprovals(db, 100);

  const draftIds = pending.filter((a) => a.kind === "draft").map((a) => a.ref_id);
  const { data: drafts } = draftIds.length
    ? await db
        .from("drafts")
        .select("id, body, prospect_ventures(heat, heat_reason, ventures(name), prospects(id, full_name, headline))")
        .in("id", draftIds)
    : { data: [] as any[] };
  const byId = new Map((drafts ?? []).map((d: any) => [d.id, d]));

  const proposalIds = pending.filter((a) => a.kind === "skill_update").map((a) => a.ref_id);
  const { data: proposals } = proposalIds.length
    ? await db
        .from("skill_proposals")
        .select("id, slug, name, agent, content, rationale, skill_id, skill_versions!skill_proposals_base_version_id_fkey(version, content)")
        .in("id", proposalIds)
    : { data: [] as any[] };
  const proposalById = new Map((proposals ?? []).map((p: any) => [p.id, p]));

  const { data: recent } = await db
    .from("approvals")
    .select("id, summary, status, channel, decided_at")
    .neq("status", "pending")
    .order("decided_at", { ascending: false })
    .limit(15);

  return (
    <>
      <div>
        <h1 className="page-title">À valider</h1>
        <p className="page-sub">L'accord d'un seul associé suffit. Rien ne part sans validation.</p>
      </div>

      {pending.length === 0 ? (
        <section className="card"><p className="empty">Rien en attente.</p></section>
      ) : (
        pending.map((a) => {
          const d: any = a.kind === "draft" ? byId.get(a.ref_id) : null;
          const pv = d?.prospect_ventures;
          const sp: any = a.kind === "skill_update" ? proposalById.get(a.ref_id) : null;
          if (sp) {
            const base = sp.skill_versions;
            return (
              <section key={a.id} className="card card-pad stack">
                <div className="row between">
                  <h2 style={{ fontSize: 17, fontWeight: 600 }}>{a.summary}</h2>
                  <span className="pill pill-lavender">Skill · {AGENT_LABEL[(sp.agent ?? "all") as keyof typeof AGENT_LABEL]}</span>
                </div>
                <p className="muted" style={{ fontSize: 14 }}><strong style={{ color: "var(--ink)" }}>Pourquoi :</strong> {sp.rationale}</p>
                {base ? (
                  <details className="skill-before">
                    <summary>Version actuelle (v{base.version})</summary>
                    <p className="draft-body">{base.content}</p>
                  </details>
                ) : (
                  <p className="muted">Nouveau skill : il sera actif dès son approbation.</p>
                )}
                <DraftDecision
                  approvalId={a.id}
                  body={sp.content}
                  label={base ? "Nouvelle version proposée" : "Contenu proposé"}
                  maxLength={20000}
                  rows={10}
                  reasonHint="Pourquoi la refuser ? Facultatif, Gyna en tiendra compte."
                />
              </section>
            );
          }
          return (
            <section key={a.id} className="card card-pad stack">
              <div className="row between">
                <h2 style={{ fontSize: 17, fontWeight: 600 }}>{a.summary}</h2>
                {pv ? <HeatLabel heat={pv.heat as Heat | null} /> : <span className="pill pill-warm">Budget</span>}
              </div>
              {pv ? (
                <p className="muted">
                  <Link href={`/prospects/${pv.prospects.id}`} style={{ fontWeight: 600, color: "var(--ink)" }}>{pv.prospects.full_name}</Link>
                  {pv.prospects.headline ? `, ${pv.prospects.headline}` : ""}. {pv.heat_reason}
                </p>
              ) : null}
              {d ? <DraftDecision approvalId={a.id} body={d.body} /> : (
                <>
                  <p className="muted">Approuver relève le plafond de la mission du budget par défaut et la relance. Rejeter l'annule.</p>
                  <div className="row"><ApproveButton approvalId={a.id} withReject /></div>
                </>
              )}
            </section>
          );
        })
      )}

      {recent?.length ? (
        <section className="card card-pad stack">
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Décisions récentes</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th scope="col">Élément</th><th scope="col">Décision</th><th scope="col">Canal</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>{r.summary}</td>
                    <td><span className={r.status === "approved" ? "pill pill-lime" : "pill"}>{r.status === "approved" ? "Approuvé" : "Rejeté"}</span></td>
                    <td>{r.channel === "telegram" ? "Telegram" : "App"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
