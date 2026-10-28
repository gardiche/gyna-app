"use client";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Drawer } from "./Drawer";

/** Teinte d'une pastille d'état ou d'étiquette (classes `tone-*`). */
export type Tone = "warm" | "lime" | "live" | "cold" | "lavender" | "hot" | "plain";

/** Ce que montre la carte d'une pub ou d'un post dans la grille. */
export interface Tile {
  id: string;
  /** Clé de l'état, celle du filtre. */
  state: string;
  label: string;
  tone: Tone;
  image: string | null;
  /** Texte affiché en grand quand il n'y a pas encore de visuel. */
  hook: string;
  title: string;
  meta: string;
  /** Nombre de diapositives d'un carrousel, 0 sinon. */
  slides: number;
  note?: string | null;
  /** Étiquettes reprises en tête du détail, après l'état. */
  tags: Array<{ text: string; tone?: Tone }>;
}

export interface BoardBatch {
  id: string;
  title: string;
  tags: Array<{ text: string; tone?: Tone }>;
  date: string;
  /** Justification du lot, repliée sous le titre. */
  why: { label: string; rows: Array<[string, string]> };
  /** Action propre au lot, affichée sous son en-tête. */
  extra?: ReactNode;
  tiles: Tile[];
}

/**
 * Grille de cartes visuelles regroupées par lot, avec un filtre par état ; une carte ouvre son détail dans un panneau.
 * `detail` rend le contenu du panneau (corps et barre d'actions) ; `before` s'affiche entre le filtre et les lots.
 */
export function CreativeBoard({
  filters,
  batches,
  noun,
  detail,
  before,
}: {
  filters: Array<{ key: string; label: string }>;
  batches: BoardBatch[];
  noun: string;
  detail: (id: string) => ReactNode;
  before?: (open: (id: string) => void) => ReactNode;
}) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  const all = useMemo(() => batches.flatMap((b) => b.tiles), [batches]);
  // « Tout » ne montre pas les refusées : elles restent dans le filtre « Refusées », et l'agent s'en souvient.
  const inAll = (t: Tile) => t.state !== "rejected";
  const count = (key: string) => (key === "all" ? all.filter(inAll).length : all.filter((t) => t.state === key).length);
  const shown = batches.map((b) => ({ ...b, tiles: filter === "all" ? b.tiles.filter(inAll) : b.tiles.filter((t) => t.state === filter) })).filter((b) => b.tiles.length);
  const hidden = all.length - all.filter(inAll).length;
  const visible = shown.flatMap((b) => b.tiles);
  const current = open ? all.find((t) => t.id === open) ?? null : null;

  // Précédente et suivante parmi les cartes affichées, ou parmi toutes si celle-ci vient de sortir du filtre.
  const order = current && visible.some((t) => t.id === current.id) ? visible : all;
  const at = current ? order.findIndex((t) => t.id === current.id) : -1;
  const prev = at > 0 ? order[at - 1] : undefined;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : undefined;

  return (
    <>
      <div className="board-filter" role="group" aria-label="Filtrer par état">
        {[{ key: "all", label: "Tout" }, ...filters].map((f) => {
          const n = count(f.key);
          if (f.key !== "all" && !n && filter !== f.key) return null;
          return (
            <button key={f.key} type="button" className="filter-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
              <span className="tabular">{n}</span>
            </button>
          );
        })}
      </div>

      {before?.(setOpen)}

      {shown.length ? (
        shown.map((b) => (
          <section key={b.id} id={`lot-${b.id}`} className="card card-pad pub-batch" aria-labelledby={`lot-title-${b.id}`}>
            <div className="batch-head">
              <div className="row" style={{ gap: 8 }}>
                <h2 id={`lot-title-${b.id}`}>{b.title}</h2>
                {b.tags.map((t) => <span key={t.text} className={`pill tone-${t.tone ?? "plain"}`}>{t.text}</span>)}
              </div>
              <span className="muted" style={{ fontSize: 13 }}>{b.date}</span>
            </div>
            {b.why.rows.length ? (
              <details className="batch-why">
                <summary>{b.why.label}</summary>
                <dl className="pub-batch-meta">
                  {b.why.rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
                </dl>
              </details>
            ) : null}
            {b.extra}
            <ul className="tile-grid">
              {b.tiles.map((t, i) => (
                <li key={t.id}>
                  <button type="button" className={`tile${t.state === "rejected" ? " is-dim" : ""}`} aria-haspopup="dialog" onClick={() => setOpen(t.id)}>
                    <span className={`tile-visual tile-fill-${i % 3}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {t.image ? <img src={t.image} alt="" loading="lazy" /> : <span className="tile-hook">{t.hook}</span>}
                      <span className={`tile-state tone-${t.tone}`}>{t.label}</span>
                      {t.slides > 1 ? (
                        <span className="tile-count" aria-label={`Carrousel de ${t.slides} diapositives`}>
                          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="4.5" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5 2h7.5A2.5 2.5 0 0 1 15 4.5V12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                          {t.slides}
                        </span>
                      ) : null}
                    </span>
                    <span className="tile-cap">
                      <strong>{t.title}</strong>
                      <small>{t.meta}</small>
                      {t.note ? <small className="tile-note">{t.note}</small> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <section className="card card-pad">
          <p className="muted">
            {filter === "all" && hidden ? <>Aucun {noun} à afficher : {hidden === 1 ? "la seule est refusée" : `les ${hidden} sont refusées`}. <button type="button" className="link-btn" onClick={() => setFilter("rejected")}>Voir les refusées</button></> : <>Aucun {noun} dans cet état. <button type="button" className="link-btn" onClick={() => setFilter("all")}>Tout afficher</button></>}
          </p>
        </section>
      )}

      {current ? (
        <Drawer
          label={current.title}
          onClose={() => setOpen(null)}
          head={
            <>
              <span className={`pill tone-${current.tone}`}>{current.label}</span>
              {current.tags.map((t) => <span key={t.text} className={`pill tone-${t.tone ?? "plain"}`}>{t.text}</span>)}
            </>
          }
          nav={
            <div className="drawer-nav">
              <button type="button" className="drawer-icon" disabled={!prev} aria-label="Précédent" onClick={() => prev && setOpen(prev.id)}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button type="button" className="drawer-icon" disabled={!next} aria-label="Suivant" onClick={() => next && setOpen(next.id)}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          }
        >
          <Fragment key={current.id}>{detail(current.id)}</Fragment>
        </Drawer>
      ) : null}
    </>
  );
}
