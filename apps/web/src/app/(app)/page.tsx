import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Le chat rouvre la dernière conversation ; sans conversation, on en démarre une. */
export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { data } = await session.supabase
    .from("conversations")
    .select("id")
    .eq("created_by", session.userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  redirect(data ? `/c/${data.id}` : "/nouvelle");
}
