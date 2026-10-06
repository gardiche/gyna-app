import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/supabase/server";
import { bridgeFetch } from "@/lib/bridge";
import { signMissionToken } from "@/lib/mission";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ text: z.string().trim().min(1).max(8000) });

/**
 * Envoie un message à Gyna : crée la mission, signe son jeton, puis relaie le flux du pont.
 * La réponse finale est enregistrée par le rappel du pont (/api/bridge/turn-complete),
 * même si ce flux est coupé avant la fin.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Message vide" }, { status: 400 });
  const text = parsed.data.text;
  const db = session.supabase;

  const { data: conv } = await db
    .from("conversations")
    .select("id, title, venture_id, hermes_session_key, ventures(slug)")
    .eq("id", id)
    .maybeSingle();
  if (!conv?.hermes_session_key) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });

  const { data: org } = await db.from("organizations").select("default_mission_budget_eur").eq("id", session.orgId).single();
  const budget = Number(org?.default_mission_budget_eur ?? 5);

  const { data: mission, error: mErr } = await db
    .from("missions")
    .insert({
      org_id: session.orgId,
      conversation_id: conv.id,
      venture_id: conv.venture_id,
      objective: text.slice(0, 500),
      budget_cap_eur: budget,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  await db.from("messages").insert({
    org_id: session.orgId,
    conversation_id: conv.id,
    mission_id: mission.id,
    role: "user",
    content: text,
    created_by: session.userId,
  });
  if (conv.title === "Nouvelle conversation") {
    await db.from("conversations").update({ title: text.slice(0, 60) }).eq("id", conv.id);
  }

  const token = await signMissionToken({
    org_id: session.orgId,
    mission_id: mission.id,
    conversation_id: conv.id,
    venture_id: conv.venture_id,
    budget_cap_eur: budget,
  });
  const ventureSlug = (conv.ventures as unknown as { slug: string } | null)?.slug ?? null;

  const upstream = await bridgeFetch(`/sessions/${conv.hermes_session_key}/messages`, {
    body: {
      text,
      mission_token: token,
      venture_slug: ventureSlug,
      budget_remaining_eur: budget,
      callback: { conversation_id: conv.id, mission_id: mission.id },
    },
  }).catch(() => null);

  if (!upstream?.ok || !upstream.body) {
    const detail = upstream ? ((await upstream.json().catch(() => ({}))) as { error?: string }).error : "Pont injoignable";
    await db.from("missions").update({ status: "failed", ended_at: new Date().toISOString() }).eq("id", mission.id);
    return NextResponse.json({ error: detail ?? `Erreur ${upstream?.status}` }, { status: upstream?.status === 409 ? 409 : 502 });
  }

  const enc = new TextEncoder();
  const head = enc.encode(`data: ${JSON.stringify({ type: "mission", mission_id: mission.id })}\n\n`);
  const reader = upstream.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(head);
    },
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel() {
      void reader.cancel();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" },
  });
}
