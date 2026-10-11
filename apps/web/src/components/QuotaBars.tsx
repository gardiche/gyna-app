"use client";
import { useEffect, useState } from "react";

interface Bar { label: string; used_pct: number; resets_at?: string }

/** Quota de l'abonnement du modèle, relu chaque minute. Ne s'affiche que si Hermes le communique. */
export function QuotaBars() {
  const [state, setState] = useState<{ bars: Bar[]; available: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/usage/quota", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive && d) setState(d); })
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!state) return <p className="side-note">Lecture du quota de l'abonnement…</p>;
  if (!state.bars.length) {
    return <p className="side-note">{state.available ? "Hermes ne communique pas le quota de l'abonnement." : "Quota indisponible : le pont ne répond pas."}</p>;
  }
  return (
    <ul className="quota">
      {state.bars.map((b) => (
        <li key={b.label}>
          <div className="kv">
            <span>{b.label}</span>
            <strong className="tabular">{100 - b.used_pct} % restants</strong>
          </div>
          <div className="meter" role="img" aria-label={`${b.label} : ${b.used_pct} % utilisés`}>
            <span style={{ width: `${b.used_pct}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
