"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Les façons de ranger `count` diapositives dans une image : grille, bandes empilées ou colonnes côte à côte. */
function layouts(count: number): Array<{ rows: number; cols: number; label: string }> {
  const out: Array<{ rows: number; cols: number; label: string }> = [];
  for (let rows = 1; rows <= 10; rows++) {
    if (count % rows) continue;
    const cols = count / rows;
    if (cols > 10 || (rows === 1 && cols === 1)) continue;
    out.push({ rows, cols, label: rows === 1 ? `${cols} colonnes côte à côte` : cols === 1 ? `${rows} bandes empilées` : `Grille de ${rows} lignes × ${cols} colonnes` });
  }
  // Grille d'abord, puis bandes, puis colonnes.
  const rank = (l: { rows: number; cols: number }) => (l.rows > 1 && l.cols > 1 ? 0 : l.cols === 1 ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

/**
 * Pour un carrousel dont l'image de couverture contient déjà toutes les diapositives (grille, bandes ou colonnes) :
 * la découpe en une image par diapositive, avec le logo de la charte, sans rien regénérer.
 */
export function SplitVisual({ adId, count }: { adId: string; count: number }) {
  const router = useRouter();
  const options = layouts(count);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!options.length) return null;

  const run = async () => {
    const { rows, cols } = options[pick]!;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/pubs/${adId}/split`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows, cols }) });
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "La découpe a échoué.");
      else router.refresh();
    } catch {
      setError("La découpe a été interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pub-visual-box">
      <strong style={{ fontSize: 13 }}>L'image de couverture contient déjà toutes les diapositives ?</strong>
      <span className="muted" style={{ fontSize: 12 }}>
        Découpez-la : chaque case devient l'image d'une diapositive, avec le logo de la charte, sans rien régénérer.
      </span>
      <div className="row">
        {options.length > 1 ? (
          <label className="field" style={{ minWidth: 220 }}>
            Disposition
            <select value={pick} disabled={busy} onChange={(e) => setPick(Number(e.target.value))}>
              {options.map((o, i) => <option key={`${o.rows}x${o.cols}`} value={i}>{o.label}</option>)}
            </select>
          </label>
        ) : null}
        <button type="button" className="btn btn-sm" disabled={busy} onClick={run}>
          {busy ? <><span className="spinner" aria-hidden="true" /> Découpe en cours…</> : `Découper en ${count} diapositives`}
        </button>
      </div>
      {error ? <span className="pub-count is-over" role="alert">{error}</span> : null}
    </div>
  );
}
