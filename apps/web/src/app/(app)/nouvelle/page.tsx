import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { ChatScreen } from "@/components/ChatScreen";

export const dynamic = "force-dynamic";

/**
 * Nouvelle conversation, choisie explicitement (bouton « Nouvelle mission »).
 * `?prompt=` pré-remplit la zone de saisie, sans rien envoyer (lien « Demander à Gyna » d'une fiche d'agent).
 */
export default async function NewConversationPage({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { prompt } = await searchParams;
  return <ChatScreen session={session} conversation={null} messages={[]} initialPrompt={prompt?.slice(0, 2000)} />;
}
