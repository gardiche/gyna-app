import { NextResponse } from "next/server";
import { getSession, supabaseAdmin } from "@/lib/supabase/server";
import { publishToFacebookOnly } from "@/lib/publish";

export const maxDuration = 120;

/** Publie sur la Page Facebook un post déjà publié sur Instagram, à la demande d'un associé. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  // La RLS garantit que le post appartient à l'organisation de l'associé.
  const { data: ad } = await session.supabase.from("ads").select("id").eq("id", id).maybeSingle();
  if (!ad) return NextResponse.json({ error: "Post introuvable." }, { status: 404 });
  const r = await publishToFacebookOnly(supabaseAdmin(), id);
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
