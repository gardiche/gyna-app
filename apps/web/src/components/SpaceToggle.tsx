"use client";
import { startTransition, useEffect, useOptimistic, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SPACES, type Space } from "@/lib/domains";
import { switchSpace } from "@/app/actions/space";

/**
 * Bascule entre les deux espaces ; `compact` pour la pastille de la barre de navigation.
 * Le changement se voit tout de suite : la couleur et le curseur glissent d'un coup (l'attribut `data-space` du cadre
 * pilote les deux boutons), la page s'estompe pendant que la nouvelle se prépare, puis la navigation se fait sans rechargement.
 */
export function SpaceToggle({ space, compact = false }: { space: Space; compact?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [shown, setShown] = useOptimistic(space);
  const busy = useRef(false);

  // Le cadre porte l'espace affiché : quand le serveur confirme, il reprend la même valeur.
  useEffect(() => {
    document.querySelector<HTMLElement>(".shell")?.setAttribute("data-space", space);
    document.documentElement.removeAttribute("data-switching");
    busy.current = false;
  }, [space]);

  const go = (target: Space) => {
    if (target === shown || busy.current) return;
    busy.current = true;
    document.querySelector<HTMLElement>(".shell")?.setAttribute("data-space", target);
    document.documentElement.setAttribute("data-switching", "");
    startTransition(async () => {
      setShown(target);
      try {
        router.push(await switchSpace(target, path));
      } catch {
        // Le serveur n'a pas suivi : on revient à l'espace d'avant.
        document.querySelector<HTMLElement>(".shell")?.setAttribute("data-space", space);
        document.documentElement.removeAttribute("data-switching");
        busy.current = false;
      }
    });
  };

  if (compact) {
    const next = SPACES.find((s) => s.key !== shown)!;
    return (
      <button type="button" className="space-dot tip" data-tip="Changer d'espace" aria-label={`Espace ${SPACES.find((s) => s.key === shown)!.label}. Passer en ${next.label}`} onClick={() => go(next.key)} />
    );
  }

  return (
    <div className="space-toggle" role="group" aria-label="Espace">
      <span className="space-thumb" aria-hidden="true" />
      {SPACES.map((s) => (
        <button key={s.key} type="button" aria-pressed={s.key === shown} title={s.hint} onClick={() => go(s.key)} className={`space-option space-option-${s.key}`}>
          {s.label}
        </button>
      ))}
    </div>
  );
}
