import { NextResponse } from "next/server";
import { ASSET_KINDS } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { MEDIA_TYPES, storeImage } from "@/lib/media";

// Limite des fonctions Vercel sur le corps d'une requête : on reste en dessous.
const MAX_BYTES = 4 * 1024 * 1024;

/** Ajoute une image à la bibliothèque de visuels d'une venture (logo, photo réelle, inspiration, charte). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !session.fullMember) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const ventureId = String(form?.get("venture_id") ?? "");
  const kind = String(form?.get("kind") ?? "");
  const note = String(form?.get("note") ?? "").trim().slice(0, 500);
  if (!(file instanceof File) || !ventureId || !(ASSET_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Image, venture et type requis." }, { status: 400 });
  }
  if (!MEDIA_TYPES[file.type]) return NextResponse.json({ error: "Format non pris en charge : PNG, JPEG ou WebP." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image trop lourde : 4 Mo au plus." }, { status: 400 });

  const { data: venture } = await session.supabase.from("ventures").select("id, org_id").eq("id", ventureId).maybeSingle();
  if (!venture) return NextResponse.json({ error: "Venture introuvable." }, { status: 404 });

  try {
    const stored = await storeImage(venture.org_id, `bibliotheque/${venture.id}`, Buffer.from(await file.arrayBuffer()), file.type);
    const { data, error } = await session.supabase
      .from("venture_assets")
      .insert({ org_id: venture.org_id, venture_id: venture.id, kind, url: stored.url, path: stored.path, note: note || null, created_by: session.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
