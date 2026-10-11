import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyBridgeSignature } from "@/lib/bridge";
import { supabaseAdmin } from "@/lib/supabase/server";

const count = z.number().nonnegative().max(1e12);
const Body = z.object({
  conversation_id: z.string().uuid(),
  mission_id: z.string().uuid(),
  usage: z.object({
    input: count,
    output: count,
    reasoning: count.default(0),
    total: count,
    calls: count.default(0),
    cache_hit_pct: z.number().min(0).max(100).optional(),
    model: z.string().max(200).optional(),
    subagent_tokens: count.default(0),
    subagent_runs: count.default(0),
  }),
});

/** Rappel signé du pont pendant une mission : dernier relevé de sa consommation de tokens. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyBridgeSignature(req, "/api/bridge/usage", raw)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }
  const parsed = Body.safeParse(JSON.parse(raw));
  if (!parsed.success) return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  const b = parsed.data;
  const { error } = await supabaseAdmin()
    .from("missions")
    .update({ usage: b.usage })
    .eq("id", b.mission_id)
    .eq("conversation_id", b.conversation_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
