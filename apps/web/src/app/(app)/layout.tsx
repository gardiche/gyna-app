import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { Spark } from "@/components/icons";
import { ViewerNav } from "@/components/ViewerNav";
import { getSession } from "@/lib/supabase/server";
import { pendingApprovals } from "@/lib/data";
import { RailNav } from "@/components/RailNav";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?error=membre");
  const initials = session.displayName.slice(0, 2).toUpperCase();

  // Invité « suivi des campagnes » : pas de menu, seulement la page Campagnes et la déconnexion.
  if (session.campaignViewer) {
    return (
      <div className="shell">
        <nav className="rail" aria-label="Navigation principale">
          <div className="rail-logo"><Spark /></div>
          <ViewerNav />
          <div className="rail-spacer" />
          <form action={signOut}>
            <button type="submit" className="avatar tip" style={{ border: 0, cursor: "pointer" }} data-tip={`${session.displayName} · Se déconnecter`} aria-label={`Se déconnecter (${session.displayName})`}>{initials}</button>
          </form>
        </nav>
        <div className="main">{children}</div>
      </div>
    );
  }

  const pending = await pendingApprovals(session.supabase);

  return (
    <div className="shell">
      <RailNav pending={pending.length} initials={initials} displayName={session.displayName} prospector={session.prospector} />
      <div className="main">{children}</div>
      <RealtimeRefresh />
    </div>
  );
}
