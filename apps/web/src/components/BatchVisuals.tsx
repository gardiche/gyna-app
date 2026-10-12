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
  const [reason, setReason] = useState<string | null>(null);

  if (!ids.length && !running) return null;

  const run = async () => {
    setRunning(true);
    setDone(0);
    setFailed(0);
    setReason(null);
    for (const id of ids) {
      const r = await fetch(`/api/pubs/${id}/image`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ aspect }) }).catch(() => null);
      if (r?.ok) setDone((n) => n + 1);
      else {
        setFailed((n) => n + 1);
        // La raison donnée par le serveur, ou le code de la réponse quand elle n'est pas lisible (délai dépassé, par exemple).
        const body = (await r?.json().catch(() => null)) as { error?: string } | null;
        setReason(body?.error ?? (r ? `Le serveur a répondu ${r.status}.` : "Le serveur n'a pas répondu."));
      }
      router.refresh();
    }
    setRunning(false);
  };

  return (
    <div className="row">
      <button type="button" className="btn btn-sm" disabled={running} onClick={run}>
        {running ? <><span className="spinner" aria-hidden="true" /> Visuels : {done + failed} sur {ids.length}…</> : `Générer les ${ids.length > 1 ? `${ids.length} visuels manquants` : "visuel manquant"}`}
      </button>
      {failed && !running ? <span className="pub-count is-over" role="alert">{failed} visuel{failed > 1 ? "s" : ""} en échec. {reason}</span> : null}
    </div>
  );
}
