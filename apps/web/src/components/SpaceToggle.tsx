"use client";
import { startTransition, useEffect, useOptimistic, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SPACES, type Space } from "@/lib/domains";
import { switchSpace } from "@/app/actions/space";

/**
 * Bascule entre les deux espaces ; `compact` pour la pastille de la barre de navigation.
 * Le menu, les conversations et l'équipe des deux espaces sont déjà dans la page : le changement est immédiat (l'attribut
 * `data-space` du cadre montre l'un et cache l'autre). Seul le centre bouge : le serveur retient le choix et dit quelle
 * conversation rouvrir, et la navigation se fait sans rechargement, l'ancienne vue restant affichée jusqu'à ce que la nouvelle soit prête.
 */
export function SpaceToggle({ space, compact = false }: { space: Space; compact?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [shown, setShown] = useOptimistic(space);
  const frame = () => document.querySelector<HTMLElement>(".shell");

  // Le cadre reprend l'espace du serveur quand celui-ci change (rechargement, autre onglet).
  useEffect(() => {
    frame()?.setAttribute("data-space", space);
  }, [space]);

  const go = (target: Space) => {
    if (target === shown) return;
    frame()?.setAttribute("data-space", target);
    frame()?.setAttribute("data-switching", "");
    startTransition(async () => {
      setShown(target);
      try {
        const next = await switchSpace(target, path);
        if (next) router.push(next);
        else router.refresh();
      } catch {
        // Le serveur n'a pas suivi : on revient à l'espace d'avant.
        frame()?.setAttribute("data-space", space);
      } finally {
        frame()?.removeAttribute("data-switching");
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
