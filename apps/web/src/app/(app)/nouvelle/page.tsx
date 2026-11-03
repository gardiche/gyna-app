import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { ChatScreen } from "@/components/ChatScreen";

export const dynamic = "force-dynamic";

/**
 * Nouvelle conversation, choisie explicitement (bouton « Nouvelle mission »).
 * `?prompt=` pré-remplit la zone de saisie, sans rien envoyer (lien « Demander à Gyna » d'une fiche d'agent,
 * actions groupées de la page Prospects) ; `?venture=` choisit la venture de la conversation.
 */
export default async function NewConversationPage({ searchParams }: { searchParams: Promise<{ prompt?: string; venture?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { prompt, venture } = await searchParams;
  return <ChatScreen session={session} conversation={null} messages={[]} initialPrompt={prompt?.slice(0, 6000)} initialVentureId={venture} />;
}
