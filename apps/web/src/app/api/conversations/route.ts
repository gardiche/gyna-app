import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/supabase/server";
import { bridgeFetch } from "@/lib/bridge";

const Body = z.object({
  venture_id: z.string().uuid().nullable(),
  model: z.string().min(1),
  provider: z.string().nullable().optional(),
  reasoning_effort: z.enum(["low", "medium", "high"]).nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Réglages invalides" }, { status: 400 });
  const b = parsed.data;

  const r = await bridgeFetch("/sessions", {
    body: { model: b.model, provider: b.provider ?? undefined, reasoning_effort: b.reasoning_effort ?? undefined, title: "Gyna" },
  }).catch(() => null);
  if (!r?.ok) {
    const detail = r ? ((await r.json().catch(() => ({}))) as { error?: string }).error : "Pont injoignable";
    return NextResponse.json({ error: `Hermes n'a pas pu ouvrir la conversation : ${detail ?? r?.status}` }, { status: 502 });
  }
  const { hermes_session_key } = (await r.json()) as { hermes_session_key: string };

  const { data, error } = await session.supabase
    .from("conversations")
    .insert({
      org_id: session.orgId,
      created_by: session.userId,
      venture_id: b.venture_id,
      model: b.model,
      provider: b.provider ?? null,
      reasoning_effort: b.reasoning_effort ?? null,
      hermes_session_key,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
