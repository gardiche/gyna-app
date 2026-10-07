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

export async function pendingApprovals(db: SupabaseClient, limit = 50): Promise<PendingApproval[]> {
  const { data } = await db
    .from("approvals")
    .select("id, kind, ref_id, summary, created_at")
    .eq("status", "pending")
    .order("created_at")
    .limit(limit);
  return (data ?? []) as PendingApproval[];
}

export async function prospectsFoundToday(db: SupabaseClient): Promise<number> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { count } = await db
    .from("prospect_ventures")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since.toISOString());
  return count ?? 0;
}

/** Dernière action de chaque sous-agent sur la mission la plus récente. */
export async function agentStatus(db: SupabaseClient) {
  const { data: m } = await db
    .from("missions")
    .select("id, status")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const out: Record<"sourcing" | "qualification" | "redaction", string | null> = {
    sourcing: null,
    qualification: null,
    redaction: null,
  };
  if (!m) return { mission: null, agents: out };
  const { data: acts } = await db
    .from("actions")
    .select("agent, result_summary, created_at")
    .eq("mission_id", m.id)
    .order("created_at", { ascending: false })
    .limit(50);
  for (const a of acts ?? []) {
    const k = a.agent as keyof typeof out;
    if (k in out && !out[k]) out[k] = a.result_summary;
  }
  return { mission: m, agents: out };
}

export interface ConversationSummary {
  id: string;
  title: string;
  venture: string | null;
  updated_at: string;
}

/** Conversations de l'organisation, les plus récentes d'abord. */
export async function listConversations(db: SupabaseClient, limit = 40): Promise<ConversationSummary[]> {
  const { data } = await db
    .from("conversations")
    .select("id, title, updated_at, ventures(name)")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((c: any) => ({
    id: c.id,
    title: c.title,
    venture: c.ventures?.name ?? null,
    updated_at: c.updated_at,
  }));
}
