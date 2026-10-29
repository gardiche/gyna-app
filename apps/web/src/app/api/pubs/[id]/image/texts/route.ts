import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { openrouterEnabled, readImageTexts } from "@/lib/openrouter-image";

export const maxDuration = 90;

/** Textes écrits dans une version du visuel, pour les corriger un par un avant une retouche. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.fullMember) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const imageId = new URL(req.url).searchParams.get("image_id");
  if (!imageId) return NextResponse.json({ error: "Version manquante." }, { status: 400 });
  if (!openrouterEnabled()) return NextResponse.json({ error: "Lecture des textes impossible sans OpenRouter." }, { status: 503 });
  const { data: image } = await session.supabase.from("ad_images").select("url, raw_url").eq("id", imageId).eq("ad_id", id).maybeSingle();
  if (!image) return NextResponse.json({ error: "Cette version n'existe plus." }, { status: 404 });
  try {
    // L'image brute, sans le logo posé par l'app : c'est elle que la retouche modifiera.
    return NextResponse.json({ texts: await readImageTexts(image.raw_url ?? image.url) });
  } catch (err) {
    return NextResponse.json({ error: `Lecture des textes impossible (${(err as Error).message}).` }, { status: 502 });
  }
}
