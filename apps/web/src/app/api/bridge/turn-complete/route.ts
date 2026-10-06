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
});

/** Rappel signé du pont à la fin d'un tour : enregistre la réponse de Gyna et clôt la mission. */
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

  const status = b.error ? "failed" : "done";
  await db
    .from("missions")
    .update({ status, ended_at: new Date().toISOString() })
    .eq("id", b.mission_id)
    .eq("status", "running");
  await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", b.conversation_id);

  return NextResponse.json({ ok: true });
}
