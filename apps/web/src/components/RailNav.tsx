"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBook, IconChat, IconCheck, IconGear, IconLayers, IconList, IconProspects, Spark } from "./icons";

const LINKS = [
  { href: "/", label: "Chat", icon: IconChat, match: (p: string) => p === "/" || p === "/nouvelle" || p.startsWith("/c/") },
  { href: "/prospects", label: "Prospects", icon: IconProspects },
  { href: "/validations", label: "Validations", icon: IconCheck, badge: true },
  { href: "/ventures", label: "Ventures", icon: IconLayers },
  { href: "/skills", label: "Skills", icon: IconBook },
  { href: "/journal", label: "Journal", icon: IconList },
];

export function RailNav({ pending, initials, displayName }: { pending: number; initials: string; displayName: string }) {
  const path = usePathname();
  const isActive = (l: (typeof LINKS)[number]) => (l.match ? l.match(path) : path.startsWith(l.href));
  return (
    <nav className="rail" aria-label="Navigation principale">
      <div className="rail-logo"><Spark /></div>
      {LINKS.map((l) => {
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
      <Link href="/settings" className="avatar tip" data-tip={displayName} aria-label={`Compte de ${displayName}`}>
        {initials}
      </Link>
    </nav>
  );
}
