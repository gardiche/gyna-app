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
  } else if (a.kind === "ad_batch") {
    // Décision d'un seul geste (Telegram, ou « tout approuver ») : elle vaut pour les pubs encore en attente.
    const reason = input.decision === "rejected" ? input.reason?.trim() : undefined;
    await db
      .from("ads")
      .update({ status: input.decision, decided_by: input.userId, decided_at: now, ...(reason ? { rejection_reason: reason } : {}) })
      .eq("batch_id", a.ref_id)
      .eq("status", "pending");
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

const KIND_LABEL: Record<string, string> = { draft: "Brouillon", mission_budget: "Budget", skill_update: "Skill", ad_batch: "Lot de pubs" };

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
        .insert({ org_id: p.org_id, slug: p.slug, name: p.name, description: p.description, agent: p.agent, active: true })
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
  await db.from("skills").update({ current_version_id: v.id, name: p.name, agent: p.agent, ...(p.description ? { description: p.description } : {}), updated_at: input.now }).eq("id", skillId);
  await db
    .from("skill_proposals")
    .update({ status: "approved", decided_by: input.userId, decided_at: input.now, skill_id: skillId, content })
    .eq("id", p.id);
  return { ok: true };
}

export const AD_EDITABLE = ["headline", "primary_text", "description", "cta", "visual_brief"] as const;
export type AdEdits = Partial<Record<(typeof AD_EDITABLE)[number], string>> & {
  /** Diapositives dans leur nouvel ordre, `from` étant leur rang d'avant. */
  slides?: Array<{ text: string; from: number }>;
};

/** Colonnes à écrire d'après les corrections d'un associé, et nouveau rang de chaque diapositive déplacée. */
function buildAdEdits(
  currentSlides: unknown,
  input: AdEdits | undefined,
): { ok: true; edits: Record<string, unknown>; moved: Map<number, number> } | { ok: false; error: string } {
  const edits: Record<string, unknown> = {};
  const moved = new Map<number, number>();
  for (const f of AD_EDITABLE) {
    const v = input?.[f];
    if (v !== undefined) edits[f] = v.trim() || null;
  }
  if (edits.primary_text === null) return { ok: false, error: "Le texte principal ne peut pas être vide." };
  const slides = input?.slides;
  if (slides) {
    const current = (currentSlides ?? []) as Array<{ text: string }>;
    const from = slides.map((s) => s.from).sort((a, b) => a - b);
    if (from.length !== current.length || from.some((f, i) => f !== i)) {
      return { ok: false, error: "Les diapositives ont changé entre-temps : rechargez la page." };
    }
    slides.forEach((s, i) => { if (s.from !== i) moved.set(s.from, i); });
    if (moved.size || slides.some((s, i) => s.text.trim() !== current[i]!.text.trim())) {
      edits.slides = slides.map((s) => ({ ...current[s.from], text: s.text.trim() }));
    }
  }
  return { ok: true, edits, moved };
}

/** Les images d'un carrousel suivent leur diapositive quand l'ordre change. */
async function followSlides(db: SupabaseClient, adId: string, moved: Map<number, number>) {
  if (!moved.size) return;
  const { data: images } = await db.from("ad_images").select("id, slide").eq("ad_id", adId);
  for (const im of images ?? []) {
    const to = moved.get(im.slide);
    if (to !== undefined) await db.from("ad_images").update({ slide: to }).eq("id", im.id);
  }
}

/**
 * Correction d'une pub déjà approuvée (textes, titre, description, bouton, brief, diapositives).
 * Elle reste approuvée ; si elle est déjà créée chez Meta, la correction n'y est pas reportée.
 */
export async function editApprovedAd(
  db: SupabaseClient,
  input: { adId: string; userId: string; edits: AdEdits },
): Promise<{ ok: true; onMeta: boolean } | { ok: false; error: string }> {
  const { data: ad } = await db.from("ads").select("id, org_id, status, slides, external_id").eq("id", input.adId).maybeSingle();
  if (!ad) return { ok: false, error: "Pub introuvable." };
  if (ad.status !== "approved") return { ok: false, error: "Seule une pub approuvée se corrige ici." };
  const built = buildAdEdits(ad.slides, input.edits);
  if (!built.ok) return built;
  if (!Object.keys(built.edits).length) return { ok: true, onMeta: !!ad.external_id };
  const { error } = await db.from("ads").update(built.edits).eq("id", ad.id).eq("status", "approved");
  if (error) return { ok: false, error: error.message };
  await followSlides(db, ad.id, built.moved);
  await db.from("actions").insert({
    org_id: ad.org_id,
    agent: "associe",
    tool: "edit_ad",
    result_summary: `Pub approuvée corrigée (${Object.keys(built.edits).join(", ")})${ad.external_id ? ", déjà créée chez Meta : non reportée" : ""}`,
  });
  return { ok: true, onMeta: !!ad.external_id };
}

/**
 * Décision d'un associé sur une pub : approuvée (éventuellement corrigée) ou refusée avec sa raison.
 * Le texte proposé reste dans `original`, relu par l'agent Ads via get_ad_feedback.
 * Quand plus aucune pub du lot n'attend, la validation du lot est close.
 */
export async function decideAd(
  db: SupabaseClient,
  input: { adId: string; decision: Decision; userId: string; edits?: AdEdits; reason?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: ad } = await db.from("ads").select("id, org_id, batch_id, status, slides").eq("id", input.adId).maybeSingle();
  if (!ad) return { ok: false, error: "Pub introuvable." };
  if (ad.status !== "pending") return { ok: false, error: "Déjà traitée." };

  const now = new Date().toISOString();
  let edits: Record<string, unknown> = {};
  let moved = new Map<number, number>();
  if (input.decision === "approved") {
    const built = buildAdEdits(ad.slides, input.edits);
    if (!built.ok) return built;
    ({ edits, moved } = built);
  }
  const reason = input.decision === "rejected" ? input.reason?.trim() : undefined;
  const { error } = await db
    .from("ads")
    .update({ ...edits, status: input.decision, decided_by: input.userId, decided_at: now, ...(reason ? { rejection_reason: reason } : {}) })
    .eq("id", ad.id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  await followSlides(db, ad.id, moved);

  const { data: rest } = await db.from("ads").select("status").eq("batch_id", ad.batch_id);
  if (!(rest ?? []).some((r) => r.status === "pending")) {
    const kept = (rest ?? []).some((r) => r.status === "approved");
    await db
      .from("approvals")
      .update({ status: kept ? "approved" : "rejected", decided_by: input.userId, decided_at: now, channel: "web" })
      .eq("kind", "ad_batch")
      .eq("ref_id", ad.batch_id)
      .eq("status", "pending");
  }
  await db.from("actions").insert({
    org_id: ad.org_id,
    agent: "associe",
    tool: "approval",
    result_summary: `Pub ${input.decision === "approved" ? (Object.keys(edits).length ? "approuvée après correction" : "approuvée") : "refusée"} (web)`,
  });
  return { ok: true };
}
