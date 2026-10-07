"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { IconPlus } from "./icons";

export interface ConversationItem {
  id: string;
  title: string;
  venture: string | null;
  updated_at: string;
  live: boolean;
  pending_drafts: number;
}

const TZ = "Europe/Paris";
const dayKey = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, dateStyle: "short" }).format(d);

function group(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (dayKey(d) === dayKey(now)) return "Aujourd'hui";
  if (dayKey(d) === dayKey(new Date(now.getTime() - 86_400_000))) return "Hier";
  if (now.getTime() - d.getTime() < 7 * 86_400_000) return "Cette semaine";
  return "Plus ancien";
}

function meta(c: ConversationItem): string {
  const state = c.live
    ? "en cours"
    : c.pending_drafts > 0
      ? `${c.pending_drafts} brouillon${c.pending_drafts > 1 ? "s" : ""} à valider`
      : new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(c.updated_at));
  return [c.venture, state].filter(Boolean).join(" · ");
}

/** Colonne des conversations : nouvelle mission, recherche, conversations groupées par jour avec leur état. */
export function ConversationList({ items, currentId }: { items: ConversationItem[]; currentId: string | null }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Array<{ label: string; items: ConversationItem[] }> = [];
    for (const c of items) {
      if (q && !`${c.title} ${c.venture ?? ""}`.toLowerCase().includes(q)) continue;
      const label = group(c.updated_at);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  }, [items, query]);

  return (
    <aside className="convs" aria-label="Conversations">
      <a href="/nouvelle" className="convs-new"><IconPlus size={18} />Nouvelle mission</a>
      <label className="sr-only" htmlFor="conv-search">Rechercher une conversation</label>
      <input id="conv-search" className="convs-search" type="search" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="convs-list">
        {groups.length === 0 ? (
          <p className="convs-empty">{items.length ? "Aucune conversation ne correspond." : "Vos conversations apparaîtront ici."}</p>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <h2 className="convs-group">{g.label}</h2>
              <ul>
                {g.items.map((c) => (
                  <li key={c.id}>
                    <Link href={`/c/${c.id}`} className="conv" aria-current={c.id === currentId ? "page" : undefined}>
                      <span className="conv-title">
                        {c.live ? <span className="dot dot-live" aria-label="Mission en cours" /> : c.pending_drafts > 0 ? <span className="dot dot-wait" aria-label="Brouillons à valider" /> : null}
                        <span>{c.title}</span>
                      </span>
                      <span className="conv-meta">{meta(c)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
