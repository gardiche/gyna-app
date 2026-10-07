"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface HistoryItem {
  id: string;
  title: string;
  venture: string | null;
  updated_at: string;
}

const TZ = "Europe/Paris";

function when(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, dateStyle: "short" }).format(x);
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (day(d) === day(now)) return `Aujourd'hui, ${time}`;
  if (day(d) === day(yesterday)) return `Hier, ${time}`;
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "long" }).format(d);
}

/** Liste des conversations, ouverte depuis l'en-tête du chat. */
export function History({ items, currentId }: { items: HistoryItem[]; currentId: string | null }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="history" ref={box}>
      <button type="button" className="btn btn-sm" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        Historique
      </button>
      {open ? (
        <div className="history-panel" role="menu" aria-label="Conversations">
          {items.length === 0 ? (
            <p className="muted" style={{ padding: "12px 14px" }}>Aucune conversation pour l'instant.</p>
          ) : (
            <ul>
              {items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/c/${c.id}`}
                    role="menuitem"
                    aria-current={c.id === currentId ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <span className="history-title">{c.title}</span>
                    <span className="history-meta">
                      {c.venture ? `${c.venture}, ` : ""}
                      {when(c.updated_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
