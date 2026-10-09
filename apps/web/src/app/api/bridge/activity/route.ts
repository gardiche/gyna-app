import { NextResponse } from "next/server";
import { z } from "zod";
import { AGENTS } from "@gyna/schemas";
import { verifyBridgeSignature } from "@/lib/bridge";
import { supabaseAdmin } from "@/lib/supabase/server";

const Body = z.object({
  conversation_id: z.string().uuid(),
  mission_id: z.string().uuid(),
  kind: z.enum(["start", "complete"]),
  agent: z.enum(AGENTS),
  goal: z.string().max(4000).optional(),
  status: z.string().max(50).optional(),
  summary: z.string().max(8000).optional(),
});

const clip = (s: string | undefined, n: number) => {
  const t = (s ?? "").replace(/^\s*\[[^\]]+\]\s*/, "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t;
};

/** Rappel signé du pont quand un sous-agent démarre ou termine : une ligne au journal de la mission. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyBridgeSignature(req, "/api/bridge/activity", raw)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }
  const parsed = Body.safeParse(JSON.parse(raw));
  if (!parsed.success) return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  const b = parsed.data;
  const db = supabaseAdmin();

  const { data: mission } = await db.from("missions").select("org_id").eq("id", b.mission_id).eq("conversation_id", b.conversation_id).maybeSingle();
  if (!mission) return NextResponse.json({ error: "Mission inconnue" }, { status: 404 });

  const failed = b.kind === "complete" && /error|fail|interrupt|timeout|cancel/i.test(b.status ?? "");
  const summary =
    b.kind === "start"
      ? `Au travail : ${clip(b.goal, 160)}`
      : failed
        ? `Arrêté (${b.status}) : ${clip(b.summary || b.goal, 200)}`
        : `Terminé : ${clip(b.summary || b.goal, 200)}`;
  await db.from("actions").insert({
    org_id: mission.org_id,
    mission_id: b.mission_id,
    agent: b.agent,
    tool: b.kind === "start" ? "subagent_start" : "subagent_complete",
    result_summary: summary,
    status: failed ? "error" : "ok",
  });
  return NextResponse.json({ ok: true });
}
