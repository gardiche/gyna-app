import { NextResponse } from "next/server";
import { bridgeFetch } from "@/lib/bridge";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Liste des modèles proposés par Hermes (model.options), avec un repli sur le modèle par défaut. */
export async function GET() {
  const fallback = { models: [{ id: env.defaultModel(), provider: env.defaultProvider() ?? null }], source: "default" };
  try {
    const r = await bridgeFetch("/models");
    if (!r.ok) return NextResponse.json(fallback);
    const raw = await r.json();
    const list: Array<{ id: string; provider: string | null }> = [];
    const push = (v: any) => {
      if (typeof v === "string") list.push({ id: v, provider: null });
      else if (v && typeof v === "object") {
        const id = v.id ?? v.model ?? v.name;
        if (typeof id === "string") list.push({ id, provider: v.provider ?? null });
      }
    };
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.models) ? raw.models : Array.isArray(raw?.options) ? raw.options : [];
    arr.forEach(push);
    if (!list.length) return NextResponse.json(fallback);
    return NextResponse.json({ models: list, source: "hermes" });
  } catch {
    return NextResponse.json(fallback);
  }
}
