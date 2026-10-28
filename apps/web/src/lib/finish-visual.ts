import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import type { BrandKitContent } from "@gyna/schemas";

/** Relevé de la finition et des vérifications d'un visuel, gardé avec l'image (ad_images.checks). */
export interface VisualChecks {
  format: { cible: string; largeur: number; hauteur: number; recadrage_pct: number } | null;
  logo: { pose: boolean; plaque: boolean; clair: boolean; zone_chargee: boolean } | null;
  palette: { part_pct: number } | null;
  /** Textes de la pub qui enfreignent la charte (mots interdits, point d'exclamation, prix…). */
  textes: string[];
  avertissements: string[];
}

const WIDTH = { square: 1080, portrait: 1080, landscape: 1280 } as const;
const DEFAULT_RATIO = { square: "1:1", portrait: "4:5", landscape: "16:9" } as const;
type Aspect = keyof typeof WIDTH;

/** Format cible d'un visuel : celui que la charte donne aux images et carrousels, sinon 4:5 en vertical. */
export function targetRatio(kit: BrandKitContent | null, aspect: Aspect): string {
  if (aspect === "portrait") {
    const f = kit?.formats.find((x) => /image|carrousel/i.test(x.canal) && /^\d+:\d+$/.test(x.format));
    if (f) return f.format;
  }
  return DEFAULT_RATIO[aspect];
}

function size(aspect: Aspect, ratio: string): { width: number; height: number } {
  const [a, b] = ratio.split(":").map(Number) as [number, number];
  const width = WIDTH[aspect];
  return { width, height: Math.round((width * b) / a) };
}

/** Le fichier du logo choisi dans la charte, ou null s'il n'y en a pas (ou plus) dans la bibliothèque. */
export async function fetchLogo(db: any, assetId: string | null | undefined, ventureId: string): Promise<Buffer | null> {
  if (!assetId) return null;
  const { data: asset } = await db.from("venture_assets").select("url").eq("id", assetId).eq("venture_id", ventureId).eq("kind", "logo").maybeSingle();
  if (!asset) return null;
  const r = await fetch(asset.url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error("le logo de la charte est illisible");
  return Buffer.from(await r.arrayBuffer());
}

/* ---------- Couleurs ---------- */

const hexToRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

function rgbToLab([r, g, b]: [number, number, number]): [number, number, number] {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

const deltaE = (p: [number, number, number], q: [number, number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** Part des teintes vives de l'image (les gris, blancs et noirs sont neutres) proches d'une couleur de la palette. */
async function paletteShare(image: Buffer, palette: BrandKitContent["palette"]): Promise<number | null> {
  if (!palette.length) return null;
  const { data } = await sharp(image).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const labs = palette.map((c) => rgbToLab(hexToRgb(c.hex)));
  let vivid = 0;
  let near = 0;
  for (let i = 0; i < data.length; i += 3) {
    const lab = rgbToLab([data[i]!, data[i + 1]!, data[i + 2]!]);
    if (Math.hypot(lab[1], lab[2]) < 20) continue;
    vivid++;
    if (labs.some((p) => deltaE(lab, p) < 25)) near++;
  }
  return vivid < 40 ? 100 : Math.round((near / vivid) * 100);
}

/* ---------- Emplacement du logo, modifiable à chaque génération ---------- */

export const LOGO_POSITIONS = ["haut-gauche", "haut-centre", "haut-droite", "centre", "bas-gauche", "bas-centre", "bas-droite"] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];
export const POSITION_LABEL: Record<LogoPosition, string> = {
  "haut-gauche": "en haut à gauche",
  "haut-centre": "en haut au centre",
  "haut-droite": "en haut à droite",
  centre: "au centre",
  "bas-gauche": "en bas à gauche",
  "bas-centre": "en bas au centre",
  "bas-droite": "en bas à droite",
};

/** Ce qu'un associé change pour une génération : l'emplacement (ou « aucun »), et un facteur de taille. */
export interface LogoOverride {
  coin?: LogoPosition | "aucun";
  taille_facteur?: number;
}

const plain = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Lit, dans une consigne libre, ce qui concerne le logo : « mets le logo en bas à droite », « logo plus grand »,
 * « sans logo ». `seul` vaut vrai quand la consigne ne demande rien d'autre : l'image brute est alors seulement refinie.
 */
export function parseLogoInstruction(text: string, current: string | null): { override: LogoOverride | null; seul: boolean } {
  const t = plain(text);
  if (!/logo/.test(t)) return { override: null, seul: false };
  const override: LogoOverride = {};
  if (/(sans|pas de|retire|retirer|supprime|supprimer|enleve|enlever|efface|effacer) (le )?logo|logo (en moins|retire|supprime)/.test(t)) override.coin = "aucun";
  else {
    const v = /\bhaut\b/.test(t) ? "haut" : /\bbas\b/.test(t) ? "bas" : /\b(centre|milieu)\b/.test(t) ? "centre" : null;
    const h = /\bgauche\b/.test(t) ? "gauche" : /\bdroite\b/.test(t) ? "droite" : /\b(centre|milieu)\b/.test(t) ? "centre" : null;
    if (v || h) {
      const curV = current?.startsWith("bas") ? "bas" : "haut";
      const vv = v ?? curV;
      const hh = h ?? "centre";
      override.coin = (vv === "centre" ? "centre" : `${vv}-${hh}`) as LogoPosition;
    }
  }
  if (/logo (plus grand|agrandi|plus gros)|agrandi\w* (le )?logo|(plus grand|plus gros) logo/.test(t)) override.taille_facteur = 1.4;
  if (/logo (plus petit|reduit)|(reduis|reduire|rapetiss)\w* (le )?logo|plus petit logo/.test(t)) override.taille_facteur = 0.7;
  if (!override.coin && !override.taille_facteur) return { override: null, seul: false };
  const stop = new Set("le la les un une logo mets met mettre place placer deplace deplacer peux pouvez tu vous s il te plait svp en au a du de des plus grand grande gros petit haut bas gauche droite centre milieu coin et sans pas retire retirer supprime supprimer enleve enlever agrandis reduis taille sur".split(" "));
  const reste = t.split(/[^a-z0-9]+/).filter((w) => w && !stop.has(w));
  return { override, seul: reste.length === 0 };
}

/** Phrase pour le générateur : la zone qu'il doit laisser vide pour le logo (rien si le logo est retiré). */
export function logoZonePrompt(coin: LogoPosition | "aucun" | null, taille_pct: number | null): string | null {
  if (!coin || coin === "aucun") return null;
  const t = taille_pct ?? 18;
  return `La zone ${POSITION_LABEL[coin]} (environ ${Math.round(t * 1.6)} % de la largeur sur ${Math.round(t * 0.9)} % de la hauteur) doit rester vide, en aplat uni de la couleur du fond : le vrai logo y sera posé ensuite. Ne dessine aucun logo, aucun monogramme, aucune flèche ni aucune marque dans cette zone ni ailleurs.`;
}

/* ---------- Finition ---------- */

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Version claire du logo pour un fond sombre : ses pixels foncés (le texte noir) prennent la couleur donnée, le reste est inchangé. */
async function lighten(logoPng: Buffer, hex: string): Promise<Buffer> {
  const { data, info } = await sharp(logoPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [R, G, B] = hexToRgb(hex);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! > 0 && luminance(data[i]!, data[i + 1]!, data[i + 2]!) < 90) {
      data[i] = R;
      data[i + 1] = G;
      data[i + 2] = B;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/**
 * Finition déterministe d'un visuel généré : recadrage au format de la charte, pose du vrai logo à l'emplacement
 * prévu (sur une plaque unie si le fond est sombre ou chargé : le générateur dessine parfois un faux logo dans le coin),
 * puis relevé des vérifications. Les textes de la pub sont contrôlés à part (checkBrandText).
 */
export async function finishVisual(input: { image: Buffer; mime: string; aspect: Aspect; kit: BrandKitContent; logo: Buffer | null; logoOverride?: LogoOverride }): Promise<{ data: Buffer; mime: string; checks: VisualChecks }> {
  const { kit } = input;
  const checks: VisualChecks = { format: null, logo: null, palette: null, textes: [], avertissements: [] };

  const ratio = targetRatio(kit, input.aspect);
  const { width, height } = size(input.aspect, ratio);
  const meta = await sharp(input.image).metadata();
  const srcRatio = (meta.width ?? width) / (meta.height ?? height);
  const dstRatio = width / height;
  const recadrage = Math.round((srcRatio > dstRatio ? 1 - dstRatio / srcRatio : 1 - srcRatio / dstRatio) * 100);
  checks.format = { cible: ratio, largeur: width, hauteur: height, recadrage_pct: recadrage };
  if (recadrage > 12) checks.avertissements.push(`Image recadrée de ${recadrage} % pour tenir en ${ratio} : vérifier que le texte n'est pas coupé.`);

  let base = await sharp(input.image).resize(width, height, { fit: "cover", position: "centre" }).flatten({ background: "#ffffff" }).png().toBuffer();

  const share = await paletteShare(base, kit.palette);
  if (share != null) {
    checks.palette = { part_pct: share };
    if (share < 50) checks.avertissements.push(`Couleurs : seulement ${share} % des teintes vives sont proches de la palette de la charte.`);
  }

  const ov = input.logoOverride;
  const coin: LogoPosition | "aucun" | null = ov?.coin ?? kit.logo.coin;
  const taille_pct = kit.logo.taille_pct != null && ov?.taille_facteur ? Math.max(3, Math.min(60, kit.logo.taille_pct * ov.taille_facteur)) : kit.logo.taille_pct;
  const marge_pct = kit.logo.marge_pct;
  if (coin === "aucun") {
    checks.logo = { pose: false, plaque: false, clair: false, zone_chargee: false };
  } else if (!input.logo || !coin || taille_pct == null || marge_pct == null) {
    checks.avertissements.push(!input.logo ? "Aucun logo choisi dans la charte : visuel livré sans logo." : "Emplacement du logo incomplet dans la charte : visuel livré sans logo.");
  } else {
    try {
      const trimmed = await sharp(input.logo).trim().png().toBuffer().catch(() => input.logo!);
      const logoPng = await sharp(trimmed).resize({ width: Math.round((width * taille_pct) / 100) }).png().toBuffer({ resolveWithObject: true });
      const lw = logoPng.info.width;
      const lh = logoPng.info.height;
      const margin = Math.round((width * marge_pct) / 100);
      const pad = Math.round(lw * 0.14);
      const bw = lw + 2 * pad;
      const bh = lh + 2 * pad;
      const left = coin.endsWith("gauche") ? margin : coin.endsWith("droite") ? width - margin - bw : Math.round((width - bw) / 2);
      const top = coin.startsWith("haut") ? margin : coin.startsWith("bas") ? height - margin - bh : Math.round((height - bh) / 2);

      const stats = await sharp(base).extract({ left, top, width: bw, height: bh }).stats();
      const [r, g, b] = stats.channels.map((c) => c.mean) as [number, number, number];
      const busy = stats.channels.slice(0, 3).reduce((s, c) => s + c.stdev, 0) / 3 > 38;
      const dark = luminance(r, g, b) < 140;
      // Plaque : seulement quand le générateur a dessiné dans le coin (elle le cache), ou si la charte l'impose.
      // Sur un fond sombre mais calme, le logo passe en version claire (ses tons foncés deviennent ivoire).
      const plate = kit.logo.plaque === "toujours" || (kit.logo.plaque === "auto" && busy);
      const light = dark && !plate;
      const layers: OverlayOptions[] = [];
      const logoLayer = light ? await lighten(logoPng.data, kit.palette.find((c) => /ivoire/i.test(c.nom))?.hex ?? "#fcfaf4") : logoPng.data;
      if (plate) {
        const ivory = kit.palette.find((c) => /ivoire/i.test(c.nom))?.hex ?? "#ffffff";
        const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}"><rect width="${bw}" height="${bh}" rx="${Math.round(pad * 0.9)}" fill="#fff"/></svg>`);
        const plaque = await sharp({ create: { width: bw, height: bh, channels: 4, background: ivory } })
          .composite([{ input: mask, blend: "dest-in" }])
          .png()
          .toBuffer();
        layers.push({ input: plaque, left, top });
      }
      layers.push({ input: logoLayer, left: left + pad, top: top + pad });
      base = await sharp(base).composite(layers).png().toBuffer();
      checks.logo = { pose: true, plaque: plate, clair: light, zone_chargee: busy };
      if (busy) {
        checks.avertissements.push(plate
          ? "Le générateur a dessiné quelque chose dans le coin du logo : une plaque unie a été posée dessous, vérifier le rendu."
          : "Le coin du logo est chargé (le générateur y a peut-être dessiné) et aucune plaque n'est posée : vérifier la lisibilité du logo.");
      }
    } catch (err) {
      checks.logo = { pose: false, plaque: false, clair: false, zone_chargee: false };
      checks.avertissements.push(`Logo non posé : ${(err as Error).message}`);
    }
  }

  const jpeg = input.mime === "image/jpeg";
  return { data: jpeg ? await sharp(base).jpeg({ quality: 92 }).toBuffer() : base, mime: jpeg ? "image/jpeg" : "image/png", checks };
}
