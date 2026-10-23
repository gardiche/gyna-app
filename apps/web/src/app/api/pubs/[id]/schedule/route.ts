import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/supabase/server";

const Body = z.object({
  scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  published: z.boolean().optional(),
});

/** Date prévue d'un post, et marque « publié » quand un associé l'a mis en ligne lui-même. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || session.campaignViewer) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide" }, { status: 400 });
  const patch: Record<string, string | null> = {};
  if (parsed.data.scheduled_for !== undefined) patch.scheduled_for = parsed.data.scheduled_for;
  if (parsed.data.published !== undefined) patch.published_at = parsed.data.published ? new Date().toISOString() : null;
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });
  const { data, error } = await session.supabase.from("ads").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Post introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
