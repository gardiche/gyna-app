import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyBridgeSignature } from "@/lib/bridge";
import { supabaseAdmin } from "@/lib/supabase/server";
import { campaignSnapshot } from "@/lib/campaign-snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ venture_id: z.string().uuid() });

/**
 * Appel signé du serveur MCP (outil get_campaign_snapshot) : la photo de la campagne Meta d'une venture,
 * lue par l'app avec son propre accès au compte publicitaire, pour que l'agent n'ait pas à enchaîner les lectures.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyBridgeSignature(req, "/api/bridge/campaign-snapshot", raw)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }
  const parsed = Body.safeParse(JSON.parse(raw || "{}"));
  if (!parsed.success) return NextResponse.json({ error: "venture_id manquant" }, { status: 400 });
  return NextResponse.json(await campaignSnapshot(supabaseAdmin(), parsed.data.venture_id));
}
