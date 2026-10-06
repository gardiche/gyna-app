import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { ChatScreen } from "@/components/ChatScreen";
import type { ChatMessage, ToolEvent } from "@/components/Chat";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;

  const { data: conv } = await db
    .from("conversations")
    .select("id, title, model, reasoning_effort, ventures(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (!conv) notFound();

  const { data: rows } = await db
    .from("messages")
    .select("id, role, content, mission_id, tool_events")
    .eq("conversation_id", id)
    .order("created_at");

  const messages: ChatMessage[] = (rows ?? []).map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    content: r.content,
    mission_id: r.mission_id,
    tool_events: ((r.tool_events as ToolEvent[] | null) ?? []).map((t) => ({ ...t, done: true })),
  }));

  // Tour en cours ou rappel du pont pas encore reçu : la mission du dernier message n'a pas de réponse.
  const last = messages[messages.length - 1];
  if (last?.role === "user" && last.mission_id) {
    messages.push({ id: `pending-${last.mission_id}`, role: "assistant", content: "", mission_id: last.mission_id, tool_events: [] });
  }

  const venture = conv.ventures as unknown as { id: string; name: string } | null;
  return (
    <ChatScreen
      session={session}
      conversation={{ id: conv.id, title: conv.title, model: conv.model, reasoning_effort: conv.reasoning_effort, venture }}
      messages={messages}
    />
  );
}
