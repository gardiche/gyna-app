import { NextResponse } from "next/server";
import { z } from "zod";
import { ASSET_KIND_LABEL, BrandKitContent, checkBrandText, IMAGE_ASPECTS } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { bridgeFetch } from "@/lib/bridge";
import { parseDataUrl, publicPrefix, storeImage } from "@/lib/media";
import { fetchLogo, finishVisual, logoZonePrompt, LOGO_POSITIONS, parseLogoInstruction, targetRatio, type LogoOverride, type VisualChecks } from "@/lib/finish-visual";
import { generateWithOpenRouter, openrouterEnabled } from "@/lib/openrouter-image";

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
  /** Images jointes à une retouche, déposées avant par /api/files : le rendu doit s'en inspirer. */
  inspiration_urls: z.array(z.string().url()).max(3).default([]),
  /** Emplacement et taille du logo pour cette génération, à la place de ceux de la charte. */
  logo: z.object({ coin: z.enum([...LOGO_POSITIONS, "aucun"]).optional(), taille_facteur: z.number().min(0.4).max(2.5).optional() }).optional(),
  /** Consigne complète, éditée à la main : elle remplace celle que l'app construit. */
  prompt: z.string().trim().min(20).max(8000).optional(),
});

const PLATFORM: Record<string, string> = { meta: "Facebook et Instagram", instagram: "Instagram", linkedin: "LinkedIn", google: "Google", tiktok: "TikTok", other: "les réseaux sociaux" };
const ASPECT: Record<string, string> = { square: "carré (1:1)", portrait: "vertical (4:5 ou 9:16)", landscape: "horizontal (16:9)" };

interface Ref { kind: keyof typeof ASSET_KIND_LABEL; note: string | null; description: string | null; url?: string }

/**
 * Consigne envoyée au générateur d'images. Il ne reçoit que du texte : les références choisies y entrent
 * par la description qu'en a faite l'agent Ads et par la note de l'associé.
 */
function buildPrompt(ad: any, venture: string, aspect: string, refs: Ref[], note: string | undefined, slide: number, kit: BrandKitContent | null, ratio: string, logoZone: string | null): string {
  const format = aspect === "portrait" ? ratio : ASPECT[aspect];
  const lines = slide > 0 ? [
    `Diapositive ${slide + 1} sur ${ad.slides.length} d'un carrousel pour ${PLATFORM[ad.ad_batches.platform] ?? "les réseaux sociaux"}, format ${format}, pour « ${venture} ».`,
    "",
    `Texte de la diapositive, à écrire exactement, en grand et lisible : « ${ad.slides[slide].text} ».`,
    "",
    `Même série que la couverture, dont le texte est « ${ad.slides[0].text} » : même fond, mêmes couleurs, même typographie, même mise en page d'une diapositive à l'autre. Mise en page simple, le texte d'abord ; pas de photo différente à chaque diapositive.`,
    ad.visual_brief ? `Style de la série : ${ad.visual_brief}` : "",
  ] : [
    `${ad.slides?.length ? "Couverture d'un carrousel" : ad.ad_batches.kind === "post" ? "Visuel d'un post" : "Visuel publicitaire"} pour ${PLATFORM[ad.ad_batches.platform] ?? "les réseaux sociaux"}, format ${format}, pour « ${venture} ».`,
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
    if (logoZone) brand.push(logoZone);
    for (const m of kit.mentions) brand.push(`Mention à faire figurer exactement : « ${m.texte} »${m.ou ? ` (${m.ou})` : ""}, en pastille plate et unie, sans ombre ni contour.`);
    if (kit.interdits.mots.length) brand.push(`Ne jamais écrire : ${kit.interdits.mots.join(", ")}.`);
    if (brand.length) lines.push("", "Charte de marque, obligatoire :", ...brand.map((b) => "- " + b));
  }
  lines.push(
    "",
    "Contraintes : tout texte incrusté est en français, sans faute, et se limite à celui demandé dans la description. " +
      "Lisible sur un téléphone. Aucun logo ni marque de tiers.",
    "",
    "Style : affiche percutante et colorée, dans l'esprit graphique de la marque. Très gros titre en majuscules, avec une ombre portée décalée dure ; " +
      "photo réelle détourée, en noir et blanc contrasté ou naturelle ; grandes formes plates et franches (rectangle ou forme jaune derrière le sujet) ; " +
      "pastille ronde pour la mention demandée ; fort contraste d'échelle entre les mots. " +
      "Interdits seulement : petits traits décoratifs, étincelles, confettis, gribouillis, dégradés, lueurs, effets 3D ou néon, mains ou visages déformés, " +
      "aspect lisse de banque d'images. Les couleurs et le logo sont ceux de la charte, rien d'autre.",
  );
  return lines.join("\n");
}

/** Génère le visuel d'une pub à la demande d'un associé et le range avec la pub. Rien n'est publié. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.fullMember) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide" }, { status: 400 });
  let { aspect, slide } = parsed.data;
  const { note, asset_ids, base_image_id, change, prompt: promptOverride, inspiration_urls, logo: bodyLogo } = parsed.data;
  // Seules les images déposées chez nous par l'organisation sont envoyées au générateur.
  if (inspiration_urls.some((u) => !u.startsWith(publicPrefix(session.orgId)))) return NextResponse.json({ error: "Image jointe non reconnue." }, { status: 400 });
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
    ? await db.from("venture_assets").select("kind, note, description, url").in("id", asset_ids).eq("venture_id", batch.venture_id)
    : { data: [] as Ref[] };

  const { data: kitRow } = await db.from("brand_kits").select("logo_asset_id, content").eq("venture_id", batch.venture_id).order("version", { ascending: false }).limit(1).maybeSingle();
  const kit = kitRow ? BrandKitContent.parse(kitRow.content) : null;
  // Modifier une version : on repart de sa consigne, avec le même format, et on ajoute le changement demandé.
  // Le générateur ne reçoit que du texte : il refait l'image à partir de la consigne, il ne retouche pas l'ancienne.
  let base: { prompt: string; aspect: string; slide: number | null; url: string; raw_url: string | null } | null = null;
  if (base_image_id) {
    const { data } = await db.from("ad_images").select("prompt, aspect, slide, url, raw_url").eq("id", base_image_id).eq("ad_id", ad.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Cette version n'existe plus." }, { status: 404 });
    base = data;
    aspect = data.aspect as typeof aspect;
    slide = data.slide ?? 0;
  }
  // Logo : l'emplacement de la charte, sauf si la génération en décide autrement (réglage, ou consigne du type « logo en bas à droite »).
  const said = parseLogoInstruction([change, note].filter(Boolean).join(" "), kit?.logo.coin ?? null);
  const logoOverride: LogoOverride | undefined =
    bodyLogo || said.override ? { ...(said.override ?? {}), ...(bodyLogo?.coin ? { coin: bodyLogo.coin } : {}), ...(bodyLogo?.taille_facteur ? { taille_facteur: bodyLogo.taille_facteur } : {}) } : undefined;
  const effectiveCoin = logoOverride?.coin ?? kit?.logo.coin ?? null;
  const effectiveSize = kit?.logo.taille_pct != null ? kit.logo.taille_pct * (logoOverride?.taille_facteur ?? 1) : null;
  // Seul le logo change : on ne régénère pas, on refait la finition sur l'image brute de la version choisie.
  const logoOnly = !!(base && kit && logoOverride && !promptOverride && !inspiration_urls.length && ((bodyLogo && !change?.trim()) || (bodyLogo === undefined && said.seul)));
  if (logoOnly && !base!.raw_url) return NextResponse.json({ error: "Cette version n'a pas d'image brute (générée avant la finition) : régénérez-la d'abord." }, { status: 400 });
  const prompt = logoOnly
    ? base!.prompt
    : promptOverride
    ? promptOverride
    : base && (change || inspiration_urls.length)
      ? `${base.prompt}\n\nModification demandée sur la version précédente : ${change ?? "rapprocher le rendu des images jointes"}${inspiration_urls.length ? ` (inspiré de ${inspiration_urls.length} image${inspiration_urls.length > 1 ? "s" : ""} jointe${inspiration_urls.length > 1 ? "s" : ""})` : ""}. Garde tout le reste identique (composition, texte, couleurs, cadrage, style) et n'applique que ce changement.`
      : buildPrompt(ad, batch.ventures?.name ?? "la venture", aspect, (refs ?? []) as Ref[], note?.trim() || undefined, slide, kit, targetRatio(kit, aspect), logoZonePrompt(effectiveCoin, effectiveSize));
  // OpenRouter (si la clé est posée) reçoit de vraies images : la version à retoucher, ou les inspirations cochées.
  // Sinon, ou en cas d'échec, le pont Hermes génère à partir du texte seul.
  let image: { data: Buffer; mime: string } | null = null;
  let cost: number | null = null;
  const notices: string[] = [];
  if (logoOnly) {
    const rawFile = await fetch(base!.raw_url!, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!rawFile?.ok) return NextResponse.json({ error: "L'image brute de cette version est introuvable." }, { status: 502 });
    const buf = Buffer.from(await rawFile.arrayBuffer());
    image = { data: buf, mime: buf[0] === 0xff ? "image/jpeg" : "image/png" };
  } else if (openrouterEnabled()) {
    try {
      const editing = !!(base && (change || inspiration_urls.length) && !promptOverride);
      const references = editing
        ? [base!.raw_url ?? base!.url, ...inspiration_urls]
        : ((refs ?? []) as Ref[]).filter((x) => x.kind !== "logo" && x.url).map((x) => x.url!).slice(0, 6);
      const sent = editing
        ? `Retouche l'image fournie (la première image)${change ? ` : ${change}` : ""}. ${inspiration_urls.length ? "Les autres images jointes sont des inspirations : rapproche le rendu de leur style, de leur composition et de leur ambiance, sans les copier ni y reprendre de logo. Garde le texte et le message de la première image. " : "Garde tout le reste strictement identique (composition, texte, couleurs, cadrage, style). "}Laisse vide le coin réservé au logo.`
        : references.length
          ? `${prompt}\n\nLes images jointes sont des références de style et d'ambiance : inspire-toi de leur composition, de leurs couleurs et de leur typographie sans les copier, et n'y reprends aucun logo.`
          : prompt;
      const g = await generateWithOpenRouter({ prompt: sent, aspect, references });
      image = { data: g.data, mime: g.mime };
      cost = g.costUsd;
    } catch (err) {
      notices.push(`OpenRouter indisponible (${(err as Error).message}) : image générée avec Hermes, sans image de référence.`);
    }
  }
  if (!image) {
    if (inspiration_urls.length) notices.push("Les images jointes n'ont pas été utilisées : le générateur Hermes ne reçoit que du texte.");
    const r = await bridgeFetch("/images", { body: { prompt, aspect_ratio: aspect }, signal: AbortSignal.timeout(280_000) }).catch(() => null);
    if (!r) return NextResponse.json({ error: "Le pont ne répond pas ou la génération a pris trop de temps." }, { status: 504 });
    const out = (await r.json().catch(() => ({}))) as { image_data?: string; error?: string };
    if (!r.ok || !out.image_data) return NextResponse.json({ error: out.error ?? "La génération a échoué." }, { status: 502 });
    image = parseDataUrl(out.image_data);
    if (!image) return NextResponse.json({ error: "Image illisible renvoyée par Hermes." }, { status: 502 });
  }
  const raw = { data: image.data, mime: image.mime };

  // Finition déterministe : format de la charte, vrai logo, vérifications. En cas d'échec, l'image brute est gardée et le dit.
  let checks: VisualChecks | null = null;
  if (kit) {
    try {
      const logo = await fetchLogo(db, kitRow?.logo_asset_id, batch.venture_id);
      const done = await finishVisual({ image: image.data, mime: image.mime, aspect, kit, logo, logoOverride });
      image.data = done.data;
      image.mime = done.mime;
      checks = done.checks;
    } catch (err) {
      checks = { format: null, logo: null, palette: null, textes: [], avertissements: [`Finition impossible, image brute conservée : ${(err as Error).message}`] };
    }
    const slideTexts = ((ad.slides as Array<{ text: string }> | null) ?? []).map((x) => x.text);
    checks.avertissements.push(...notices);
    checks.textes = checkBrandText(kit, [ad.headline, ad.primary_text, ...slideTexts]);
    if (checks.textes.length) checks.avertissements.push(`Le texte de la pub enfreint la charte : ${checks.textes.join(", ")}.`);
  }

  try {
    const stored = await storeImage(ad.org_id, `pubs/${ad.id}`, image.data, image.mime);
    // L'image brute (sans logo) sert de base aux retouches : le logo ne doit pas être renvoyé au générateur.
    const rawStored = logoOnly ? { url: base!.raw_url! } : kit ? await storeImage(ad.org_id, `pubs/${ad.id}`, raw.data, raw.mime) : null;
    const { error } = await db
      .from("ad_images")
      .insert({ org_id: ad.org_id, ad_id: ad.id, url: stored.url, path: stored.path, prompt, aspect, slide, note: note?.trim() || null, checks, raw_url: rawStored?.url ?? null, created_by: session.userId });
    if (error) throw new Error(error.message);
    await db.from("actions").insert({ org_id: ad.org_id, agent: "associe", tool: "generate_ad_image", result_summary: cost != null ? `Visuel généré pour une pub (OpenRouter, ${cost.toFixed(3)} $)` : "Visuel généré pour une pub" });
    return NextResponse.json({ ok: true, url: stored.url, checks });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
