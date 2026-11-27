"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IconChevron, IconSliders } from "@/components/icons";

const BOXES = 'input[type="checkbox"][name="ids"][form="bulk"]';

/**
 * Barre des actions groupées de la page Prospects. Tant qu'aucune ligne n'est cochée, une seule phrase dit ce qu'on
 * peut faire ; dès qu'une ligne l'est, les actions apparaissent, avec le nombre de lignes et de quoi tout décocher.
 * Les actions restent montées (masquées) pour garder l'état des menus, par exemple le résultat d'un envoi Brevo.
 */
export function BulkActions({ hint, children }: { hint: string; children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const params = useSearchParams();

  const recount = useCallback(() => setCount(document.querySelectorAll(`${BOXES}:checked`).length), []);

  useEffect(() => {
    const onChange = (e: Event) => {
      if (e.type === "bulk-change" || (e.target instanceof HTMLInputElement && e.target.matches(BOXES))) recount();
    };
    document.addEventListener("change", onChange);
    document.addEventListener("bulk-change", onChange);
    return () => {
      document.removeEventListener("change", onChange);
      document.removeEventListener("bulk-change", onChange);
    };
  }, [recount]);

  // Un autre filtre ou une autre étape remplace le tableau : on recompte.
  useEffect(() => {
    const t = window.setTimeout(recount, 0);
    return () => window.clearTimeout(t);
  }, [params, recount]);

  const clear = () => {
    document.querySelectorAll<HTMLInputElement>(`${BOXES}, input[type="checkbox"][data-select-all]`).forEach((b) => { b.checked = false; });
    recount();
  };

  const s = count > 1 ? "s" : "";
  return (
    <div className="bulk" data-active={count > 0 ? "" : undefined}>
      {count === 0 ? <p className="bulk-hint">{hint}</p> : null}
      <div className="bulk-actions" hidden={count === 0}>
        <p className="bulk-count" aria-live="polite">
          <strong>{count}</strong> ligne{s} cochée{s}
          <button type="button" className="bulk-clear" onClick={clear}>Tout décocher</button>
        </p>
        <div className="bulk-groups">{children}</div>
      </div>
    </div>
  );
}

/** Menu déroulant léger : un bouton, un panneau sous lui, fermé au clic à côté ou avec Échap. */
export function MenuButton({ label, panelLabel, align = "start", children }: { label: React.ReactNode; panelLabel: string; align?: "start" | "end"; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn btn-sm menu-trigger" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
        <IconChevron />
      </button>
      {/* Le panneau reste dans la page quand il est fermé : ses champs gardent leur valeur et appartiennent au formulaire. */}
      <div className={`menu-panel menu-panel-${align}`} role="group" aria-label={panelLabel} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/** Bouton qui ouvre ou replie un bloc de la page (les filtres secondaires). */
export function MoreFilters({ controls, active }: { controls: string; active: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = document.getElementById(controls);
    if (el) el.hidden = !open;
  }, [open, controls]);
  return (
    <button type="button" className="pf-more" aria-expanded={open} aria-controls={controls} onClick={() => setOpen((o) => !o)}>
      <IconSliders size={16} />
      Plus de filtres
      {active ? <span className="pf-badge" aria-label={`${active} actif${active > 1 ? "s" : ""}`}>{active}</span> : null}
      <IconChevron size={13} />
    </button>
  );
}
