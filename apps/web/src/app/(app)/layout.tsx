import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { pendingApprovals, prospectsFoundToday } from "@/lib/data";
import { RailNav } from "@/components/RailNav";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?error=membre");
  const [pending, today] = await Promise.all([pendingApprovals(session.supabase), prospectsFoundToday(session.supabase)]);
  const initials = session.displayName.slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <RailNav pending={pending.length} />
      <div className="main">
        <header className="topbar">
          <Link href="/" className="brand">Gyna</Link>
          <div className="shell-pill"><strong className="tabular">{today}</strong>prospects trouvés aujourd'hui</div>
          <Link href="/settings" className="avatar" aria-label={`Compte de ${session.displayName}`} style={{ textDecoration: "none" }}>
            {initials}
          </Link>
        </header>
        {children}
      </div>
      <RealtimeRefresh />
    </div>
  );
}
