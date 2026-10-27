"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSET_KIND_LABEL, IMAGE_ASPECTS } from "@gyna/schemas";
import type { Asset } from "./AssetLibrary";

/** Relevé de la finition d'un visuel (voir lib/finish-visual) ; seuls les avertissements sont montrés. */
export interface AdImage { id: string; url: string; aspect: string; created_at: string; slide?: number; prompt?: string; checks?: { avertissements?: string[] } | null }

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

  const [modify, setModify] = useState(false);
  const [change, setChange] = useState("");
  const [rawPrompt, setRawPrompt] = useState("");
  const [editRaw, setEditRaw] = useState(false);
  const [logoCoin, setLogoCoin] = useState("");
  const [logoSize, setLogoSize] = useState("");
  const [attached, setAttached] = useState<Array<{ url: string; name: string }>>([]);

  /** Dépose une image jointe à la retouche (3 au plus) : le rendu doit s'en inspirer. */
  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    for (const file of Array.from(files).slice(0, 3 - attached.length)) {
      const data = new FormData();
      data.set("file", file);
      const r = await fetch("/api/files", { method: "POST", body: data }).catch(() => null);
      const out = (await r?.json().catch(() => ({}))) as { url?: string; error?: string } | undefined;
      if (!r?.ok || !out?.url) {
        setError(out?.error ?? "Le dépôt a échoué.");
        break;
      }
      setAttached((a) => [...a, { url: out.url!, name: file.name }]);
    }
    setBusy(false);
  };

  /** Refait la version affichée avec un changement (ou une consigne complète éditée à la main). */
  const regenerate = async () => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/pubs/${adId}/image`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editRaw ? { prompt: rawPrompt, aspect: current.aspect, base_image_id: current.id } : { base_image_id: current.id, ...(change.trim() ? { change: change.trim() } : {}), inspiration_urls: attached.map((a) => a.url), ...(logoCoin || logoSize ? { logo: { ...(logoCoin ? { coin: logoCoin } : {}), ...(logoSize ? { taille_facteur: Number(logoSize) } : {}) } } : {}) }),
      });
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "La génération a échoué.");
      else {
        setModify(false);
        setChange("");
        setAttached([]);
        setLogoCoin("");
        setLogoSize("");
        setShown(0);
        router.refresh();
      }
    } catch {
      setError("La génération a été interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

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
          {current.checks?.avertissements?.length ? (
            <ul className="notice" style={{ margin: 0, paddingLeft: 30, fontSize: 13 }} aria-label="Vérifications de la charte">
              {current.checks.avertissements.map((w) => <li key={w}>{w}</li>)}
            </ul>
          ) : null}
        </>
      ) : null}

      {modify && current ? (
        <div className="pub-edit">
          {editRaw ? (
            <label className="field">
              Consigne complète envoyée au générateur
              <textarea value={rawPrompt} rows={12} maxLength={8000} disabled={busy} onChange={(e) => setRawPrompt(e.target.value)} />
            </label>
          ) : (
            <label className="field">
              Que faut-il changer ?
              <textarea value={change} rows={3} maxLength={600} disabled={busy} placeholder="Fond ivoire au lieu du violet, sans la personne, titre plus court" onChange={(e) => setChange(e.target.value)} />
            </label>
          )}
          {editRaw ? null : (
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <label className="field" style={{ minWidth: 190 }}>
                Logo
                <select value={logoCoin} disabled={busy} onChange={(e) => setLogoCoin(e.target.value)}>
                  <option value="">Emplacement de la charte</option>
                  <option value="haut-gauche">En haut à gauche</option>
                  <option value="haut-centre">En haut au centre</option>
                  <option value="haut-droite">En haut à droite</option>
                  <option value="centre">Au centre</option>
                  <option value="bas-gauche">En bas à gauche</option>
                  <option value="bas-centre">En bas au centre</option>
                  <option value="bas-droite">En bas à droite</option>
                  <option value="aucun">Sans logo</option>
                </select>
              </label>
              <label className="field" style={{ minWidth: 150 }}>
                Taille du logo
                <select value={logoSize} disabled={busy} onChange={(e) => setLogoSize(e.target.value)}>
                  <option value="">Celle de la charte</option>
                  <option value="0.7">Plus petit</option>
                  <option value="1.4">Plus grand</option>
                  <option value="2">Beaucoup plus grand</option>
                </select>
              </label>
            </div>
          )}
          {editRaw ? null : (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                {attached.map((a) => (
                  <span key={a.url} className="row" style={{ gap: 6 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.name} style={{ height: 56, width: 56, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line-2)" }} />
                    <button type="button" className="link-btn" disabled={busy} onClick={() => setAttached((x) => x.filter((y) => y.url !== a.url))} aria-label={`Retirer ${a.name}`}>Retirer</button>
                  </span>
                ))}
              </div>
              {attached.length < 3 ? (
                <label className="btn btn-ghost btn-sm" style={{ cursor: busy ? "wait" : "pointer", alignSelf: "flex-start" }}>
                  Joindre une image d'inspiration
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={busy} onChange={(e) => { void attach(e.target.files); e.target.value = ""; }} />
                </label>
              ) : null}
              {attached.length ? <p className="muted" style={{ fontSize: 12, margin: 0 }}>Le rendu s'en inspirera (style, composition, ambiance) sans les copier. Pas de texte nécessaire si c'est tout ce que vous voulez changer.</p> : null}
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Avec OpenRouter, l'image précédente est renvoyée au générateur pour une vraie retouche ; avec Hermes seul, il la refait à partir de la même consigne et de votre changement, et le reste peut varier un peu.
          </p>
          <div className="row">
            <button type="button" className="btn btn-dark btn-sm" disabled={busy || (editRaw ? rawPrompt.trim().length < 20 : change.trim().length < 3 && !attached.length && !logoCoin && !logoSize)} onClick={regenerate}>
              {busy ? <><span className="spinner" aria-hidden="true" /> En cours…</> : (logoCoin || logoSize) && !change.trim() && !attached.length ? "Déplacer le logo" : "Refaire avec ce changement"}
            </button>
            {busy ? null : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditRaw(!editRaw)} disabled={!current.prompt && !editRaw}>{editRaw ? "Décrire un changement" : "Modifier la consigne complète"}</button>}
            {busy ? null : <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setModify(false); setAttached([]); }}>Annuler</button>}
          </div>
          {error ? <span className="pub-count is-over" role="alert">{error}</span> : null}
        </div>
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
          {current ? (
            <button type="button" className="btn btn-sm" onClick={() => { setRawPrompt(current.prompt ?? ""); setEditRaw(false); setModify(true); }}>
              Modifier cette version
            </button>
          ) : null}
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
