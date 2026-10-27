import "server-only";

/**
 * Génération d'images par l'API d'images d'OpenRouter (POST /api/v1/images). Contrairement au pont Hermes,
 * qui ne reçoit que du texte, elle accepte de vraies images de référence : inspirations de la bibliothèque,
 * ou version précédente à retoucher. Active seulement si OPENROUTER_API_KEY est posée dans Vercel.
 *
 * Variables : OPENROUTER_API_KEY (obligatoire), IMAGE_MODEL (défaut openai/gpt-image-2), IMAGE_QUALITY (défaut medium).
 */
export const openrouterEnabled = () => !!process.env.OPENROUTER_API_KEY;

/** Rapports acceptés par l'API : 4:5 n'en fait pas partie, le vertical part en 3:4 puis l'app recadre au format de la charte. */
const RATIO = { square: "1:1", portrait: "3:4", landscape: "16:9" } as const;

export interface OpenRouterImage {
  data: Buffer;
  mime: string;
  /** Coût de l'appel en dollars, tel que renvoyé par OpenRouter. */
  costUsd: number | null;
  model: string;
}

function mimeOf(data: Buffer): string {
  if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
  if (data.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return "image/png";
}

export async function generateWithOpenRouter(input: { prompt: string; aspect: keyof typeof RATIO; references?: string[] }): Promise<OpenRouterImage> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY absente");
  const model = process.env.IMAGE_MODEL || "openai/gpt-image-2";
  const references = (input.references ?? []).slice(0, 16);
  const r = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Gyna" },
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      aspect_ratio: RATIO[input.aspect],
      quality: process.env.IMAGE_QUALITY || "medium",
      n: 1,
      ...(references.length ? { input_references: references.map((url) => ({ type: "image_url", image_url: { url } })) } : {}),
    }),
    signal: AbortSignal.timeout(270_000),
  });
  const out = (await r.json().catch(() => ({}))) as { data?: Array<{ b64_json?: string }>; usage?: { cost?: number }; error?: { message?: string } };
  if (!r.ok) throw new Error(out.error?.message ?? `OpenRouter a répondu ${r.status}`);
  const b64 = out.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenRouter n'a renvoyé aucune image");
  const data = Buffer.from(b64, "base64");
  return { data, mime: mimeOf(data), costUsd: typeof out.usage?.cost === "number" ? out.usage.cost : null, model };
}
