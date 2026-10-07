import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { pendingApprovals } from "@/lib/data";
import { RailNav } from "@/components/RailNav";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?error=membre");
  const pending = await pendingApprovals(session.supabase);
  const initials = session.displayName.slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <RailNav pending={pending.length} initials={initials} displayName={session.displayName} />
      <div className="main">{children}</div>
      <RealtimeRefresh />
    </div>
  );
}
