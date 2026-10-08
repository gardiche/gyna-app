import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyBridgeSignature } from "@/lib/bridge";
import { supabaseAdmin } from "@/lib/supabase/server";

const Body = z.object({
  conversation_id: z.string().uuid(),
  mission_id: z.string().uuid(),
  text: z.string(),
  status: z.string(),
  error: z.string().nullable().optional(),
  tool_events: z.array(z.object({ id: z.string(), name: z.string(), summary: z.string().optional(), ok: z.boolean() })).default([]),
  /** Tour relancé par Hermes après le premier, quand des sous-agents ont rendu leur résultat. */
  followup: z.boolean().default(false),
  /** Sous-agents encore au travail : la mission reste ouverte tant qu'il en reste. */
  pending_subagents: z.number().int().min(0).default(0),
});

/**
 * Rappel signé du pont à la fin de chaque tour de Gyna : enregistre sa réponse, et clôt la mission
 * seulement quand plus aucun sous-agent ne travaille (délégations en arrière-plan).
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyBridgeSignature(req, "/api/bridge/turn-complete", raw)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }
  const parsed = Body.safeParse(JSON.parse(raw));
  if (!parsed.success) return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  const b = parsed.data;
  const db = supabaseAdmin();

  const { data: conv } = await db.from("conversations").select("org_id").eq("id", b.conversation_id).maybeSingle();
  if (!conv) return NextResponse.json({ error: "Conversation inconnue" }, { status: 404 });

  const content = b.text || (b.error ? `Le tour s'est arrêté : ${b.error}` : "");
  if (content) {
    await db.from("messages").insert({
      org_id: conv.org_id,
      conversation_id: b.conversation_id,
      mission_id: b.mission_id,
      role: "assistant",
      content,
      tool_events: b.tool_events,
    });
  }

  if (b.error || b.pending_subagents === 0) {
    await db
      .from("missions")
      .update({ status: b.error ? "failed" : "done", ended_at: new Date().toISOString() })
      .eq("id", b.mission_id)
      .eq("status", "running");
  }
  await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", b.conversation_id);

  return NextResponse.json({ ok: true });
}
