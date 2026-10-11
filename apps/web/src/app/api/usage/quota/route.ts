import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { bridgeFetch } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export interface QuotaBar {
  label: string;
  /** Part utilisée, de 0 à 100. */
  used_pct: number;
  resets_at?: string;
}

const LABEL_KEYS = ["label", "name", "title", "window", "id", "kind"];
const USED_KEYS = ["used_percent", "used_pct", "percent_used", "percent", "pct", "usage_percent"];
const LEFT_KEYS = ["remaining_percent", "remaining_pct", "percent_remaining", "percent_left"];
const RESET_KEYS = ["resets_at", "reset_at", "resets", "reset"];

const pick = (o: Record<string, unknown>, keys: string[]) => keys.map((k) => o[k]).find((v) => v !== undefined && v !== null);
const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v <= 1 && v > 0 && !Number.isInteger(v) ? v * 100 : v)) : null);

/**
 * Hermes ne documente pas la forme de `usage.bars` : on y cherche, où qu'ils soient, des objets
 * portant un libellé et un pourcentage (utilisé ou restant), ou un couple utilisé / limite.
 */
function findBars(node: unknown, out: QuotaBar[] = [], depth = 0): QuotaBar[] {
  if (!node || typeof node !== "object" || depth > 6 || out.length >= 6) return out;
  if (Array.isArray(node)) {
    for (const n of node) findBars(n, out, depth + 1);
    return out;
  }
  const o = node as Record<string, unknown>;
  const label = pick(o, LABEL_KEYS);
  let used = pct(pick(o, USED_KEYS));
  const left = pct(pick(o, LEFT_KEYS));
  if (used === null && left !== null) used = 100 - left;
  if (used === null && typeof o.used === "number" && typeof o.limit === "number" && o.limit > 0) used = pct((o.used / o.limit) * 100);
  if (typeof label === "string" && used !== null) {
    const reset = pick(o, RESET_KEYS);
    out.push({ label, used_pct: Math.round(used), ...(typeof reset === "string" || typeof reset === "number" ? { resets_at: String(reset) } : {}) });
    return out;
  }
  for (const v of Object.values(o)) findBars(v, out, depth + 1);
  return out;
}

/** Quota de l'abonnement du modèle, lu auprès de Hermes par le pont. Liste vide si Hermes ne le donne pas. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const r = await bridgeFetch("/usage/bars", { signal: AbortSignal.timeout(25_000) }).catch(() => null);
  if (!r?.ok) return NextResponse.json({ bars: [], available: false });
  const data = (await r.json().catch(() => ({}))) as { bars?: unknown };
  return NextResponse.json({ bars: findBars(data.bars), available: true });
}
