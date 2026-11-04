import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { getSpace, homeFor } from "@/lib/space";

export const dynamic = "force-dynamic";

/** Le chat rouvre la dernière conversation de l'espace en cours ; sans conversation, on en démarre une. */
export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(await homeFor(session, await getSpace(session.prospector)));
}
