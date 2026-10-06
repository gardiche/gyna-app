import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";

/** Client lié à l'utilisateur connecté : toutes les requêtes passent par la RLS. */
export async function supabaseServer(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: Array<{ name: string; value: string; options?: any }>) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          // Appelé depuis un Server Component : le middleware rafraîchit déjà la session.
        }
      },
    },
  });
}

/** Client « service » : contourne la RLS. Réservé aux webhooks signés (pont, Telegram, Supabase). */
export function supabaseAdmin(): SupabaseClient {
  return createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface Session {
  supabase: SupabaseClient;
  userId: string;
  email: string;
  orgId: string;
  memberId: string;
  displayName: string;
}

/** Utilisateur connecté et membre d'une organisation, sinon null. */
export async function getSession(): Promise<Session | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: member } = await supabase
    .from("members")
    .select("id, org_id, display_name")
    .eq("user_id", data.user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  return {
    supabase,
    userId: data.user.id,
    email: data.user.email ?? "",
    orgId: member.org_id,
    memberId: member.id,
    displayName: member.display_name,
  };
}
