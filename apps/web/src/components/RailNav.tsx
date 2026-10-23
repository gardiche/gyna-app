"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBook, IconChart, IconChat, IconCheck, IconGear, IconLayers, IconList, IconMegaphone, IconPen, IconProspects, IconRadar, Spark } from "./icons";

const LINKS = [
  { href: "/", label: "Chat", icon: IconChat, match: (p: string) => p === "/" || p === "/nouvelle" || p.startsWith("/c/") },
  { href: "/prospects", label: "Prospects", icon: IconProspects },
  { href: "/validations", label: "Validations", icon: IconCheck, badge: true },
  { href: "/veille", label: "Veille", icon: IconRadar },
  { href: "/pubs", label: "Pubs", icon: IconMegaphone },
  { href: "/posts", label: "Posts", icon: IconPen },
  { href: "/campagnes", label: "Campagnes", icon: IconChart },
  { href: "/ventures", label: "Ventures", icon: IconLayers },
  { href: "/skills", label: "Skills", icon: IconBook },
  { href: "/journal", label: "Journal", icon: IconList },
];

/** Ce que voit une personne en prospection seulement. */
const PROSPECTOR_LINKS = new Set(["/", "/prospects", "/validations"]);

export function RailNav({ pending, initials, displayName, prospector = false }: { pending: number; initials: string; displayName: string; prospector?: boolean }) {
  const path = usePathname();
  const isActive = (l: (typeof LINKS)[number]) => (l.match ? l.match(path) : path.startsWith(l.href));
  const links = prospector ? LINKS.filter((l) => PROSPECTOR_LINKS.has(l.href)) : LINKS;
  return (
    <nav className="rail" aria-label="Navigation principale">
      <div className="rail-logo"><Spark /></div>
      {links.map((l) => {
        const Icon = l.icon;
        const label = l.badge && pending > 0 ? `${l.label}, ${pending} en attente` : l.label;
        return (
          <Link key={l.href} href={l.href} className="rail-link tip" data-tip={l.label} aria-label={label}
            aria-current={isActive(l) ? "page" : undefined}>
            <Icon />
            {l.badge && pending > 0 ? <span className="badge" aria-hidden="true">{pending}</span> : null}
          </Link>
        );
      })}
      <div className="rail-spacer" />
      <Link href="/settings" className="rail-link tip" data-tip="Paramètres" aria-label="Paramètres"
        aria-current={path.startsWith("/settings") ? "page" : undefined}>
        <IconGear />
      </Link>
      <Link href="/settings" className="avatar tip" data-tip={`${displayName} · Paramètres et déconnexion`} aria-label={`Compte de ${displayName} : paramètres et déconnexion`}>
        {initials}
      </Link>
    </nav>
  );
}
