import { NextResponse } from "next/server";
import { z } from "zod";
import { ASSET_KIND_LABEL, IMAGE_ASPECTS } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { bridgeFetch } from "@/lib/bridge";
import { parseDataUrl, storeImage } from "@/lib/media";

// La génération prend souvent plus d'une minute.
export const maxDuration = 300;

const Body = z.object({
  aspect: z.enum(IMAGE_ASPECTS).default("square"),
  note: z.string().max(600).optional(),
  asset_ids: z.array(z.string().uuid()).max(6).default([]),
});

const PLATFORM: Record<string, string> = { meta: "Facebook et Instagram", instagram: "Instagram", linkedin: "LinkedIn", google: "Google", tiktok: "TikTok", other: "les réseaux sociaux" };
const ASPECT: Record<string, string> = { square: "carré (1:1)", portrait: "vertical (4:5 ou 9:16)", landscape: "horizontal (16:9)" };

interface Ref { kind: keyof typeof ASSET_KIND_LABEL; note: string | null; description: string | null }

/**
 * Consigne envoyée au générateur d'images. Il ne reçoit que du texte : les références choisies y entrent
 * par la description qu'en a faite l'agent Ads et par la note de l'associé.
 */
function buildPrompt(ad: any, venture: string, aspect: string, refs: Ref[], note?: string): string {
  const lines = [
    `${ad.ad_batches.kind === "post" ? (ad.slides?.length ? "Couverture d'un carrousel" : "Visuel d'un post") : "Visuel publicitaire"} pour ${PLATFORM[ad.ad_batches.platform] ?? "les réseaux sociaux"}, format ${ASPECT[aspect]}, pour « ${venture} ».`,
    "",
    `Ce que montre le visuel : ${ad.visual_brief || "une image sobre et réaliste qui illustre le texte de la pub ci-dessous."}`,
    "",
    ad.slides?.length ? `Texte de la couverture, à écrire exactement : « ${ad.slides[0].text} ».` : "",
    `Contexte, à ne pas écrire dans l'image : ${ad.headline ? `titre « ${ad.headline} », ` : ""}le texte commence par « ${String(ad.primary_text).slice(0, 220)} ».`,
  ];
  const useful = refs.filter((r) => r.description || r.note);
  if (useful.length) {
    lines.push("", "Références à respecter :");
    for (const r of useful) {
      lines.push(`- ${ASSET_KIND_LABEL[r.kind]} : ${r.description ?? "non décrite"}${r.note ? ` Remarque : ${r.note}` : ""}`);
    }
  }
  if (note) lines.push("", `Consigne supplémentaire : ${note}`);
  lines.push(
    "",
    "Contraintes : tout texte incrusté est en français, sans faute, et se limite à celui demandé dans la description. " +
      "Lisible sur un téléphone. Aucun logo ni marque de tiers. Pas de logo inventé : laisser un coin dégagé pour y poser le vrai logo ensuite. " +
      "Rendu naturel, proche d'une vraie photo ou d'une mise en page simple, pas d'esthétique de banque d'images.",
  );
  return lines.join("\n");
}

/** Génère le visuel d'une pub à la demande d'un associé et le range avec la pub. Rien n'est publié. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide" }, { status: 400 });
  const { aspect, note, asset_ids } = parsed.data;
  const db = session.supabase;

  const { data: ad } = await db
    .from("ads")
    .select("id, org_id, headline, primary_text, visual_brief, slides, ad_batches!inner(kind, platform, venture_id, ventures(name))")
    .eq("id", id)
    .maybeSingle();
  if (!ad) return NextResponse.json({ error: "Pub introuvable." }, { status: 404 });
  const batch = (ad as any).ad_batches;
  const { data: refs } = asset_ids.length
    ? await db.from("venture_assets").select("kind, note, description").in("id", asset_ids).eq("venture_id", batch.venture_id)
    : { data: [] as Ref[] };

  const prompt = buildPrompt(ad, batch.ventures?.name ?? "la venture", aspect, (refs ?? []) as Ref[], note?.trim() || undefined);
  const r = await bridgeFetch("/images", { body: { prompt, aspect_ratio: aspect }, signal: AbortSignal.timeout(280_000) }).catch(() => null);
  if (!r) return NextResponse.json({ error: "Le pont ne répond pas ou la génération a pris trop de temps." }, { status: 504 });
  const out = (await r.json().catch(() => ({}))) as { image_data?: string; error?: string };
  if (!r.ok || !out.image_data) return NextResponse.json({ error: out.error ?? "La génération a échoué." }, { status: 502 });
  const image = parseDataUrl(out.image_data);
  if (!image) return NextResponse.json({ error: "Image illisible renvoyée par Hermes." }, { status: 502 });

  try {
    const stored = await storeImage(ad.org_id, `pubs/${ad.id}`, image.data, image.mime);
    const { error } = await db
      .from("ad_images")
      .insert({ org_id: ad.org_id, ad_id: ad.id, url: stored.url, path: stored.path, prompt, aspect, note: note?.trim() || null, created_by: session.userId });
    if (error) throw new Error(error.message);
    await db.from("actions").insert({ org_id: ad.org_id, agent: "associe", tool: "generate_ad_image", result_summary: "Visuel généré pour une pub" });
    return NextResponse.json({ ok: true, url: stored.url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
