"use server";
import { redirect } from "next/navigation";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/** Lien magique, réservé aux emails autorisés (inscription fermée à tout autre email). */
export async function sendMagicLink(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/login?error=inconnu");

  const { data: allowed } = await supabaseAdmin().from("allowed_emails").select("email").ilike("email", email).limit(1);
  if (!allowed?.length) redirect("/login?error=inconnu");

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${env.appUrl()}/auth/callback`, shouldCreateUser: true },
  });
  redirect(error ? "/login?error=envoi" : "/login?ok=envoye");
}
