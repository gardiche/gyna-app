import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/supabase/server";
import { decideApproval } from "@/lib/approvals";

const Body = z.object({
  decision: z.enum(["approved", "rejected"]),
  body: z.string().min(20).max(3000).optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Décision invalide" }, { status: 400 });
  const r = await decideApproval(session.supabase, {
    approvalId: id,
    decision: parsed.data.decision,
    body: parsed.data.body,
    reason: parsed.data.reason,
    userId: session.userId,
    channel: "web",
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
