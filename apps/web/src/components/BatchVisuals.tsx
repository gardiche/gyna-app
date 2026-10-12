"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Génère d'un coup le visuel de chaque post du lot qui n'en a pas encore, l'un après l'autre.
 * Compter une à deux minutes par image ; la page se met à jour à chaque visuel terminé.
 */
export function BatchVisuals({ ids, aspect }: { ids: string[]; aspect: "square" | "portrait" | "landscape" }) {
  const router = useRouter();
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [running, setRunning] = useState(false);

  if (!ids.length && !running) return null;

  const run = async () => {
    setRunning(true);
    setDone(0);
    setFailed(0);
    for (const id of ids) {
      const ok = await fetch(`/api/ads/${id}/image`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ aspect }) })
        .then((r) => r.ok)
        .catch(() => false);
      if (ok) setDone((n) => n + 1);
      else setFailed((n) => n + 1);
      router.refresh();
    }
    setRunning(false);
  };

  return (
    <div className="row">
      <button type="button" className="btn btn-sm" disabled={running} onClick={run}>
        {running ? <><span className="spinner" aria-hidden="true" /> Visuels : {done + failed} sur {ids.length}…</> : `Générer les ${ids.length > 1 ? `${ids.length} visuels manquants` : "visuel manquant"}`}
      </button>
      {failed && !running ? <span className="ad-count is-over" role="alert">{failed} visuel{failed > 1 ? "s" : ""} en échec : relancez.</span> : null}
    </div>
  );
}
