"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Envoie dans la liste Brevo de la venture les lignes affichées (avec e-mail, pas encore envoyées), après confirmation. */
export function BrevoSync({ filters, ventureName }: { filters: Record<string, string>; ventureName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (!window.confirm(`Envoyer dans la liste Brevo de ${ventureName} tous les prospects de ces filtres qui ont un e-mail et ne sont pas déjà partis ?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/brevo/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(filters) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ ok: false, text: j.error ?? "L'envoi a échoué." });
      else {
        const detail = `${j.sent} envoyé${j.sent > 1 ? "s" : ""}, ${j.withoutEmail} sans e-mail, ${j.already} déjà envoyé${j.already > 1 ? "s" : ""}`;
        setMsg({ ok: !j.failed, text: j.failed ? `${detail}, ${j.failed} refusé${j.failed > 1 ? "s" : ""} (${j.error}).` : `${detail}.` });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={send} disabled={busy}>{busy ? "Envoi…" : "Envoyer dans Brevo"}</button>
      {msg ? <span className={msg.ok ? "muted" : "notice notice-error"} style={{ fontSize: 13 }}>{msg.text}</span> : null}
    </>
  );
}
