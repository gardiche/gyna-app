import { NextResponse } from "next/server";
import { z } from "zod";
import { ASSET_KIND_LABEL, BrandKitContent, checkBrandText, IMAGE_ASPECTS, LOGO_CORNER_LABEL } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { bridgeFetch } from "@/lib/bridge";
import { parseDataUrl, storeImage } from "@/lib/media";
import { finishVisual, targetRatio, type VisualChecks } from "@/lib/finish-visual";

// La génération prend souvent plus d'une minute.
export const maxDuration = 300;

const Body = z.object({
  aspect: z.enum(IMAGE_ASPECTS).default("square"),
  note: z.string().max(600).optional(),
  asset_ids: z.array(z.string().uuid()).max(6).default([]),
  /** Rang de la diapositive d'un carrousel ; 0 = la couverture ou le visuel unique. */
  slide: z.number().int().min(0).max(30).default(0),
  /** Modifier une version déjà générée : son identifiant et ce qu'il faut changer (le reste de la consigne est repris). */
  base_image_id: z.string().uuid().optional(),
  change: z.string().trim().min(3).max(600).optional(),
  /** Consigne complète, éditée à la main : elle remplace celle que l'app construit. */
  prompt: z.string().trim().min(20).max(8000).optional(),
});

const PLATFORM: Record<string, string> = { meta: "Facebook et Instagram", instagram: "Instagram", linkedin: "LinkedIn", google: "Google", tiktok: "TikTok", other: "les réseaux sociaux" };
const ASPECT: Record<string, string> = { square: "carré (1:1)", portrait: "vertical (4:5 ou 9:16)", landscape: "horizontal (16:9)" };

interface Ref { kind: keyof typeof ASSET_KIND_LABEL; note: string | null; description: string | null }

/**
 * Consigne envoyée au générateur d'images. Il ne reçoit que du texte : les références choisies y entrent
 * par la description qu'en a faite l'agent Ads et par la note de l'associé.
 */
function buildPrompt(ad: any, venture: string, aspect: string, refs: Ref[], note: string | undefined, slide: number, kit: BrandKitContent | null, ratio: string): string {
  const format = aspect === "portrait" ? ratio : ASPECT[aspect];
  const lines = slide > 0 ? [
    `Diapositive ${slide + 1} sur ${ad.slides.length} d'un carrousel pour ${PLATFORM[ad.ad_batches.platform] ?? "les réseaux sociaux"}, format ${format}, pour « ${venture} ».`,
    "",
    `Texte de la diapositive, à écrire exactement, en grand et lisible : « ${ad.slides[slide].text} ».`,
    "",
    `Même série que la couverture, dont le texte est « ${ad.slides[0].text} » : même fond, mêmes couleurs, même typographie, même mise en page d'une diapositive à l'autre. Mise en page simple, le texte d'abord ; pas de photo différente à chaque diapositive.`,
    ad.visual_brief ? `Style de la série : ${ad.visual_brief}` : "",
  ] : [
    `${ad.ad_batches.kind === "post" ? (ad.slides?.length ? "Couverture d'un carrousel" : "Visuel d'un post") : "Visuel publicitaire"} pour ${PLATFORM[ad.ad_batches.platform] ?? "les réseaux sociaux"}, format ${format}, pour « ${venture} ».`,
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
  if (kit) {
    const brand: string[] = [];
    if (kit.palette.length) brand.push("Couleurs, à utiliser telles quelles et à elles seules : " + kit.palette.map((c) => `${c.nom} ${c.hex}${c.usage ? ` (${c.usage})` : ""}`).join(", ") + ".");
    if (kit.polices.titres || kit.polices.texte) brand.push(`Typographie : ${[kit.polices.titres && "titres en " + kit.polices.titres, kit.polices.texte && "texte en " + kit.polices.texte].filter(Boolean).join(", ")}.`);
    if (kit.logo.coin) brand.push(`Le coin ${LOGO_CORNER_LABEL[kit.logo.coin].toLowerCase()} (environ ${Math.round((kit.logo.taille_pct ?? 18) * 1.6)} % de la largeur sur ${Math.round((kit.logo.taille_pct ?? 18) * 0.9)} % de la hauteur) doit rester vide, en aplat uni de la couleur du fond : le vrai logo y sera posé ensuite. Ne dessine aucun logo, aucun monogramme, aucune flèche ni aucune marque dans ce coin ni ailleurs.`);
    for (const m of kit.mentions) brand.push(`Mention à faire figurer exactement : « ${m.texte} »${m.ou ? ` (${m.ou})` : ""}, en pastille plate et unie, sans ombre ni contour.`);
    if (kit.interdits.mots.length) brand.push(`Ne jamais écrire : ${kit.interdits.mots.join(", ")}.`);
    if (brand.length) lines.push("", "Charte de marque, obligatoire :", ...brand.map((b) => "- " + b));
  }
  lines.push(
    "",
    "Contraintes : tout texte incrusté est en français, sans faute, et se limite à celui demandé dans la description. " +
      "Lisible sur un téléphone. Aucun logo ni marque de tiers.",
    "",
    "Style, à respecter strictement : mise en page éditoriale sobre, à plat, comme une affiche de graphiste. " +
      "Interdits : traits, soulignements, éclairs, étincelles, confettis, gribouillis, flèches et formes décoratives autour du texte ou du sujet ; " +
      "ombres portées dures ou contours épais sur les lettres ; dégradés, lueurs, effets 3D ou néon ; formes organiques ou taches de couleur derrière une personne ; " +
      "autocollants, bulles et pastilles décoratives ; aspect lisse de banque d'images ou de rendu IA. " +
      "Peu d'éléments : un fond uni ou une photo, un titre, éventuellement la mention demandée. Texte aligné sur une grille régulière, marges généreuses. " +
      "S'il y a une photo : réelle, lumière naturelle, cadrage non centré, expression sobre, pas de sourire de pub.",
  );
  return lines.join("\n");
}

/** Le fichier du logo choisi dans la charte, ou null s'il n'y en a pas (ou plus) dans la bibliothèque. */
async function fetchLogo(db: any, assetId: string | null | undefined, ventureId: string): Promise<Buffer | null> {
  if (!assetId) return null;
  const { data: asset } = await db.from("venture_assets").select("url").eq("id", assetId).eq("venture_id", ventureId).eq("kind", "logo").maybeSingle();
  if (!asset) return null;
  const r = await fetch(asset.url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error("le logo de la charte est illisible");
  return Buffer.from(await r.arrayBuffer());
}

/** Génère le visuel d'une pub à la demande d'un associé et le range avec la pub. Rien n'est publié. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.fullMember) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide" }, { status: 400 });
  let { aspect, slide } = parsed.data;
  const { note, asset_ids, base_image_id, change, prompt: promptOverride } = parsed.data;
  const db = session.supabase;

  const { data: ad } = await db
    .from("ads")
    .select("id, org_id, headline, primary_text, visual_brief, slides, ad_batches!inner(kind, platform, venture_id, ventures(name))")
    .eq("id", id)
    .maybeSingle();
  if (!ad) return NextResponse.json({ error: "Pub introuvable." }, { status: 404 });
  const batch = (ad as any).ad_batches;
  if (slide > 0 && !(ad.slides as unknown[] | null)?.[slide]) return NextResponse.json({ error: "Cette diapositive n'existe pas." }, { status: 400 });
  const { data: refs } = asset_ids.length
    ? await db.from("venture_assets").select("kind, note, description").in("id", asset_ids).eq("venture_id", batch.venture_id)
    : { data: [] as Ref[] };

  const { data: kitRow } = await db.from("brand_kits").select("logo_asset_id, content").eq("venture_id", batch.venture_id).order("version", { ascending: false }).limit(1).maybeSingle();
  const kit = kitRow ? BrandKitContent.parse(kitRow.content) : null;
  // Modifier une version : on repart de sa consigne, avec le même format, et on ajoute le changement demandé.
  // Le générateur ne reçoit que du texte : il refait l'image à partir de la consigne, il ne retouche pas l'ancienne.
  let base: { prompt: string; aspect: string; slide: number | null } | null = null;
  if (base_image_id) {
    const { data } = await db.from("ad_images").select("prompt, aspect, slide").eq("id", base_image_id).eq("ad_id", ad.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Cette version n'existe plus." }, { status: 404 });
    base = data;
    aspect = data.aspect as typeof aspect;
    slide = data.slide ?? 0;
  }
  const prompt = promptOverride
    ? promptOverride
    : base && change
      ? `${base.prompt}\n\nModification demandée sur la version précédente : ${change}. Garde tout le reste identique (composition, texte, couleurs, cadrage, style) et n'applique que ce changement.`
      : buildPrompt(ad, batch.ventures?.name ?? "la venture", aspect, (refs ?? []) as Ref[], note?.trim() || undefined, slide, kit, targetRatio(kit, aspect));
  const r = await bridgeFetch("/images", { body: { prompt, aspect_ratio: aspect }, signal: AbortSignal.timeout(280_000) }).catch(() => null);
  if (!r) return NextResponse.json({ error: "Le pont ne répond pas ou la génération a pris trop de temps." }, { status: 504 });
  const out = (await r.json().catch(() => ({}))) as { image_data?: string; error?: string };
  if (!r.ok || !out.image_data) return NextResponse.json({ error: out.error ?? "La génération a échoué." }, { status: 502 });
  const image = parseDataUrl(out.image_data);
  if (!image) return NextResponse.json({ error: "Image illisible renvoyée par Hermes." }, { status: 502 });

  // Finition déterministe : format de la charte, vrai logo, vérifications. En cas d'échec, l'image brute est gardée et le dit.
  let checks: VisualChecks | null = null;
  if (kit) {
    try {
      const logo = await fetchLogo(db, kitRow?.logo_asset_id, batch.venture_id);
      const done = await finishVisual({ image: image.data, mime: image.mime, aspect, kit, logo });
      image.data = done.data;
      image.mime = done.mime;
      checks = done.checks;
    } catch (err) {
      checks = { format: null, logo: null, palette: null, textes: [], avertissements: [`Finition impossible, image brute conservée : ${(err as Error).message}`] };
    }
    const slideTexts = ((ad.slides as Array<{ text: string }> | null) ?? []).map((x) => x.text);
    checks.textes = checkBrandText(kit, [ad.headline, ad.primary_text, ...slideTexts]);
    if (checks.textes.length) checks.avertissements.push(`Le texte de la pub enfreint la charte : ${checks.textes.join(", ")}.`);
  }

  try {
    const stored = await storeImage(ad.org_id, `pubs/${ad.id}`, image.data, image.mime);
    const { error } = await db
      .from("ad_images")
      .insert({ org_id: ad.org_id, ad_id: ad.id, url: stored.url, path: stored.path, prompt, aspect, slide, note: note?.trim() || null, checks, created_by: session.userId });
    if (error) throw new Error(error.message);
    await db.from("actions").insert({ org_id: ad.org_id, agent: "associe", tool: "generate_ad_image", result_summary: "Visuel généré pour une pub" });
    return NextResponse.json({ ok: true, url: stored.url, checks });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
