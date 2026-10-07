import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Ce qu'une mission a produit : prospects qualifiés (les plus chauds d'abord) et brouillons. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const db = session.supabase;

  const [{ data: mission }, { data: pvs }, { data: drafts }] = await Promise.all([
    db.from("missions").select("id, status, cost_eur, budget_cap_eur").eq("id", id).maybeSingle(),
    db
      .from("prospect_ventures")
      .select("id, status, heat, heat_reason, prospects(id, full_name, headline, location)")
      .eq("mission_id", id)
      .limit(200),
    db
      .from("drafts")
      .select("id, body, status, prospect_ventures(prospects(id, full_name))")
      .eq("mission_id", id)
      .order("created_at"),
  ]);
  if (!mission) return NextResponse.json({ error: "Mission introuvable" }, { status: 404 });

  const draftIds = (drafts ?? []).map((d) => d.id);
  const { data: approvals } = draftIds.length
    ? await db.from("approvals").select("id, ref_id, status").in("ref_id", draftIds)
    : { data: [] as Array<{ id: string; ref_id: string; status: string }> };
  const approvalByDraft = new Map((approvals ?? []).map((a) => [a.ref_id, a]));

  const order = { hot: 0, warm: 1, cold: 2 } as Record<string, number>;
  const all = (pvs ?? []).map((pv: any) => ({
    id: pv.prospects?.id,
    full_name: pv.prospects?.full_name,
    headline: pv.prospects?.headline,
    location: pv.prospects?.location,
    status: pv.status,
    heat: pv.heat,
    heat_reason: pv.heat_reason,
  }));
  const qualified = all
    .filter((p) => p.status !== "to_review" && p.status !== "discarded")
    .sort((a, b) => (order[a.heat] ?? 3) - (order[b.heat] ?? 3));

  return NextResponse.json({
    mission,
    counts: {
      total: all.length,
      qualified: qualified.length,
      to_review: all.filter((p) => p.status === "to_review").length,
      discarded: all.filter((p) => p.status === "discarded").length,
      hot: qualified.filter((p) => p.heat === "hot").length,
      warm: qualified.filter((p) => p.heat === "warm").length,
      cold: qualified.filter((p) => p.heat === "cold").length,
    },
    prospects: qualified.slice(0, 8),
    drafts: (drafts ?? []).map((d: any) => ({
      id: d.id,
      body: d.body,
      status: d.status,
      prospect: d.prospect_ventures?.prospects ?? null,
      approval_id: approvalByDraft.get(d.id)?.id ?? null,
    })),
  });
}
