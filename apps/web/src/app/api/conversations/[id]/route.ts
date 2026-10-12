import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { bridgeFetch } from "@/lib/bridge";
import { removeFiles } from "@/lib/media";

/**
 * Supprime une conversation : ses messages, ses missions et ses fichiers joints.
 * Ce que les missions ont produit (prospects, brouillons, pubs, veille) et le journal restent.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const db = session.supabase;
  const { data: conv } = await db.from("conversations").select("id, hermes_session_key").eq("id", id).maybeSingle();
  if (!conv) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });

  // Une mission encore en cours est arrêtée avant de disparaître.
  const { data: live } = await db.from("missions").select("id").eq("conversation_id", id).in("status", ["running", "awaiting_approval"]).limit(1);
  if (live?.length && conv.hermes_session_key) {
    await bridgeFetch(`/sessions/${conv.hermes_session_key}/interrupt`, { method: "POST", body: {} }).catch(() => null);
  }
  const { data: withFiles } = await db.from("messages").select("attachments").eq("conversation_id", id).neq("attachments", "[]");
  const paths = (withFiles ?? []).flatMap((m) => ((m.attachments ?? []) as Array<{ path?: string }>).map((a) => a.path)).filter((p): p is string => Boolean(p));

  const { error } = await db.from("conversations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (paths.length) await removeFiles(paths.filter((p) => p.startsWith(`${session.orgId}/`))).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
