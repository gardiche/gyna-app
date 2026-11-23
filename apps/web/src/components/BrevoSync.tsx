"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type BrevoList = { id: number; name: string; contacts: number };

/**
 * Envoie dans une liste Brevo, choisie dans le menu, les lignes cochées du tableau (avec ou sans e-mail), après
 * confirmation ; sans case cochée, toutes les lignes des filtres. La liste réglée sur la venture est proposée d'abord.
 * Placé dans la barre des actions groupées : les cases appartiennent au formulaire « bulk ».
 */
export function BrevoSync({ filters, ventureName, defaultListId, kind }: { filters: Record<string, string>; ventureName: string; defaultListId: number | null; kind: "personnes" | "entreprises" }) {
  const router = useRouter();
  const [lists, setLists] = useState<BrevoList[] | null>(null);
  const [listsError, setListsError] = useState<string | null>(null);
  const [listId, setListId] = useState<string>(defaultListId ? String(defaultListId) : "");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/brevo/lists")
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) setListsError(j.error ?? "Impossible de lire les listes Brevo.");
        else setLists(j.lists ?? []);
      })
      .catch(() => alive && setListsError("Impossible de lire les listes Brevo."));
    return () => {
      alive = false;
    };
  }, []);

  const chosen = lists?.find((l) => String(l.id) === listId);

  async function send() {
    const label = chosen ? `« ${chosen.name} »` : `n° ${listId}`;
    // Les lignes cochées du tableau ; sans case cochée, toutes les lignes de ces filtres.
    const ids = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="ids"][form="bulk"]:checked')).map((b) => b.value);
    const question = ids.length
      ? `Envoyer les ${ids.length} ligne${ids.length > 1 ? "s" : ""} cochée${ids.length > 1 ? "s" : ""} de ${ventureName} dans la liste Brevo ${label} ? Celles sans e-mail partent aussi, identifiées par un numéro interne.`
      : `Aucune ligne cochée. Envoyer toutes les lignes de ${ventureName} affichées par ces filtres dans la liste Brevo ${label} ? Celles sans e-mail partent aussi.`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/brevo/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...filters, brevoListId: listId, ids, kind, refresh }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ ok: false, text: j.error ?? "L'envoi a échoué." });
      else {
        const detail = `${j.sent} envoyé${j.sent > 1 ? "s" : ""} (dont ${j.sentWithoutEmail} sans e-mail), ${j.already} déjà dans cette liste`;
        setMsg({ ok: !j.failed, text: j.failed ? `${detail}, ${j.failed} refusé${j.failed > 1 ? "s" : ""} (${j.error}).` : `${detail}.` });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="field">
        Liste Brevo
        {listsError ? (
          <span className="notice notice-error" style={{ fontSize: 13 }}>{listsError}</span>
        ) : (
          <select value={listId} onChange={(e) => setListId(e.target.value)} disabled={!lists || busy} aria-label="Liste Brevo de destination">
            <option value="">{lists ? "Choisir une liste" : "Chargement…"}</option>
            {/* La liste réglée sur la venture reste proposée même si Brevo ne la rend plus. */}
            {listId && lists && !chosen ? <option value={listId}>Liste n° {listId}</option> : null}
            {(lists ?? []).map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name} ({l.contacts})
              </option>
            ))}
          </select>
        )}
      </label>
      <label className="muted" style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }} title="Renvoie aussi les lignes déjà dans la liste pour mettre à jour leurs colonnes chez Brevo">
        <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} disabled={busy} />
        Mettre à jour celles déjà envoyées
      </label>
      <button type="button" className="btn btn-ghost" onClick={send} disabled={busy || !listId}>{busy ? "Envoi…" : "Envoyer dans Brevo"}</button>
      {msg ? <span className={msg.ok ? "muted" : "notice notice-error"} style={{ fontSize: 13 }}>{msg.text}</span> : null}
    </>
  );
}
