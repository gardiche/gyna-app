import "server-only";
import sharp from "sharp";

type Rgb = [number, number, number];
const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Couleur moyenne et dispersion de chaque ligne (ou colonne) de l'image : une bande de séparation unie a une dispersion presque nulle. */
function profile(data: Buffer, w: number, h: number, axis: "x" | "y"): Array<{ mean: Rgb; spread: number }> {
  const along = axis === "x" ? h : w;
  const count = axis === "x" ? w : h;
  const out: Array<{ mean: Rgb; spread: number }> = [];
  for (let p = 0; p < count; p++) {
    const sum = [0, 0, 0];
    const sq = [0, 0, 0];
    for (let q = 0; q < along; q++) {
      const i = (axis === "x" ? q * w + p : p * w + q) * 3;
      for (let c = 0; c < 3; c++) {
        const v = data[i + c]!;
        sum[c]! += v;
        sq[c]! += v * v;
      }
    }
    const mean = sum.map((s) => s / along) as Rgb;
    const spread = sq.reduce((s, x, c) => s + Math.sqrt(Math.max(x / along - mean[c]! ** 2, 0)), 0) / 3;
    out.push({ mean, spread });
  }
  return out;
}

/**
 * La bande de séparation (couleur unie sur toute la largeur ou la hauteur de l'image) la plus nette près de la limite attendue
 * entre deux cases : une suite de lignes unies, d'une couleur nettement différente de part et d'autre. null s'il n'y en a pas.
 */
function findSeparator(prof: ReturnType<typeof profile>, expected: number, window: number): { from: number; to: number } | null {
  const lo = Math.max(1, expected - window);
  const hi = Math.min(prof.length - 2, expected + window);
  let best: { from: number; to: number; contrast: number } | null = null;
  let start = -1;
  for (let p = lo; p <= hi + 1; p++) {
    const uniform = p <= hi && prof[p]!.spread < 8;
    if (uniform && start < 0) start = p;
    if (!uniform && start >= 0) {
      const from = start;
      const to = p - 1;
      start = -1;
      if (to - from < 1) continue;
      const mid = prof[Math.round((from + to) / 2)]!.mean;
      const left = prof[Math.max(0, from - 4)]!.mean;
      const right = prof[Math.min(prof.length - 1, to + 4)]!.mean;
      const contrast = Math.min(dist(mid, left), dist(mid, right));
      if (contrast > 40 && (!best || contrast > best.contrast)) best = { from, to, contrast };
    }
  }
  return best ? { from: best.from, to: best.to } : null;
}

/** Limites de chaque case sur un axe : [début, fin[ , en retirant la bande de séparation trouvée (ou, à défaut, 1 % de marge). */
function spans(prof: ReturnType<typeof profile>, n: number): Array<[number, number]> {
  const size = prof.length;
  const window = Math.round(size * 0.04);
  const fallback = Math.max(2, Math.round(size * 0.01));
  const cuts: Array<{ from: number; to: number }> = [];
  for (let k = 1; k < n; k++) {
    const expected = Math.round((k * size) / n);
    cuts.push(findSeparator(prof, expected, window) ?? { from: expected - fallback, to: expected + fallback - 1 });
  }
  const margin = 2; // la bande a des bords adoucis : on s'en écarte de deux pixels
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? 0 : cuts[i - 1]!.to + 1 + margin;
    const b = i === n - 1 ? size : cuts[i]!.from - margin;
    out.push([a, b]);
  }
  return out;
}

/**
 * Découpe une image qui contient `rows` × `cols` diapositives côte à côte (grille, bandes empilées ou colonnes) en autant de
 * cases, dans l'ordre de lecture. Les bandes de séparation sont repérées dans l'image ; sans elles, on coupe en parts égales.
 */
export async function splitGrid(image: Buffer, rows: number, cols: number): Promise<Buffer[]> {
  const { data, info } = await sharp(image).flatten({ background: "#ffffff" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const xs = spans(profile(data, info.width, info.height, "x"), cols);
  const ys = spans(profile(data, info.width, info.height, "y"), rows);
  const cells: Buffer[] = [];
  for (const [top, bottom] of ys) {
    for (const [left, right] of xs) {
      if (right - left < 40 || bottom - top < 40) throw new Error("Une case est trop petite : la grille ne correspond pas à l'image.");
      cells.push(await sharp(image).extract({ left, top, width: right - left, height: bottom - top }).png().toBuffer());
    }
  }
  return cells;
}
