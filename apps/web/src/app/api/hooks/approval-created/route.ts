import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import { approvalButtons, sendMessage } from "@/lib/telegram";

function authorized(header: string | null): boolean {
  const secret = env.hooksSecret();
  if (!secret || !header) return false;
  const given = Buffer.from(header.replace(/^Bearer /, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Appelé par un Database Webhook Supabase à chaque nouvelle ligne de `approvals`.
 * Envoie la validation sur Telegram aux associés qui ont lié leur compte.
 */
export async function POST(req: Request) {
  if (!authorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const payload = await req.json();
  const rec = payload?.record;
  if (payload?.type !== "INSERT" || payload?.table !== "approvals" || !rec?.id) return NextResponse.json({ ok: true });

  const db = supabaseAdmin();
  const { data: members } = await db.from("members").select("telegram_chat_id").eq("org_id", rec.org_id).not("telegram_chat_id", "is", null);
  if (!members?.length) return NextResponse.json({ ok: true, sent: 0 });

  let text = rec.summary as string;
  if (rec.kind === "draft") {
    const { data: d } = await db.from("drafts").select("body").eq("id", rec.ref_id).maybeSingle();
    if (d?.body) text += `\n\n${d.body}`;
  }
  await Promise.all(members.map((m) => sendMessage(m.telegram_chat_id!, text, approvalButtons(rec.id))));
  return NextResponse.json({ ok: true, sent: members.length });
}
