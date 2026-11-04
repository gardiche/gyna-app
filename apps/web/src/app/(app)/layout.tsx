import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { Spark } from "@/components/icons";
import { ViewerNav } from "@/components/ViewerNav";
import { getSession } from "@/lib/supabase/server";
import { pendingApprovals } from "@/lib/data";
import { RailNav } from "@/components/RailNav";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { getSpace } from "@/lib/space";
import { approvalInSpace } from "@/lib/domains";

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

  const space = await getSpace(session.prospector);
  // Le compteur des validations ne compte que celles de l'espace en cours.
  const pending = (await pendingApprovals(session.supabase)).filter((a) => approvalInSpace(a.kind, space));

  return (
    <div className="shell" data-space={space}>
      <RailNav pending={pending.length} initials={initials} displayName={session.displayName} prospector={session.prospector} space={space} />
      <div className="main">{children}</div>
      <RealtimeRefresh />
    </div>
  );
}
