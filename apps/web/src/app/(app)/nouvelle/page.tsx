import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { ChatScreen } from "@/components/ChatScreen";

export const dynamic = "force-dynamic";

/** Nouvelle conversation, choisie explicitement (bouton « + » ou « Nouvelle conversation »). */
export default async function NewConversationPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ChatScreen session={session} conversation={null} messages={[]} />;
}
