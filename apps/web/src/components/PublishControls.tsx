"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface PublishState {
  publish_status: "scheduled" | "publishing" | "published" | "failed" | null;
  scheduled_at: string | null;
  publish_error: string | null;
  published_url: string | null;
  also_facebook?: boolean;
  facebook_url?: string | null;
}

const when = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));

/** Valeur par défaut du champ date et heure : demain à 9 h, heure locale. */
function tomorrowMorning(): string {
  const d = new Date(Date.now() + 86_400_000);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Publication d'un post approuvé : tout de suite (avec confirmation, c'est irréversible) ou à une heure choisie.
 * `blocker` explique pourquoi la publication automatique est impossible pour ce post, s'il y a lieu.
 * `notice` prévient de ce qui partira vraiment (un carrousel dont toutes les diapositives n'ont pas d'image).
 * `facebook` : la Page Facebook est reliée, le post peut y partir en même temps que sur Instagram.
 */
export function PublishControls({ postId, state, blocker, notice = null, facebook = false }: { postId: string; state: PublishState; blocker: string | null; notice?: string | null; facebook?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [at, setAt] = useState(tomorrowMorning);
  const [both, setBoth] = useState(Boolean(state.also_facebook));
  const [error, setError] = useState<string | null>(null);
  const targets = facebook && both ? "Instagram et Facebook" : "Instagram";

  const send = (body: Record<string, unknown>) =>
    start(async () => {
      setError(null);
      const r = await fetch(`/api/pubs/${postId}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, facebook: facebook && both }) });
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Échec");
      setConfirming(false);
      setPlanning(false);
      router.refresh();
    });

  if (state.publish_status === "published") {
    return (
      <div className="stack" style={{ gap: 6 }}>
        <div className="row">
          {state.published_url ? <a href={state.published_url} target="_blank" rel="noreferrer" className="card-link">Voir le post sur Instagram</a> : null}
          {state.facebook_url ? <a href={state.facebook_url} target="_blank" rel="noreferrer" className="card-link">Voir le post sur Facebook</a> : null}
        </div>
        {state.publish_error ? <span className="pub-count is-over" role="alert">{state.publish_error}</span> : null}
      </div>
    );
  }
  if (state.publish_status === "publishing") return <span className="muted">Publication en cours…</span>;
  if (state.publish_status === "scheduled" && state.scheduled_at) {
    return (
      <div className="row">
        <span className="pill pill-cold">Planifié : {when(state.scheduled_at)}{state.also_facebook ? ", Instagram et Facebook" : ""}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => send({ when: "cancel" })}>Annuler la planification</button>
      </div>
    );
  }
  if (blocker) return <span className="muted" style={{ fontSize: 13 }}>{blocker}</span>;

  return (
    <div className="stack" style={{ gap: 8 }}>
      {notice ? <span className="notice" style={{ fontSize: 13 }}>{notice}</span> : null}
      {state.publish_status === "failed" ? <span className="pub-count is-over" role="alert">La publication a échoué : {state.publish_error}</span> : null}
      {facebook ? (
        <label className="row" style={{ gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={both} disabled={pending} onChange={(e) => setBoth(e.target.checked)} />
          Publier aussi sur la Page Facebook
        </label>
      ) : null}
      {confirming ? (
        <div className="row">
          <span style={{ fontSize: 13 }}>Publier sur {targets} tout de suite ? Un post publié ne se retire que depuis le réseau, et un carrousel ne s'y modifie plus.</span>
          <button type="button" className="btn btn-dark btn-sm" disabled={pending} onClick={() => send({ when: "now" })}>{pending ? "Publication…" : "Confirmer"}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setConfirming(false)}>Annuler</button>
        </div>
      ) : planning ? (
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field">
            Publier sur {targets} le
            <input type="datetime-local" value={at} disabled={pending} onChange={(e) => setAt(e.target.value)} />
          </label>
          <button type="button" className="btn btn-dark btn-sm" disabled={pending || !at} onClick={() => send({ when: "later", scheduled_at: new Date(at).toISOString() })}>Planifier</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setPlanning(false)}>Annuler</button>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn btn-dark btn-sm" onClick={() => setConfirming(true)}>Publier maintenant</button>
          <button type="button" className="btn btn-sm" onClick={() => setPlanning(true)}>Planifier</button>
        </div>
      )}
      {error ? <span className="pub-count is-over" role="alert">{error}</span> : null}
    </div>
  );
}
