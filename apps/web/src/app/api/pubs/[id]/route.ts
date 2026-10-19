import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/supabase/server";
import { decideAd } from "@/lib/approvals";

const Body = z.object({
  decision: z.enum(["approved", "rejected"]),
  edits: z
    .object({
      headline: z.string().max(255),
      primary_text: z.string().min(10).max(3000),
      description: z.string().max(300),
      cta: z.string().max(60),
      visual_brief: z.string().max(1500),
      // Diapositives d'un carrousel dans leur nouvel ordre ; `from` est le rang de chacune avant correction.
      slides: z.array(z.object({ text: z.string().trim().min(2).max(600), from: z.number().int().min(0).max(19) })).min(1).max(20),
    })
    .partial()
    .optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Décision invalide" }, { status: 400 });
  const r = await decideAd(session.supabase, { adId: id, userId: session.userId, ...parsed.data });
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
