"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AD_LIMITS, type AdPlatform, type AdTextField } from "@gyna/schemas";
import { AdVisual, type AdImage } from "./AdVisual";
import type { Asset } from "./AssetLibrary";

export interface AdRow {
  id: string;
  format: string | null;
  template: string | null;
  angle: string;
  awareness: string | null;
  headline: string | null;
  primary_text: string;
  description: string | null;
  cta: string | null;
  visual_brief: string | null;
  grounding: string;
  hypothesis: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  ad_images?: AdImage[];
}

const FORMAT: Record<string, string> = { image: "Image", video: "Vidéo", carousel: "Carrousel", text: "Texte", document: "Document", other: "Autre" };
const AWARENESS: Record<string, string> = {
  unaware: "Ne connaît pas le problème",
  problem: "Connaît le problème",
  solution: "Compare les solutions",
  product: "Connaît l'offre",
};
type Field = "headline" | "primary_text" | "description" | "cta" | "visual_brief";
const FIELDS: Field[] = ["primary_text", "headline", "description", "cta", "visual_brief"];
const LABEL: Record<Field, string> = {
  primary_text: "Texte principal",
  headline: "Titre",
  description: "Description",
  cta: "Bouton",
  visual_brief: "Brief du visuel",
};

/** Compteur de caractères face à la limite de la plateforme : rouge au-delà du maximum, signalé au-delà du recommandé. */
function Count({ platform, field, value }: { platform: AdPlatform; field: Field; value: string }) {
  const limit = AD_LIMITS[platform][field as AdTextField];
  if (!limit) return null;
  const cap = limit.max ?? limit.recommended!;
  const over = value.length > cap;
  const note = limit.max ? "au plus" : "recommandés";
  const soft = !over && limit.max && limit.recommended && value.length > limit.recommended;
  return (
    <span className={over ? "pub-count is-over" : "pub-count"}>
      {value.length} / {cap} {note}
      {soft ? `, ${limit.recommended} visibles` : ""}
    </span>
  );
}

/**
 * Une pub proposée par l'agent Ads, présentée comme elle apparaîtra dans un fil.
 * En attente, elle se corrige avant d'être approuvée, ou se refuse avec une raison ; les deux servent de retours à l'agent.
 */
export function AdCard({ ad, platform, brand, assets }: { ad: AdRow; platform: AdPlatform; brand: string; assets: Asset[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = Object.fromEntries(FIELDS.map((f) => [f, ad[f] ?? ""])) as Record<Field, string>;
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const changed = FIELDS.filter((f) => values[f].trim() !== initial[f].trim());
  const tooLong = FIELDS.some((f) => {
    const max = AD_LIMITS[platform][f as AdTextField]?.max;
    return max !== undefined && values[f].length > max;
  });
  const invalid = tooLong || values.primary_text.trim().length < 10;

  const decide = (decision: "approved" | "rejected") =>
    start(async () => {
      setError(null);
      const payload =
        decision === "approved"
          ? { decision, ...(changed.length ? { edits: Object.fromEntries(changed.map((f) => [f, values[f].trim()])) } : {}) }
          : { decision, ...(reason.trim() ? { reason: reason.trim() } : {}) };
      const r = await fetch(`/api/pubs/${ad.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Échec");
      router.refresh();
    });

  const copy = () => {
    const text = [values.primary_text, values.headline && `Titre : ${values.headline}`, values.description && `Description : ${values.description}`, values.cta && `Bouton : ${values.cta}`]
      .filter(Boolean)
      .join("\n\n");
    void navigator.clipboard.writeText(text).then(() => setCopied(true));
  };

  const isPending = ad.status === "pending";
  return (
    <article className={`pub-card${ad.status === "rejected" ? " is-rejected" : ""}`} aria-label={`Pub : ${ad.angle}`}>
      <div className="pub-tags">
        <span className="pill pill-lavender">{ad.angle}</span>
        {ad.template ? <span className="pill">{ad.template}</span> : null}
        {ad.format ? <span className="muted" style={{ fontSize: 12 }}>{FORMAT[ad.format] ?? ad.format}</span> : null}
        <span style={{ marginLeft: "auto" }} className={ad.status === "approved" ? "pill pill-lime" : ad.status === "rejected" ? "pill" : "pill pill-warm"}>
          {ad.status === "approved" ? "Approuvée" : ad.status === "rejected" ? "Refusée" : "À choisir"}
        </span>
      </div>

      {editing && isPending ? (
        <div className="pub-edit">
          {FIELDS.map((f) => (
            <label key={f} className="field">
              <span className="row between">
                <span>{LABEL[f]}{values[f].trim() !== initial[f].trim() ? " (modifié)" : ""}</span>
                <Count platform={platform} field={f} value={values[f]} />
              </span>
              {f === "primary_text" || f === "visual_brief" ? (
                <textarea value={values[f]} rows={f === "primary_text" ? 5 : 3} disabled={pending} onChange={(e) => setValues({ ...values, [f]: e.target.value })} />
              ) : (
                <input value={values[f]} disabled={pending} onChange={(e) => setValues({ ...values, [f]: e.target.value })} />
              )}
            </label>
          ))}
        </div>
      ) : (
        <div className="pub-preview">
          <p className="pub-preview-text">{values.primary_text}</p>
          {values.visual_brief ? (
            <div className="pub-visual"><span>Visuel à produire</span>{values.visual_brief}</div>
          ) : null}
          <div className="pub-foot">
            <div>
              <small>{brand}</small>
              {values.headline ? <strong>{values.headline}</strong> : null}
              {values.description ? <small>{values.description}</small> : null}
            </div>
            {values.cta ? <span className="pub-cta">{values.cta}</span> : null}
          </div>
        </div>
      )}

      {ad.status === "rejected" ? null : (
        <AdVisual
          adId={ad.id}
          images={(ad.ad_images ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at))}
          assets={assets}
          hasBrief={Boolean(ad.visual_brief)}
        />
      )}

      <p className="pub-why">
        <strong>S'appuie sur : </strong>{ad.grounding}
        {ad.hypothesis ? <><br /><strong>Ce qu'on teste : </strong>{ad.hypothesis}</> : null}
        {ad.awareness ? <><br /><strong>Public : </strong>{AWARENESS[ad.awareness] ?? ad.awareness}</> : null}
        {ad.status === "rejected" && ad.rejection_reason ? <><br /><strong>Refusée : </strong>« {ad.rejection_reason} »</> : null}
      </p>

      {isPending ? (
        <>
          {rejecting ? (
            <label className="field">
              <span>Pourquoi la refuser ? Facultatif, l'agent s'en servira pour les prochaines pubs.</span>
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
                <button type="button" className="btn btn-dark btn-sm" disabled={pending || invalid} onClick={() => decide("approved")}>
                  {changed.length ? "Approuver la version corrigée" : "Approuver"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setEditing(!editing)}>{editing ? "Aperçu" : "Modifier"}</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setRejecting(true)}>Refuser</button>
              </>
            )}
          </div>
          {tooLong ? <span className="pub-count is-over" role="alert">Un texte dépasse la limite de la plateforme.</span> : null}
          {error ? <span className="muted" role="alert">{error}</span> : null}
        </>
      ) : ad.status === "approved" ? (
        <div className="row">
          <button type="button" className="btn btn-lime btn-sm" onClick={copy}>{copied ? "Copié" : "Copier le texte"}</button>
        </div>
      ) : null}
    </article>
  );
}
