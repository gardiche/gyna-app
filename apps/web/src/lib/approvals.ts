import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Decision = "approved" | "rejected";

/**
 * Applique la décision d'un associé à une validation, depuis l'app ou Telegram.
 * - brouillon : approuvé (éventuellement corrigé, `body`) ou rejeté (raison facultative, `reason`) ;
 *   le texte proposé par l'agent reste dans `original_body`, relu par les agents via get_feedback ;
 * - budget de mission : approuvé = plafond relevé et mission relancée ; rejeté = mission annulée.
 */
export async function decideApproval(
  db: SupabaseClient,
  input: {
    approvalId: string;
    decision: Decision;
    userId: string;
    channel: "web" | "telegram";
    orgId?: string;
    body?: string;
    reason?: string;
  },
): Promise<{ ok: true; kind: string; summary: string } | { ok: false; error: string }> {
  let q = db.from("approvals").select("id, org_id, kind, ref_id, status, summary").eq("id", input.approvalId);
  if (input.orgId) q = q.eq("org_id", input.orgId);
  const { data: a } = await q.maybeSingle();
  if (!a) return { ok: false, error: "Validation introuvable." };
  if (a.status !== "pending") return { ok: false, error: "Déjà traitée." };

  const now = new Date().toISOString();
  const { error } = await db
    .from("approvals")
    .update({ status: input.decision, decided_by: input.userId, decided_at: now, channel: input.channel })
    .eq("id", a.id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  if (a.kind === "draft") {
    const body = input.decision === "approved" ? input.body?.trim() : undefined;
    const reason = input.decision === "rejected" ? input.reason?.trim() : undefined;
    await db
      .from("drafts")
      .update({
        status: input.decision,
        decided_by: input.userId,
        decided_at: now,
        ...(body ? { body } : {}),
        ...(reason ? { rejection_reason: reason } : {}),
      })
      .eq("id", a.ref_id);
  } else if (a.kind === "mission_budget") {
    if (input.decision === "approved") {
      const { data: m } = await db.from("missions").select("budget_cap_eur, cost_eur, org_id").eq("id", a.ref_id).single();
      const { data: org } = await db.from("organizations").select("default_mission_budget_eur").eq("id", m!.org_id).single();
      const newCap = Number(m!.cost_eur) + Number(org!.default_mission_budget_eur);
      await db.from("missions").update({ status: "running", budget_cap_eur: newCap }).eq("id", a.ref_id);
    } else {
      await db.from("missions").update({ status: "cancelled", ended_at: now }).eq("id", a.ref_id);
    }
  }

  await db.from("actions").insert({
    org_id: a.org_id,
    agent: "associe",
    tool: "approval",
    result_summary: `${a.kind === "draft" ? "Brouillon" : "Budget"} ${input.decision === "approved" ? "approuvé" : "rejeté"} (${input.channel})`,
  });
  return { ok: true, kind: a.kind, summary: a.summary };
}
