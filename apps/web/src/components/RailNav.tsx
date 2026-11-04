"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Space } from "@/lib/domains";
import { SpaceToggle } from "./SpaceToggle";
import { IconBook, IconChart, IconChat, IconCheck, IconGear, IconLayers, IconList, IconMegaphone, IconPen, IconProspects, IconRadar, Spark } from "./icons";

type RailLink = { href: string; label: string; icon: (p: { size?: number }) => React.JSX.Element; badge?: boolean; match?: (p: string) => boolean };

/** Le menu suit l'espace choisi : les pages communes, puis celles de la prospection ou celles de la création, puis les réglages. */
const GROUPS: Array<{ key: string; label: string | null; links: RailLink[] }> = [
  {
    key: "commun",
    label: null,
    links: [
      { href: "/", label: "Chat", icon: IconChat, match: (p: string) => p === "/" || p === "/nouvelle" || p.startsWith("/c/") },
      { href: "/validations", label: "Validations", icon: IconCheck, badge: true },
    ],
  },
  { key: "prospection", label: "Prospection", links: [{ href: "/prospects", label: "Prospects", icon: IconProspects }] },
  {
    key: "creation",
    label: "Création",
    links: [
      { href: "/veille", label: "Veille", icon: IconRadar },
      { href: "/pubs", label: "Pubs", icon: IconMegaphone },
      { href: "/posts", label: "Posts", icon: IconPen },
      { href: "/campagnes", label: "Campagnes", icon: IconChart },
    ],
  },
  {
    key: "reglages",
    label: null,
    links: [
      { href: "/ventures", label: "Ventures", icon: IconLayers },
      { href: "/skills", label: "Skills", icon: IconBook },
      { href: "/journal", label: "Journal", icon: IconList },
    ],
  },
];

/** Ce que voit une personne en prospection seulement. */
const PROSPECTOR_LINKS = new Set(["/", "/prospects", "/validations"]);

export function RailNav({ pending, initials, displayName, prospector = false, space }: { pending: number; initials: string; displayName: string; prospector?: boolean; space: Space }) {
  const path = usePathname();
  const isActive = (l: RailLink) => (l.match ? l.match(path) : path.startsWith(l.href));
  // Seules les pages de l'espace en cours sont proposées ; les pages communes restent toujours là.
  const groups = GROUPS.filter((g) => (g.key === "prospection" || g.key === "creation" ? g.key === space : true))
    .map((g) => ({ ...g, links: prospector ? g.links.filter((l) => PROSPECTOR_LINKS.has(l.href)) : g.links }))
    .filter((g) => g.links.length > 0);
  return (
    <nav className="rail" aria-label="Navigation principale">
      <div className="rail-logo"><Spark /></div>
      {prospector ? null : <SpaceToggle space={space} compact />}
      {groups.map((g, i) => (
        <div key={g.key} className={`rail-group rail-group-${g.key}`} role="group" aria-label={g.label ?? undefined}>
          {i > 0 ? <span className="rail-sep" aria-hidden="true" /> : null}
          {g.links.map((l) => {
            const Icon = l.icon;
            const label = l.badge && pending > 0 ? `${l.label}, ${pending} en attente` : l.label;
            return (
              <Link key={l.href} href={l.href} className="rail-link tip" data-tip={g.label ? `${l.label} · ${g.label}` : l.label} aria-label={label}
                aria-current={isActive(l) ? "page" : undefined}>
                <Icon />
                {l.badge && pending > 0 ? <span className="badge" aria-hidden="true">{pending}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
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
