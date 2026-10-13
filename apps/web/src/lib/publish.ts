import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Accès Meta, posé par un associé dans les variables d'environnement ; jamais dans le code ni dans le chat. */
const meta = () => ({
  token: process.env.META_ACCESS_TOKEN,
  igUserId: process.env.META_IG_USER_ID,
  pageId: process.env.META_PAGE_ID,
  base: `https://graph.facebook.com${process.env.META_GRAPH_VERSION ? `/${process.env.META_GRAPH_VERSION}` : ""}`,
});

export const publishingStatus = () => ({ instagram: Boolean(meta().token && meta().igUserId), facebook: Boolean(meta().token && meta().pageId), linkedin: false });

async function graph(path: string, params: Record<string, string>, method: "GET" | "POST" = "POST", as?: string): Promise<any> {
  const { token, base } = meta();
  const body = new URLSearchParams({ ...params, access_token: as ?? token! });
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

/**
 * Publie un carrousel : chaque image devient un élément, puis un conteneur les réunit avec la légende.
 * Instagram recadre toutes les images au format de la première.
 */
async function publishInstagramCarousel(imageUrls: string[], caption: string): Promise<string | null> {
  const { igUserId } = meta();
  const children: string[] = [];
  for (const image_url of imageUrls) {
    const item = await graph(`${igUserId}/media`, { image_url, is_carousel_item: "true" });
    await waitReady(item.id);
    children.push(item.id);
  }
  const container = await graph(`${igUserId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption });
  await waitReady(container.id);
  const published = await graph(`${igUserId}/media_publish`, { creation_id: container.id });
  const info = await graph(published.id, { fields: "permalink" }, "GET").catch(() => null);
  return info?.permalink ?? null;
}

/**
 * Publie sur la Page Facebook : une photo avec son texte, ou plusieurs photos réunies dans une même publication.
 * La Page s'exprime avec son propre jeton, obtenu à partir de celui de l'utilisateur système.
 */
async function publishFacebook(imageUrls: string[], message: string): Promise<string | null> {
  const { pageId } = meta();
  const page = await graph(pageId!, { fields: "access_token" }, "GET");
  if (!page.access_token) throw new Error("le jeton n'a pas accès à la Page (autorisation pages_manage_posts ou accès de l'utilisateur système à la Page).");
  let postId: string | undefined;
  if (imageUrls.length === 1) {
    const photo = await graph(`${pageId}/photos`, { url: imageUrls[0]!, message }, "POST", page.access_token);
    postId = photo.post_id ?? photo.id;
  } else {
    const media: Array<{ media_fbid: string }> = [];
    for (const url of imageUrls) {
      const photo = await graph(`${pageId}/photos`, { url, published: "false" }, "POST", page.access_token);
      media.push({ media_fbid: photo.id });
    }
    const post = await graph(`${pageId}/feed`, { message, attached_media: JSON.stringify(media) }, "POST", page.access_token);
    postId = post.id;
  }
  return postId ? `https://www.facebook.com/${postId}` : null;
}

export type PublishResult = { ok: true; url: string | null } | { ok: false; error: string };

/**
 * Publie un post approuvé. Appelé seulement après la décision d'un associé (« publier maintenant »
 * ou heure planifiée). Le passage à « publishing » sert de verrou : un post ne part qu'une fois.
 */
export async function publishPost(db: SupabaseClient, adId: string, from: Array<"scheduled" | "failed" | null>): Promise<PublishResult> {
  const { data: ad } = await db
    .from("ads")
    .select("id, org_id, status, primary_text, format, slides, published_at, publish_status, also_facebook, ad_batches!inner(kind, platform), ad_images(url, created_at, slide)")
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
  // La dernière image de chaque rang : 0 pour la couverture ou le visuel unique, puis une par diapositive.
  const images: Array<{ url: string; created_at: string; slide: number | null }> = ((ad as any).ad_images ?? []).slice().sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
  const latest = (slide: number) => images.find((im) => (im.slide ?? 0) === slide);
  const slideCount: number = ad.slides?.length ?? 0;
  const image = latest(0);
  if (!image) return fail(slideCount ? "Le carrousel n'a pas de couverture : générez ou déposez son visuel d'abord." : "Instagram exige une image : générez ou déposez le visuel d'abord.");
  // Carrousel : seules les diapositives qui ont une image partent, dans l'ordre. L'associé l'a vu avant de confirmer.
  const carousel = slideCount ? Array.from({ length: slideCount }, (_, i) => latest(i)?.url).filter((url): url is string => Boolean(url)) : null;
  if (carousel && (carousel.length < 2 || carousel.length > 10)) {
    return fail(carousel.length < 2 ? "Un carrousel demande au moins 2 images : générez ou déposez le visuel d'une autre diapositive." : "Instagram accepte 10 images au plus par carrousel.");
  }

  // Verrou : on ne publie que si le post est encore dans l'état attendu.
  let lock = db.from("ads").update({ publish_status: "publishing", publish_error: null }).eq("id", adId);
  const states = from.filter((s): s is "scheduled" | "failed" => s !== null);
  lock = from.includes(null)
    ? lock.or(`publish_status.is.null${states.length ? `,publish_status.in.(${states.join(",")})` : ""}`)
    : lock.in("publish_status", states);
  const { data: locked } = await lock.select("id");
  if (!locked?.length) return { ok: false, error: "Publication déjà en cours ou déjà faite." };

  try {
    const url = carousel ? await publishInstagramCarousel(carousel, ad.primary_text) : await publishInstagram(image.url, ad.primary_text);
    await db.from("ads").update({ publish_status: "published", published_at: new Date().toISOString(), published_url: url }).eq("id", adId);
    await db.from("actions").insert({ org_id: ad.org_id, agent: "associe", tool: "publish_post", result_summary: `Post publié sur Instagram${url ? ` : ${url}` : ""}` });
    // Facebook vient après : un refus de sa part ne défait pas la publication Instagram, il est signalé sur le post.
    if (ad.also_facebook) {
      try {
        if (!publishingStatus().facebook) throw new Error("la Page Facebook n'est pas reliée à l'app (variable META_PAGE_ID).");
        const fb = await publishFacebook(carousel ?? [image.url], ad.primary_text);
        await db.from("ads").update({ facebook_url: fb }).eq("id", adId);
        await db.from("actions").insert({ org_id: ad.org_id, agent: "associe", tool: "publish_post", result_summary: `Post publié sur Facebook${fb ? ` : ${fb}` : ""}` });
      } catch (err) {
        const reason = `Publié sur Instagram, mais pas sur Facebook : ${(err as Error).message}`;
        await db.from("ads").update({ publish_error: reason }).eq("id", adId);
        await db.from("actions").insert({ org_id: ad.org_id, agent: "associe", tool: "publish_post", result_summary: reason, status: "error" });
      }
    }
    return { ok: true, url };
  } catch (err) {
    const error = (err as Error).message;
    await db.from("actions").insert({ org_id: ad.org_id, agent: "associe", tool: "publish_post", result_summary: `Échec de la publication : ${error}`, status: "error" });
    return fail(error);
  }
}
