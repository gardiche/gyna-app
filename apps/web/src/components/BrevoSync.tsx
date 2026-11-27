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
      // Brevo limite le rythme : l'envoi se fait par paquets, l'un après l'autre, jusqu'à la fin.
      const total = { sent: 0, sentWithoutEmail: 0, already: 0, failed: 0 };
      let firstError: string | null = null;
      let cursor = "";
      let remaining = 0;
      for (let round = 0; round < 200; round++) {
        const res = await fetch("/api/brevo/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...filters, brevoListId: listId, ids, kind, refresh, cursor }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMsg({ ok: false, text: `${j.error ?? "L'envoi a échoué."}${total.sent ? ` (${total.sent} déjà envoyé${total.sent > 1 ? "s" : ""} avant l'arrêt.)` : ""}` });
          router.refresh();
          return;
        }
        total.sent += j.sent;
        total.sentWithoutEmail += j.sentWithoutEmail;
        total.failed += j.failed;
        if (round === 0) total.already = j.already;
        firstError = firstError ?? j.error;
        cursor = j.cursor ?? cursor;
        remaining = j.remaining ?? 0;
        if (!remaining) break;
        setMsg({ ok: true, text: `Envoi en cours : ${total.sent + total.failed} traité${total.sent + total.failed > 1 ? "s" : ""}, ${remaining} à venir…` });
      }
      const detail = `${total.sent} envoyé${total.sent > 1 ? "s" : ""} (dont ${total.sentWithoutEmail} sans e-mail), ${total.already} déjà dans cette liste`;
      setMsg({ ok: !total.failed, text: total.failed ? `${detail}, ${total.failed} refusé${total.failed > 1 ? "s" : ""} (${firstError}).` : `${detail}.` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-stack">
      <label className="field">
        Liste Brevo de destination
        {listsError ? (
          <span className="notice notice-error" style={{ fontSize: 13 }}>{listsError}</span>
        ) : (
          <select value={listId} onChange={(e) => setListId(e.target.value)} disabled={!lists || busy}>
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
      <label className="check">
        <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} disabled={busy} />
        <span>Mettre à jour celles déjà envoyées<small>Leurs colonnes sont renvoyées à Brevo.</small></span>
      </label>
      <button type="button" className="btn btn-dark btn-sm" onClick={send} disabled={busy || !listId}>{busy ? "Envoi…" : "Envoyer"}</button>
      {msg ? <p className={msg.ok ? "panel-msg" : "notice notice-error"} role="status" style={{ fontSize: 13, margin: 0 }}>{msg.text}</p> : null}
    </div>
  );
}
