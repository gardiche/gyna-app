"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Validation d'un brouillon : le texte est modifiable avant d'approuver, et un refus peut porter sa raison.
 * Le texte proposé par l'agent est conservé ; corrections et raisons servent de retours aux agents.
 */
export function DraftDecision({ approvalId, body }: { approvalId: string; body: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(body);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const edited = text.trim() !== body.trim();
  const tooShort = text.trim().length < 20;

  const decide = (decision: "approved" | "rejected") =>
    start(async () => {
      setError(null);
      const payload =
        decision === "approved"
          ? { decision, ...(edited ? { body: text.trim() } : {}) }
          : { decision, ...(reason.trim() ? { reason: reason.trim() } : {}) };
      const r = await fetch(`/api/approvals/${approvalId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Échec");
      router.refresh();
    });

  return (
    <div className="stack">
      <label className="field">
        <span>Message{edited ? " (modifié)" : ""}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={3000} disabled={pending} />
      </label>
      {rejecting ? (
        <label className="field">
          <span>Pourquoi le refuser ? Facultatif, les agents s'en serviront pour les prochains brouillons.</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} disabled={pending} autoFocus />
        </label>
      ) : null}
      <div className="row">
        {rejecting ? (
          <>
            <button type="button" className="btn btn-dark btn-sm" disabled={pending} onClick={() => decide("rejected")}>Confirmer le refus</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setRejecting(false)}>Annuler</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-dark btn-sm" disabled={pending || tooShort} onClick={() => decide("approved")}>
              {edited ? "Approuver la version corrigée" : "Approuver"}
            </button>
            {edited ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setText(body)}>Revenir au texte proposé</button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setRejecting(true)}>Rejeter</button>
          </>
        )}
        {error ? <span className="muted" role="alert">{error}</span> : null}
      </div>
    </div>
  );
}
