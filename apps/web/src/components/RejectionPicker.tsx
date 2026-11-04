"use client";
import { AD_REJECTION_KINDS, type AdRejectionKind } from "@gyna/schemas";

/** Motif d'un refus en un clic, plus une précision facultative : c'est ce que l'agent Ads relit pour ne pas refaire la même chose. */
export function RejectionPicker({
  kind,
  onKind,
  reason,
  onReason,
  disabled,
  what,
}: {
  kind: AdRejectionKind | null;
  onKind: (k: AdRejectionKind) => void;
  reason: string;
  onReason: (v: string) => void;
  disabled: boolean;
  /** « pub » ou « post », pour la phrase d'aide. */
  what: string;
}) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="muted" style={{ fontSize: 13 }}>Pourquoi ? Un clic suffit, l'agent s'en sert pour les prochains {what}s.</span>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {AD_REJECTION_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            className={`chip chip-select${kind === k.value ? " is-on" : ""}`}
            aria-pressed={kind === k.value}
            disabled={disabled}
            onClick={() => onKind(k.value)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Précision (facultatif)</span>
        <input value={reason} onChange={(e) => onReason(e.target.value)} maxLength={500} disabled={disabled} />
      </label>
    </div>
  );
}
