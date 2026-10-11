"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ASSET_KINDS, ASSET_KIND_LABEL } from "@gyna/schemas";

export interface Asset {
  id: string;
  kind: (typeof ASSET_KINDS)[number];
  url: string;
  note: string | null;
  description: string | null;
}

/**
 * Bibliothèque de visuels d'une venture : logo, photos réelles, charte et inspirations.
 * L'agent Ads les regarde avant d'écrire ses briefs ; elles servent de références à la génération des visuels.
 */
export function AssetLibrary({ ventureId, assets }: { ventureId: string; assets: Asset[] }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const upload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.set("venture_id", ventureId);
    start(async () => {
      setError(null);
      const r = await fetch("/api/assets", { method: "POST", body: data });
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "L'envoi a échoué.");
      else form.current?.reset();
      router.refresh();
    });
  };

  const remove = (id: string) =>
    start(async () => {
      setError(null);
      const r = await fetch(`/api/assets/${id}`, { method: "DELETE" });
      if (!r.ok) setError("La suppression a échoué.");
      router.refresh();
    });

  return (
    <div className="stack">
      {assets.length ? (
        <ul className="asset-grid">
          {assets.map((a) => (
            <li key={a.id} className="asset">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.description ?? `${ASSET_KIND_LABEL[a.kind]} sans description`} loading="lazy" />
              <div className="asset-meta">
                <span className="pill">{ASSET_KIND_LABEL[a.kind]}</span>
                <button type="button" className="asset-remove" disabled={pending} onClick={() => remove(a.id)} aria-label={`Retirer cette image (${ASSET_KIND_LABEL[a.kind]})`}>
                  Retirer
                </button>
              </div>
              {a.note ? <p className="asset-note">« {a.note} »</p> : null}
              <p className="asset-note muted">{a.description ? `Vu par l'agent : ${a.description}` : "Pas encore regardée par l'agent Ads."}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ fontSize: 14 }}>
          Aucune image. Déposez le logo, quelques vraies photos et les pubs ou ambiances qui vous inspirent : l'agent Ads s'en sert pour ses briefs, et vous pour générer les visuels.
        </p>
      )}

      <form ref={form} onSubmit={upload} className="asset-form">
        <label className="field">
          Type
          <select name="kind" defaultValue="inspiration" disabled={pending}>
            {ASSET_KINDS.map((k) => <option key={k} value={k}>{ASSET_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="field">
          Image (PNG, JPEG ou WebP, 4 Mo au plus)
          <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required disabled={pending} />
        </label>
        <label className="field" style={{ flex: "1 1 220px" }}>
          Ce que vous en retenez (facultatif)
          <input name="note" maxLength={500} placeholder="J'aime la typo, pas les couleurs" disabled={pending} />
        </label>
        <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>{pending ? "Envoi…" : "Ajouter"}</button>
      </form>
      {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
    </div>
  );
}
