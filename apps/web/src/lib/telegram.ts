import "server-only";
import { env } from "./env";

type Button = { text: string; callback_data?: string; url?: string };

export async function telegram(method: string, payload: Record<string, unknown>): Promise<any> {
  const token = env.telegramToken();
  if (!token) return null;
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json().catch(() => null);
}

export function sendMessage(chatId: string, text: string, buttons?: Button[][]) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export function approvalButtons(approvalId: string): Button[][] {
  return [
    [
      { text: "Approuver", callback_data: `a:${approvalId}` },
      { text: "Rejeter", callback_data: `r:${approvalId}` },
    ],
    [{ text: "Ouvrir dans Gyna", url: `${env.appUrl()}/validations` }],
  ];
}
