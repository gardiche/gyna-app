import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { bridgeFetch } from "@/lib/bridge";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { data: conv } = await session.supabase.from("conversations").select("hermes_session_key").eq("id", id).maybeSingle();
  if (!conv?.hermes_session_key) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  const r = await bridgeFetch(`/sessions/${conv.hermes_session_key}/interrupt`, { method: "POST", body: {} }).catch(() => null);
  await session.supabase
    .from("missions")
    .update({ status: "cancelled", ended_at: new Date().toISOString() })
    .eq("conversation_id", id)
    .in("status", ["running", "awaiting_approval"]);
  return NextResponse.json({ ok: Boolean(r?.ok) });
}
