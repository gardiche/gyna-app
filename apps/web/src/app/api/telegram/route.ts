import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decideApproval } from "@/lib/approvals";
import { sendMessage, telegram } from "@/lib/telegram";

function validSecret(given: string | null): boolean {
  const expected = env.telegramWebhookSecret();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Webhook du bot Telegram : liaison des comptes et décisions de validation en un tap. */
export async function POST(req: Request) {
  if (!validSecret(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const update = await req.json();
  const db = supabaseAdmin();

  // Liaison : l'associé envoie « /start CODE » au bot, CODE étant affiché dans Paramètres.
  const msg = update.message;
  if (msg?.text?.startsWith("/start")) {
    const code = msg.text.split(/\s+/)[1]?.trim().toUpperCase();
    const chatId = String(msg.chat.id);
    if (!code) {
      await sendMessage(chatId, "Envoyez le code affiché dans Gyna, page Paramètres : /start CODE");
      return NextResponse.json({ ok: true });
    }
    const { data: m } = await db
      .from("members")
      .update({ telegram_chat_id: chatId, telegram_link_code: null })
      .eq("telegram_link_code", code)
      .select("display_name")
      .maybeSingle();
    await sendMessage(chatId, m ? `Compte lié, ${m.display_name}. Vous recevrez ici les validations de Gyna.` : "Code inconnu ou déjà utilisé.");
    return NextResponse.json({ ok: true });
  }

  const cb = update.callback_query;
  if (cb?.data) {
    const [action, approvalId] = String(cb.data).split(":");
    const chatId = String(cb.message?.chat?.id ?? cb.from?.id);
    const { data: member } = await db.from("members").select("user_id, org_id").eq("telegram_chat_id", chatId).maybeSingle();
    if (!member || !approvalId || (action !== "a" && action !== "r")) {
      await telegram("answerCallbackQuery", { callback_query_id: cb.id, text: "Compte non lié à Gyna." });
      return NextResponse.json({ ok: true });
    }
    const r = await decideApproval(db, {
      approvalId,
      decision: action === "a" ? "approved" : "rejected",
      userId: member.user_id,
      channel: "telegram",
      orgId: member.org_id,
    });
    const label = r.ok ? (action === "a" ? "Approuvé" : "Rejeté") : r.error;
    await telegram("answerCallbackQuery", { callback_query_id: cb.id, text: label });
    if (r.ok && cb.message) {
      await telegram("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
      await sendMessage(chatId, `${label} : ${r.summary}`);
    }
  }
  return NextResponse.json({ ok: true });
}
