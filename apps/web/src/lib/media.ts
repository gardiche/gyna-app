import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase/server";

export const MEDIA_BUCKET = "gyna-media";
export const MEDIA_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/**
 * Dépose une image dans le bucket des visuels, sous un chemin aléatoire rangé par organisation.
 * Le bucket est public en lecture (les agents regardent ces images par leur adresse) ; seule l'app y écrit.
 */
export async function storeImage(orgId: string, folder: string, data: Buffer, mime: string): Promise<{ url: string; path: string }> {
  const ext = MEDIA_TYPES[mime];
  if (!ext) throw new Error("Format d'image non pris en charge (PNG, JPEG ou WebP).");
  const path = `${orgId}/${folder}/${randomUUID()}.${ext}`;
  const storage = supabaseAdmin().storage.from(MEDIA_BUCKET);
  const { error } = await storage.upload(path, data, { contentType: mime, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return { url: storage.getPublicUrl(path).data.publicUrl, path };
}

export async function removeImage(path: string): Promise<void> {
  await supabaseAdmin().storage.from(MEDIA_BUCKET).remove([path]);
}

/** « data:image/png;base64,… » → contenu et type. */
export function parseDataUrl(dataUrl: string): { data: Buffer; mime: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/s);
  return m ? { mime: m[1]!, data: Buffer.from(m[2]!, "base64") } : null;
}
