import { NextResponse } from "next/server";
import { z } from "zod";
import { AGENTS, maskMissionTokens } from "@gyna/schemas";
import { verifyBridgeSignature } from "@/lib/bridge";
import { supabaseAdmin } from "@/lib/supabase/server";

const Body = z.object({
  conversation_id: z.string().uuid(),
  mission_id: z.string().uuid(),
  kind: z.enum(["start", "complete"]),
  agent: z.enum(AGENTS),
  // Pas de longueur maximale ici : un texte trop long ferait refuser toute la ligne du journal ; on le coupe plus bas.
  goal: z.string().optional(),
  context: z.string().optional(),
  status: z.string().max(50).optional(),
  summary: z.string().optional(),
});

/** Texte complet gardé dans `actions.input`, jeton masqué, coupé à `n` caractères. */
const full = (s: string | undefined, n: number) => {
  if (!s) return undefined;
  const t = maskMissionTokens(s).trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

const clip = (s: string | undefined, n: number) => {
  // Un sous-agent recopie parfois son jeton de mission dans son compte rendu : il ne doit pas finir au journal.
  const t = maskMissionTokens(s ?? "").replace(/^\s*\[[^\]]+\]\s*/, "").replace(/\s+/g, " ").trim();
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
    // Le journal affiche une ligne ; la consigne complète de Gyna et le compte rendu entier restent lisibles ici.
    input:
      b.kind === "start"
        ? { goal: full(b.goal, 4000), context: full(b.context, 30000) }
        : { goal: full(b.goal, 4000), status: b.status ?? null, summary: full(b.summary, 30000) },
    result_summary: summary,
    status: failed ? "error" : "ok",
  });
  return NextResponse.json({ ok: true });
}
