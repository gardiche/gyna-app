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
  } else if (a.kind === "skill_update") {
    const applied = await decideSkillProposal(db, {
      proposalId: a.ref_id,
      orgId: a.org_id,
      decision: input.decision,
      userId: input.userId,
      now,
      content: input.body?.trim(),
      reason: input.reason?.trim(),
    });
    if (!applied.ok) {
      // On rouvre la validation pour qu'un associé puisse réessayer.
      await db.from("approvals").update({ status: "pending", decided_by: null, decided_at: null, channel: null }).eq("id", a.id);
      return applied;
    }
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
    result_summary: `${KIND_LABEL[a.kind] ?? "Validation"} ${input.decision === "approved" ? "approuvé" : "rejeté"} (${input.channel})`,
  });
  return { ok: true, kind: a.kind, summary: a.summary };
}

const KIND_LABEL: Record<string, string> = { draft: "Brouillon", mission_budget: "Budget", skill_update: "Skill" };

/**
 * Proposition de skill : approuvée, elle crée le skill s'il n'existe pas, ajoute une version
 * (éventuellement corrigée par l'associé) et la rend courante ; rejetée, elle garde sa raison.
 */
async function decideSkillProposal(
  db: SupabaseClient,
  input: { proposalId: string; orgId: string; decision: Decision; userId: string; now: string; content?: string; reason?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: p } = await db.from("skill_proposals").select("*").eq("id", input.proposalId).eq("org_id", input.orgId).maybeSingle();
  if (!p) return { ok: false, error: "Proposition introuvable." };

  if (input.decision === "rejected") {
    await db
      .from("skill_proposals")
      .update({ status: "rejected", decided_by: input.userId, decided_at: input.now, ...(input.reason ? { rejection_reason: input.reason } : {}) })
      .eq("id", p.id);
    return { ok: true };
  }

  const content = input.content || p.content;
  let skillId: string | null = p.skill_id;
  if (!skillId) {
    // Le skill a pu être créé entre-temps sous le même identifiant.
    const { data: existing } = await db.from("skills").select("id").eq("org_id", p.org_id).eq("slug", p.slug).maybeSingle();
    if (existing) skillId = existing.id;
    else {
      const { data: created, error } = await db
        .from("skills")
        .insert({ org_id: p.org_id, slug: p.slug, name: p.name, agent: p.agent, active: true })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      skillId = created.id;
    }
  }
  const { data: last } = await db.from("skill_versions").select("version").eq("skill_id", skillId).order("version", { ascending: false }).limit(1).maybeSingle();
  const { data: v, error: vErr } = await db
    .from("skill_versions")
    .insert({ org_id: p.org_id, skill_id: skillId, version: (last?.version ?? 0) + 1, content, created_by: input.userId })
    .select("id")
    .single();
  if (vErr) return { ok: false, error: vErr.message };
  await db.from("skills").update({ current_version_id: v.id, name: p.name, agent: p.agent, updated_at: input.now }).eq("id", skillId);
  await db
    .from("skill_proposals")
    .update({ status: "approved", decided_by: input.userId, decided_at: input.now, skill_id: skillId, content })
    .eq("id", p.id);
  return { ok: true };
}
