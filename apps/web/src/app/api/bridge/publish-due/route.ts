import { NextResponse } from "next/server";
import { verifyBridgeSignature } from "@/lib/bridge";
import { supabaseAdmin } from "@/lib/supabase/server";
import { publishPost } from "@/lib/publish";

export const maxDuration = 120;

/**
 * Appel signé du pont, chaque minute : publie les posts dont l'heure planifiée par un associé est passée.
 * Le pont sert d'horloge ; il ne décide de rien.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyBridgeSignature(req, "/api/bridge/publish-due", raw)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { data: due } = await db
    .from("ads")
    .select("id")
    .eq("publish_status", "scheduled")
    .eq("status", "approved")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at")
    .limit(3);
  const results = [];
  for (const ad of due ?? []) results.push({ id: ad.id, ...(await publishPost(db, ad.id, ["scheduled"])) });
  return NextResponse.json({ ok: true, published: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
}
