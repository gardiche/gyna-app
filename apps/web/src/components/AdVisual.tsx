"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSET_KIND_LABEL, IMAGE_ASPECTS } from "@gyna/schemas";
import type { Asset } from "./AssetLibrary";

export interface AdImage { id: string; url: string; aspect: string; created_at: string; slide?: number }

const ASPECT: Record<(typeof IMAGE_ASPECTS)[number], string> = { square: "Carré", portrait: "Vertical", landscape: "Horizontal" };

/**
 * Visuel d'une pub : la dernière image générée, et de quoi en demander une (ou une autre) à partir du brief,
 * avec les références de la bibliothèque et une consigne. La génération prend une à deux minutes.
 */
export function AdVisual({ adId, images, assets, hasBrief }: { adId: string; images: AdImage[]; assets: Asset[]; hasBrief: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aspect, setAspect] = useState<(typeof IMAGE_ASPECTS)[number]>("square");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const current = images[shown] ?? images[0];

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/pubs/${adId}/image`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aspect, asset_ids: picked, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "La génération a échoué.");
      else {
        setOpen(false);
        setShown(0);
        router.refresh();
      }
    } catch {
      setError("La génération a été interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const data = new FormData();
    data.set("file", file);
    const r = await fetch(`/api/pubs/${adId}/image/upload`, { method: "POST", body: data }).catch(() => null);
    if (!r?.ok) setError(((await r?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "Le dépôt a échoué.");
    else {
      setShown(0);
      router.refresh();
    }
    setBusy(false);
  };

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 6 ? [...p, id] : p));

  return (
    <div className="pub-visual-box">
      {current ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pub-image" src={current.url} alt="Visuel généré pour cette pub" loading="lazy" />
          <div className="row between" style={{ fontSize: 12 }}>
            <span className="muted">
              {images.length > 1 ? `Version ${images.length - shown} sur ${images.length}` : "Visuel généré"}
              {images.length > 1 ? (
                <>
                  {" · "}
                  <button type="button" className="link-btn" onClick={() => setShown((shown + 1) % images.length)}>Voir une autre version</button>
                </>
              ) : null}
            </span>
            <a href={current.url} target="_blank" rel="noreferrer" className="card-link">Ouvrir l'image</a>
          </div>
        </>
      ) : null}

      {open ? (
        <div className="pub-edit">
          <label className="field">
            Format
            <select value={aspect} disabled={busy} onChange={(e) => setAspect(e.target.value as typeof aspect)}>
              {IMAGE_ASPECTS.map((a) => <option key={a} value={a}>{ASPECT[a]}</option>)}
            </select>
          </label>
          {assets.length ? (
            <fieldset className="ref-pick" disabled={busy}>
              <legend>Références de la bibliothèque (6 au plus)</legend>
              {assets.map((a) => (
                <label key={a.id} className={picked.includes(a.id) ? "ref is-on" : "ref"} title={a.note ?? a.description ?? undefined}>
                  <input type="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" />
                  <span>{ASSET_KIND_LABEL[a.kind]}{a.description ? "" : " (non décrite)"}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <label className="field">
            Consigne (facultatif)
            <input value={note} maxLength={600} disabled={busy} placeholder="Plus lumineux, sans personnage" onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="row">
            <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={generate}>
              {busy ? <><span className="spinner" aria-hidden="true" /> Génération en cours, une à deux minutes…</> : "Lancer la génération"}
            </button>
            {busy ? null : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Annuler</button>}
          </div>
          {error ? <span className="pub-count is-over" role="alert">{error}</span> : null}
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            {current ? "Générer une autre version" : "Générer le visuel"}
          </button>
          <label className="btn btn-ghost btn-sm" style={{ cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Envoi…" : "Déposer une image"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
          {error && !open ? <span className="pub-count is-over" role="alert">{error}</span> : null}
          {hasBrief ? null : <span className="muted" style={{ fontSize: 12 }}>Sans brief visuel, l'image part du texte de la pub.</span>}
        </div>
      )}
    </div>
  );
}
