"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";

export async function updateProfile(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const name = String(form.get("display_name") ?? "").trim();
  if (name) await session.supabase.from("members").update({ display_name: name }).eq("id", session.memberId);
  revalidatePath("/settings");
}

export async function createTelegramCode() {
  const session = await getSession();
  if (!session) redirect("/login");
  const code = randomBytes(4).toString("hex").toUpperCase();
  await session.supabase.from("members").update({ telegram_link_code: code }).eq("id", session.memberId);
  revalidatePath("/settings");
}

export async function unlinkTelegram() {
  const session = await getSession();
  if (!session) redirect("/login");
  await session.supabase.from("members").update({ telegram_chat_id: null, telegram_link_code: null }).eq("id", session.memberId);
  revalidatePath("/settings");
}

export async function updateBudget(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const value = Number(String(form.get("budget") ?? "").replace(",", "."));
  if (Number.isFinite(value) && value > 0 && value <= 1000) {
    await session.supabase.from("organizations").update({ default_mission_budget_eur: value }).eq("id", session.orgId);
  }
  revalidatePath("/settings");
}
