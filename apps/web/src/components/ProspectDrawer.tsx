"use client";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "./Drawer";

/**
 * Fiche d'un prospect, dans le même panneau que les pubs et les posts. Le contenu est rendu par le serveur ;
 * fermer revient à l'adresse de la liste (sans `?p=` ni `?c=`), si bien qu'une fiche ouverte se partage par son lien.
 */
export function ProspectDrawer({ label, closeHref, head, children }: { label: string; closeHref: string; head: ReactNode; children: ReactNode }) {
  const router = useRouter();
  return (
    <Drawer label={label} head={head} onClose={() => router.push(closeHref, { scroll: false })}>
      {children}
    </Drawer>
  );
}
