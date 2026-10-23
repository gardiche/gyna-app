import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { removeImage } from "@/lib/media";

/** Retire une image de la bibliothèque de visuels, et son fichier. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || session.campaignViewer) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const { data: asset } = await session.supabase.from("venture_assets").select("id, path").eq("id", id).maybeSingle();
  if (!asset) return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
  const { error } = await session.supabase.from("venture_assets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await removeImage(asset.path).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
