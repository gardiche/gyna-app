"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ApproveButton({ approvalId, withReject = false, onDone }: { approvalId: string; withReject?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const decide = (decision: "approved" | "rejected") =>
    start(async () => {
      setError(null);
      const r = await fetch(`/api/approvals/${approvalId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Échec");
      onDone?.();
      router.refresh();
    });

  return (
    <>
      <button type="button" className="btn btn-dark btn-sm" disabled={pending} onClick={() => decide("approved")}>Approuver</button>
      {withReject ? (
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => decide("rejected")}>Rejeter</button>
      ) : null}
      {error ? <span className="muted" role="alert">{error}</span> : null}
    </>
  );
}
