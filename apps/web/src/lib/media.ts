import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase/server";

export const MEDIA_BUCKET = "gyna-media";
export const MEDIA_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
/** Fichiers qu'un associé peut joindre à un message : images, et documents que Gyna sait lire. */
export const FILE_TYPES: Record<string, string> = {
  ...MEDIA_TYPES,
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
};

/**
 * Dépose une image dans le bucket des visuels, sous un chemin aléatoire rangé par organisation.
 * Le bucket est public en lecture (les agents regardent ces images par leur adresse) ; seule l'app y écrit.
 */
export async function storeImage(orgId: string, folder: string, data: Buffer, mime: string): Promise<{ url: string; path: string }> {
  if (!MEDIA_TYPES[mime]) throw new Error("Format d'image non pris en charge (PNG, JPEG ou WebP).");
  return storeFile(orgId, folder, data, mime);
}

/** Comme storeImage, pour tout fichier accepté en pièce jointe. */
export async function storeFile(orgId: string, folder: string, data: Buffer, mime: string): Promise<{ url: string; path: string }> {
  const ext = FILE_TYPES[mime];
  if (!ext) throw new Error("Format de fichier non pris en charge.");
  const path = `${orgId}/${folder}/${randomUUID()}.${ext}`;
  const storage = supabaseAdmin().storage.from(MEDIA_BUCKET);
  const { error } = await storage.upload(path, data, { contentType: mime, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return { url: storage.getPublicUrl(path).data.publicUrl, path };
}

export async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length) await supabaseAdmin().storage.from(MEDIA_BUCKET).remove(paths);
}

/** Adresse publique d'un fichier de l'organisation : sert à vérifier qu'une pièce jointe vient bien de chez nous. */
export function publicPrefix(orgId: string): string {
  return supabaseAdmin().storage.from(MEDIA_BUCKET).getPublicUrl(`${orgId}/`).data.publicUrl;
}

export async function removeImage(path: string): Promise<void> {
  await supabaseAdmin().storage.from(MEDIA_BUCKET).remove([path]);
}

/** « data:image/png;base64,… » → contenu et type. */
export function parseDataUrl(dataUrl: string): { data: Buffer; mime: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/s);
  return m ? { mime: m[1]!, data: Buffer.from(m[2]!, "base64") } : null;
}
