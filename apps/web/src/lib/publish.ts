import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Accès Meta, posé par un associé dans les variables d'environnement ; jamais dans le code ni dans le chat. */
const meta = () => ({
  token: process.env.META_ACCESS_TOKEN,
  igUserId: process.env.META_IG_USER_ID,
  base: `https://graph.facebook.com${process.env.META_GRAPH_VERSION ? `/${process.env.META_GRAPH_VERSION}` : ""}`,
});

export const publishingStatus = () => ({ instagram: Boolean(meta().token && meta().igUserId), linkedin: false });

async function graph(path: string, params: Record<string, string>, method: "GET" | "POST" = "POST"): Promise<any> {
  const { token, base } = meta();
  const body = new URLSearchParams({ ...params, access_token: token! });
  const r = await fetch(method === "GET" ? `${base}/${path}?${body}` : `${base}/${path}`, {
    method,
    ...(method === "POST" ? { body } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error?.error_user_msg ?? data.error?.message ?? `Meta a répondu ${r.status}`);
  return data;
}

/** Instagram prépare l'image avant de l'accepter : on attend qu'elle soit prête. */
async function waitReady(containerId: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const s = await graph(containerId, { fields: "status_code" }, "GET");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("Instagram a refusé l'image (format ou dimensions).");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Instagram n'a pas fini de préparer l'image.");
}

/** Publie une image et sa légende sur le compte Instagram relié. Renvoie le lien du post en ligne. */
async function publishInstagram(imageUrl: string, caption: string): Promise<string | null> {
  const { igUserId } = meta();
  const container = await graph(`${igUserId}/media`, { image_url: imageUrl, caption });
  await waitReady(container.id);
  const published = await graph(`${igUserId}/media_publish`, { creation_id: container.id });
  const info = await graph(published.id, { fields: "permalink" }, "GET").catch(() => null);
  return info?.permalink ?? null;
}

export type PublishResult = { ok: true; url: string | null } | { ok: false; error: string };

/**
 * Publie un post approuvé. Appelé seulement après la décision d'un associé (« publier maintenant »
 * ou heure planifiée). Le passage à « publishing » sert de verrou : un post ne part qu'une fois.
 */
export async function publishPost(db: SupabaseClient, adId: string, from: Array<"scheduled" | "failed" | null>): Promise<PublishResult> {
  const { data: ad } = await db
    .from("ads")
    .select("id, org_id, status, primary_text, format, slides, published_at, publish_status, ad_batches!inner(kind, platform), ad_images(url, created_at)")
    .eq("id", adId)
    .maybeSingle();
  if (!ad) return { ok: false, error: "Post introuvable." };
  const batch = (ad as any).ad_batches;
  const fail = async (error: string): Promise<PublishResult> => {
    await db.from("ads").update({ publish_status: "failed", publish_error: error }).eq("id", adId);
    return { ok: false, error };
  };

  if (batch.kind !== "post") return { ok: false, error: "Seuls les posts se publient depuis l'app." };
  if (ad.status !== "approved") return { ok: false, error: "Le post doit d'abord être approuvé." };
  if (ad.published_at) return { ok: false, error: "Ce post est déjà publié." };
  if (batch.platform !== "instagram") return fail("La publication automatique n'existe que pour Instagram pour l'instant.");
  if (!publishingStatus().instagram) return fail("Le compte Instagram n'est pas encore relié à l'app.");
  if (ad.slides?.length) return fail("Les carrousels se publient encore à la main.");
  const image = ((ad as any).ad_images ?? []).slice().sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0];
  if (!image) return fail("Instagram exige une image : générez ou déposez le visuel d'abord.");

  // Verrou : on ne publie que si le post est encore dans l'état attendu.
  let lock = db.from("ads").update({ publish_status: "publishing", publish_error: null }).eq("id", adId);
  const states = from.filter((s): s is "scheduled" | "failed" => s !== null);
  lock = from.includes(null)
    ? lock.or(`publish_status.is.null${states.length ? `,publish_status.in.(${states.join(",")})` : ""}`)
    : lock.in("publish_status", states);
  const { data: locked } = await lock.select("id");
  if (!locked?.length) return { ok: false, error: "Publication déjà en cours ou déjà faite." };

  try {
    const url = await publishInstagram(image.url, ad.primary_text);
    await db.from("ads").update({ publish_status: "published", published_at: new Date().toISOString(), published_url: url }).eq("id", adId);
    await db.from("actions").insert({ org_id: ad.org_id, agent: "associe", tool: "publish_post", result_summary: `Post publié sur Instagram${url ? ` : ${url}` : ""}` });
    return { ok: true, url };
  } catch (err) {
    const error = (err as Error).message;
    await db.from("actions").insert({ org_id: ad.org_id, agent: "associe", tool: "publish_post", result_summary: `Échec de la publication : ${error}`, status: "error" });
    return fail(error);
  }
}
