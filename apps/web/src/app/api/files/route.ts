import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { FILE_TYPES, storeFile } from "@/lib/media";

// Limite des fonctions Vercel sur le corps d'une requête : on reste en dessous.
const MAX_BYTES = 4 * 1024 * 1024;
/** Au-delà, le texte d'un fichier n'est plus recopié dans le message : Gyna le lit par son adresse. */
const INLINE_CHARS = 20_000;

/** Dépose un fichier à joindre à un message du chat. Renvoie de quoi le citer dans le message. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.campaignViewer) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier requis." }, { status: 400 });
  // Certains navigateurs n'annoncent pas de type pour .md ou .csv : on se rabat sur l'extension.
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = FILE_TYPES[file.type] ? file.type : Object.entries(FILE_TYPES).find(([, e]) => e === ext)?.[0];
  if (!type) return NextResponse.json({ error: "Format non pris en charge : image (PNG, JPEG, WebP), PDF, texte, Markdown, CSV ou JSON." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Fichier trop lourd : 4 Mo au plus." }, { status: 400 });

  try {
    const data = Buffer.from(await file.arrayBuffer());
    const stored = await storeFile(session.orgId, "conversations", data, type);
    const isText = type.startsWith("text/") || type === "application/json";
    const text = isText ? data.toString("utf8") : null;
    return NextResponse.json({
      name: file.name.slice(0, 120),
      url: stored.url,
      path: stored.path,
      type,
      size: file.size,
      ...(text && text.length <= INLINE_CHARS ? { text } : {}),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
