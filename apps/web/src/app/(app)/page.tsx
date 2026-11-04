import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { listConversations } from "@/lib/data";
import { getSpace } from "@/lib/space";

export const dynamic = "force-dynamic";

/** Le chat rouvre la dernière conversation de l'espace en cours ; sans conversation, on en démarre une. */
export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const space = await getSpace(session.prospector);
  const mine = await listConversations(session.supabase, 30, session.userId);
  const last = mine.find((c) => c.domain === space) ?? mine.find((c) => c.domain === "autre");
  redirect(last ? `/c/${last.id}` : "/nouvelle");
}
