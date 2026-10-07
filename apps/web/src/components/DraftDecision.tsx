"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Validation d'un texte proposé par un agent (brouillon, skill) : modifiable avant d'approuver,
 * et un refus peut porter sa raison. Le texte proposé est conservé ; corrections et raisons servent de retours aux agents.
 */
export function DraftDecision({
  approvalId,
  body,
  label = "Message",
  maxLength = 3000,
  rows = 6,
  reasonHint = "Pourquoi le refuser ? Facultatif, les agents s'en serviront pour les prochains brouillons.",
}: {
  approvalId: string;
  body: string;
  label?: string;
  maxLength?: number;
  rows?: number;
  reasonHint?: string;
}) {
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
        <span>{label}{edited ? " (modifié)" : ""}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={rows} maxLength={maxLength} disabled={pending} />
      </label>
      {rejecting ? (
        <label className="field">
          <span>{reasonHint}</span>
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
