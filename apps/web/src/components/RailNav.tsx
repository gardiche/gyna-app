"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Space } from "@/lib/domains";
import { SpaceToggle } from "./SpaceToggle";
import { IconBook, IconChart, IconChat, IconCheck, IconLayers, IconList, IconMegaphone, IconPen, IconProspects, IconRadar, Spark } from "./icons";

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

export function RailNav({ pending, initials, displayName, prospector = false, space }: { pending: Record<Space, number>; initials: string; displayName: string; prospector?: boolean; space: Space }) {
  const path = usePathname();
  const isActive = (l: RailLink) => (l.match ? l.match(path) : path.startsWith(l.href));
  // Les deux espaces sont dans la page : la bascule les montre ou les cache en CSS (data-space du cadre), sans attendre le serveur.
  const groups = GROUPS.map((g) => ({ ...g, links: prospector ? g.links.filter((l) => PROSPECTOR_LINKS.has(l.href)) : g.links })).filter((g) => g.links.length > 0);
  // Les pages du haut suivent l'espace ; Ventures, Skills et Journal descendent en bas, juste au-dessus du compte.
  const top = groups.filter((g) => g.key !== "reglages");
  const bottom = groups.filter((g) => g.key === "reglages");
  const renderGroup = (g: (typeof groups)[number], sep: boolean) => (
    <div key={g.key} className={`rail-group rail-group-${g.key}${g.key === "prospection" || g.key === "creation" ? ` rail-space rail-space-${g.key}` : ""}`} role="group" aria-label={g.label ?? undefined}>
      {sep ? <span className="rail-sep" aria-hidden="true" /> : null}
      {g.links.map((l) => {
        const Icon = l.icon;
        const label = l.badge && pending[space] > 0 ? `${l.label}, ${pending[space]} en attente` : l.label;
        return (
          <Link key={l.href} href={l.href} className="rail-link tip" data-tip={g.label ? `${l.label} · ${g.label}` : l.label} aria-label={label}
            aria-current={isActive(l) ? "page" : undefined}>
            <Icon />
            {l.badge ? (["prospection", "creation"] as const).map((k) => (pending[k] > 0 ? <span key={k} className={`badge badge-${k}`} aria-hidden="true">{pending[k]}</span> : null)) : null}
          </Link>
        );
      })}
    </div>
  );
  return (
    <nav className="rail" aria-label="Navigation principale">
      <div className="rail-logo"><Spark /></div>
      {prospector ? null : <SpaceToggle space={space} compact />}
      {top.map((g, i) => renderGroup(g, i > 0))}
      <div className="rail-spacer" />
      {bottom.map((g) => renderGroup(g, false))}
      <Link href="/settings" className="avatar tip" data-tip={`${displayName} · Paramètres et déconnexion`} aria-label={`Compte de ${displayName} : paramètres et déconnexion`}
        aria-current={path.startsWith("/settings") ? "page" : undefined}>
        {initials}
      </Link>
    </nav>
  );
}
