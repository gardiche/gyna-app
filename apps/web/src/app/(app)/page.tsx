import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { ChatScreen } from "@/components/ChatScreen";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ChatScreen session={session} conversation={null} messages={[]} />;
}
