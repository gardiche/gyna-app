"use client";
import { useTransition } from "react";
import { usePathname } from "next/navigation";
import { SPACES, type Space } from "@/lib/domains";
import { switchSpace } from "@/app/actions/space";

/** Bascule entre les deux espaces de l'app ; `compact` pour la barre de navigation. */
export function SpaceToggle({ space, compact = false }: { space: Space; compact?: boolean }) {
  const path = usePathname();
  const [pending, start] = useTransition();
  const go = (s: Space) => {
    if (s !== space) start(() => switchSpace(s, path));
  };

  if (compact) {
    const next = SPACES.find((s) => s.key !== space)!;
    const current = SPACES.find((s) => s.key === space)!;
    return (
      <button type="button" className={`space-dot space-dot-${space} tip`} data-tip={`Espace ${current.label} · passer en ${next.label}`}
        aria-label={`Espace ${current.label}. Passer en ${next.label}`} disabled={pending} onClick={() => go(next.key)}>
        {current.label.charAt(0)}
      </button>
    );
  }

  return (
    <div className="space-toggle" role="group" aria-label="Espace">
      {SPACES.map((s) => (
        <button key={s.key} type="button" aria-pressed={s.key === space} title={s.hint} disabled={pending} onClick={() => go(s.key)}
          className={`space-option space-option-${s.key}`}>
          {s.label}
        </button>
      ))}
    </div>
  );
}
