"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdImage } from "./AdVisual";

/**
 * Visuels des diapositives d'un carrousel, après la couverture : une image par diapositive, générée à partir
 * de son texte ou déposée. Le carrousel ne peut être publié que lorsque chaque diapositive a la sienne.
 */
export function CarouselVisuals({ postId, slides, images, aspect }: { postId: string; slides: Array<{ text: string }>; images: AdImage[]; aspect: "square" | "portrait" | "landscape" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  // La dernière image de chaque diapositive (la couverture, rang 0, se gère avec le visuel du post).
  const latest = (i: number) => images.filter((im) => (im.slide ?? 0) === i).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const rest = slides.map((s, i) => ({ ...s, i })).slice(1);
  const missing = rest.filter((s) => !latest(s.i)).map((s) => s.i);

  const generate = async (slide: number): Promise<boolean> => {
    const r = await fetch(`/api/pubs/${postId}/image`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ aspect, slide }) }).catch(() => null);
    if (r?.ok) return true;
    const body = (await r?.json().catch(() => null)) as { error?: string } | null;
    setError(`Diapositive ${slide + 1} : ${body?.error ?? (r ? `le serveur a répondu ${r.status}.` : "le serveur n'a pas répondu.")}`);
    return false;
  };

  const one = async (slide: number) => {
    setBusy(slide);
    setError(null);
    await generate(slide);
    setBusy(null);
    router.refresh();
  };

  const all = async () => {
    setBusy("all");
    setError(null);
    let done = 0;
    for (const slide of missing) {
      setProgress(`${done + 1} sur ${missing.length}`);
      if (await generate(slide)) done++;
      router.refresh();
    }
    setBusy(null);
    setProgress("");
  };

  const upload = async (slide: number, file: File | undefined) => {
    if (!file) return;
    setBusy(slide);
    setError(null);
    const data = new FormData();
    data.set("file", file);
    data.set("slide", String(slide));
    const r = await fetch(`/api/pubs/${postId}/image/upload`, { method: "POST", body: data }).catch(() => null);
    if (!r?.ok) setError(`Diapositive ${slide + 1} : ${((await r?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "le dépôt a échoué."}`);
    setBusy(null);
    router.refresh();
  };

  if (!rest.length) return null;

  return (
    <div className="pub-visual-box">
      <div className="row between">
        <strong style={{ fontSize: 13 }}>Visuels des diapositives</strong>
        <span className="muted" style={{ fontSize: 12 }}>{rest.length - missing.length} sur {rest.length}</span>
      </div>
      <ol className="slide-grid">
        {rest.map((s) => {
          const im = latest(s.i);
          const working = busy === s.i;
          return (
            <li key={s.i}>
              {im ? (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={im.url} target="_blank" rel="noreferrer"><img src={im.url} alt={`Visuel de la diapositive ${s.i + 1}`} loading="lazy" /></a>
              ) : (
                <div className="slide-empty">{working ? <span className="spinner" aria-hidden="true" /> : `Diapositive ${s.i + 1}`}</div>
              )}
              <span className="slide-text" title={s.text}>{s.i + 1}. {s.text}</span>
              <span className="row" style={{ gap: 6 }}>
                <button type="button" className="link-btn" disabled={busy !== null} onClick={() => void one(s.i)}>{working ? "En cours…" : im ? "Refaire" : "Générer"}</button>
                <label className="link-btn" style={{ cursor: busy !== null ? "wait" : "pointer" }}>
                  Déposer
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy !== null} onChange={(e) => void upload(s.i, e.target.files?.[0])} />
                </label>
              </span>
            </li>
          );
        })}
      </ol>
      {missing.length ? (
        <div className="row">
          <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void all()}>
            {busy === "all" ? <><span className="spinner" aria-hidden="true" /> Diapositives : {progress}…</> : `Générer les ${missing.length > 1 ? `${missing.length} visuels manquants` : "visuel manquant"}`}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>Une à deux minutes par image.</span>
        </div>
      ) : null}
      {error ? <span className="pub-count is-over" role="alert">{error}</span> : null}
    </div>
  );
}
