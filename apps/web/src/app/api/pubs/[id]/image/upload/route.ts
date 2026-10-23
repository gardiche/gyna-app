import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { MEDIA_TYPES, storeImage } from "@/lib/media";

const MAX_BYTES = 4 * 1024 * 1024;

/** Dépose le visuel d'une pub ou d'un post, fait ailleurs (Canva, photo), à la place d'une image générée. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.fullMember) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Image requise." }, { status: 400 });
  if (!MEDIA_TYPES[file.type]) return NextResponse.json({ error: "Format non pris en charge : PNG, JPEG ou WebP." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image trop lourde : 4 Mo au plus." }, { status: 400 });

  const slide = Number(form?.get("slide") ?? 0);
  if (!Number.isInteger(slide) || slide < 0 || slide > 30) return NextResponse.json({ error: "Diapositive invalide." }, { status: 400 });

  const { data: ad } = await session.supabase.from("ads").select("id, org_id").eq("id", id).maybeSingle();
  if (!ad) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  try {
    const stored = await storeImage(ad.org_id, `pubs/${ad.id}`, Buffer.from(await file.arrayBuffer()), file.type);
    const { error } = await session.supabase
      .from("ad_images")
      .insert({ org_id: ad.org_id, ad_id: ad.id, url: stored.url, path: stored.path, prompt: "Image déposée par un associé", aspect: "square", slide, created_by: session.userId });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, url: stored.url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
