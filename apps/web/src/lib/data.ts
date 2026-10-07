import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Heat, ProspectStatus } from "@gyna/schemas";

export interface Venture {
  id: string;
  name: string;
  slug: string;
  color: string;
  enrollment_goal: string | null;
}

export async function listVentures(db: SupabaseClient): Promise<Venture[]> {
  const { data } = await db
    .from("ventures")
    .select("id, name, slug, color, enrollment_goal")
    .neq("status", "archived")
    .order("created_at");
  return data ?? [];
}

export interface Funnel {
  total: number;
  byStatus: Record<ProspectStatus, number>;
  byHeat: Record<Heat, number>;
}

export async function ventureFunnel(db: SupabaseClient, ventureId: string): Promise<Funnel> {
  const { data } = await db.from("prospect_ventures").select("status, heat").eq("venture_id", ventureId);
  const f: Funnel = {
    total: 0,
    byStatus: { to_review: 0, qualified: 0, contacted: 0, replied: 0, enrolled: 0, discarded: 0 },
    byHeat: { cold: 0, warm: 0, hot: 0 },
  };
  for (const r of data ?? []) {
    f.byStatus[r.status as ProspectStatus]++;
    if (r.status === "discarded") continue;
    f.total++;
    if (r.heat && r.status !== "to_review") f.byHeat[r.heat as Heat]++;
  }
  return f;
}

/** Étapes cumulées : un prospect inscrit a aussi été contacté, qualifié… */
export function cumulative(f: Funnel) {
  const s = f.byStatus;
  const enrolled = s.enrolled;
  const replied = s.replied + enrolled;
  const contacted = s.contacted + replied;
  const qualified = s.qualified + contacted;
  return { to_review: s.to_review, qualified, contacted, replied, enrolled };
}

export interface PendingApproval {
  id: string;
  kind: "draft" | "mission_budget";
  ref_id: string;
  summary: string;
  created_at: string;
}

/** Chaleur du prospect de chaque brouillon en attente, pour l'afficher à côté de la validation. */
export async function draftHeats(db: SupabaseClient, draftIds: string[]): Promise<Map<string, Heat | null>> {
  if (!draftIds.length) return new Map();
  const { data } = await db.from("drafts").select("id, prospect_ventures(heat)").in("id", draftIds);
  return new Map((data ?? []).map((d: any) => [d.id, d.prospect_ventures?.heat ?? null]));
}

export async function pendingApprovals(db: SupabaseClient, limit = 50): Promise<PendingApproval[]> {
  const { data } = await db
    .from("approvals")
    .select("id, kind, ref_id, summary, created_at")
    .eq("status", "pending")
    .order("created_at")
    .limit(limit);
  return (data ?? []) as PendingApproval[];
}

export type AgentKey = "sourcing" | "qualification" | "redaction";

export interface MissionSummary {
  id: string;
  status: "running" | "awaiting_approval" | "done" | "failed" | "cancelled";
  cost_eur: number;
  budget_cap_eur: number;
  started_at: string;
  ended_at: string | null;
  /** Dernière action journalisée par chaque sous-agent. */
  agents: Record<AgentKey, string | null>;
}

/** Dernière mission d'une conversation, ou de l'organisation hors conversation. */
export async function latestMission(db: SupabaseClient, conversationId: string | null): Promise<MissionSummary | null> {
  let q = db.from("missions").select("id, status, cost_eur, budget_cap_eur, started_at, ended_at");
  if (conversationId) q = q.eq("conversation_id", conversationId);
  const { data: m } = await q.order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!m) return null;
  const agents: Record<AgentKey, string | null> = { sourcing: null, qualification: null, redaction: null };
  const { data: acts } = await db
    .from("actions")
    .select("agent, result_summary")
    .eq("mission_id", m.id)
    .order("created_at", { ascending: false })
    .limit(50);
  for (const a of acts ?? []) {
    const k = a.agent as AgentKey;
    if (k in agents && !agents[k]) agents[k] = a.result_summary;
  }
  return {
    id: m.id,
    status: m.status,
    cost_eur: Number(m.cost_eur),
    budget_cap_eur: Number(m.budget_cap_eur),
    started_at: m.started_at,
    ended_at: m.ended_at,
    agents,
  };
}

export interface TeamMemberStatus {
  /** Travaille sur une mission en cours. */
  live: boolean;
  /** Dernière action journalisée. */
  last_at: string | null;
}

/** État de chaque agent : actif sur une mission en cours, et date de sa dernière action. */
export async function teamStatus(db: SupabaseClient): Promise<Record<"gyna" | AgentKey, TeamMemberStatus>> {
  const keys = ["gyna", "sourcing", "qualification", "redaction"] as const;
  const [{ data: running }, ...lasts] = await Promise.all([
    db.from("missions").select("id").eq("status", "running"),
    ...keys.map((k) => db.from("actions").select("created_at").eq("agent", k).order("created_at", { ascending: false }).limit(1).maybeSingle()),
  ]);
  const runningIds = (running ?? []).map((m) => m.id);
  const liveAgents = new Set<string>();
  if (runningIds.length) {
    const { data } = await db.from("actions").select("agent").in("mission_id", runningIds).limit(500);
    for (const a of data ?? []) liveAgents.add(a.agent);
  }
  const out = {} as Record<(typeof keys)[number], TeamMemberStatus>;
  keys.forEach((k, i) => {
    // Gyna orchestre toute mission en cours, même avant sa première action journalisée.
    out[k] = { live: k === "gyna" ? runningIds.length > 0 : liveAgents.has(k), last_at: (lasts[i]?.data as { created_at: string } | null)?.created_at ?? null };
  });
  return out;
}

/** Prospects chauds d'une venture, encore qualifiés, sans aucun brouillon. */
export async function hotWithoutDraft(db: SupabaseClient, ventureId: string): Promise<number> {
  const { data } = await db
    .from("prospect_ventures")
    .select("id, drafts(id)")
    .eq("venture_id", ventureId)
    .eq("heat", "hot")
    .eq("status", "qualified");
  return (data ?? []).filter((pv: any) => !pv.drafts?.length).length;
}

export interface ConversationSummary {
  id: string;
  title: string;
  venture: string | null;
  updated_at: string;
  /** Une mission tourne (ou attend un accord de budget). */
  live: boolean;
  /** Brouillons de cette conversation qui attendent une validation. */
  pending_drafts: number;
}

/** Conversations de l'organisation, les plus récentes d'abord, avec leur état. */
export async function listConversations(db: SupabaseClient, limit = 40): Promise<ConversationSummary[]> {
  const [{ data }, { data: live }, { data: drafts }] = await Promise.all([
    db.from("conversations").select("id, title, updated_at, ventures(name)").order("updated_at", { ascending: false }).limit(limit),
    db.from("missions").select("conversation_id").in("status", ["running", "awaiting_approval"]),
    db.from("drafts").select("missions(conversation_id)").eq("status", "pending"),
  ]);
  const liveIds = new Set((live ?? []).map((m) => m.conversation_id));
  const pending = new Map<string, number>();
  for (const d of (drafts ?? []) as any[]) {
    const c = d.missions?.conversation_id;
    if (c) pending.set(c, (pending.get(c) ?? 0) + 1);
  }
  return (data ?? []).map((c: any) => ({
    id: c.id,
    title: c.title,
    venture: c.ventures?.name ?? null,
    updated_at: c.updated_at,
    live: liveIds.has(c.id),
    pending_drafts: pending.get(c.id) ?? 0,
  }));
}
