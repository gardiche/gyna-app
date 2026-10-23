"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChart, IconMegaphone } from "./icons";

/** Menu de l'invité « suivi des campagnes » : Campagnes et Pubs, en lecture seule. */
export function ViewerNav() {
  const path = usePathname();
  const links = [
    { href: "/campagnes", label: "Campagnes", icon: <IconChart /> },
    { href: "/pubs", label: "Pubs", icon: <IconMegaphone /> },
  ];
  return (
    <>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="rail-link tip" data-tip={l.label} aria-label={l.label} aria-current={path.startsWith(l.href) ? "page" : undefined}>
          {l.icon}
        </Link>
      ))}
    </>
  );
}
