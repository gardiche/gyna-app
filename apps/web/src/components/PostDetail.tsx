"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { POST_LIMITS, countHashtags, type PostPlatform } from "@gyna/schemas";
import { AdVisual, type AdImage } from "./AdVisual";
import type { Asset } from "./AssetLibrary";
import { PublishControls, type PublishState } from "./PublishControls";
import { CarouselVisuals } from "./CarouselVisuals";

export interface PostRow extends PublishState {
  id: string;
  format: string | null;
  template: string | null;
  angle: string;
  headline: string | null;
  primary_text: string;
  description: string | null;
  visual_brief: string | null;
  slides: Array<{ text: string }> | null;
  scheduled_for: string | null;
  published_at: string | null;
  grounding: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  ad_images?: AdImage[];
}

export const POST_FORMAT: Record<string, string> = { text: "Texte", image: "Image", carousel: "Carrousel", document: "Document", video: "Vidéo" };
// Même plafond que la route de décision (`/api/pubs/[id]`).
const BRIEF_MAX = 1500;
const SLIDE_MAX = 600;

/**
 * Détail d'un post proposé par l'agent, dans le panneau latéral : visuels, texte (ce qui se voit avant « voir plus », puis la suite),
 * diapositives, premier commentaire, justification et publication. Il se corrige, se date, s'approuve ou se refuse ;
 * une fois approuvé, l'associé le publie ou le planifie, ou le copie et le marque comme publié.
 */
export function PostDetail({ post, platform, author, assets, connected, facebook = false }: { post: PostRow; platform: PostPlatform; author: string; assets: Asset[]; connected: boolean; facebook?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(post.primary_text);
  const [comment, setComment] = useState(post.description ?? "");
  const [brief, setBrief] = useState(post.visual_brief ?? "");
  // Diapositives en cours de correction ; `from` garde leur rang d'origine, pour que leurs images les suivent.
  const [slides, setSlides] = useState(() => (post.slides ?? []).map((s, i) => ({ text: s.text, from: i })));
  const [date, setDate] = useState(post.scheduled_for ?? "");
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const limit = POST_LIMITS[platform];
  const tooLong = text.length > limit.max;
  const tags = countHashtags(text);
  const briefChanged = brief.trim() !== (post.visual_brief ?? "").trim();
  const briefTooLong = brief.length > BRIEF_MAX;
  const slidesMoved = slides.some((s, i) => s.from !== i);
  const slidesRetyped = slides.some((s) => s.text.trim() !== (post.slides?.[s.from]?.text ?? "").trim());
  const slidesInvalid = slides.some((s) => s.text.trim().length < 2 || s.text.length > SLIDE_MAX);
  const changed = text.trim() !== post.primary_text.trim() || comment.trim() !== (post.description ?? "").trim() || briefChanged || slidesMoved || slidesRetyped;
  const move = (i: number, by: -1 | 1) => {
    const next = slides.slice();
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setSlides(next);
  };
  const isPending = post.status === "pending";
  const images = post.ad_images ?? [];
  const covers = images.filter((im) => (im.slide ?? 0) === 0);
  const slideCount = post.slides?.length ?? 0;
  // Diapositives d'un carrousel encore sans image (la couverture comprise).
  const readySlides = slideCount ? Array.from({ length: slideCount }, (_, i) => i).filter((i) => images.some((im) => (im.slide ?? 0) === i)).length : 0;
  // Pourquoi ce post ne peut pas partir tout seul, s'il y a lieu.
  const blocker =
    platform !== "instagram" ? "LinkedIn n'est pas encore relié : copiez le post et publiez-le vous-même."
    : !connected ? "Instagram n'est pas encore relié à l'app : copiez le post et publiez-le vous-même."
    : slideCount && !covers.length ? "Le carrousel n'a pas encore de couverture : générez ou déposez son visuel pour pouvoir publier."
    : slideCount && readySlides < 2 ? "Un carrousel demande au moins 2 images : générez ou déposez le visuel d'une autre diapositive."
    : readySlides > 10 ? "Instagram accepte 10 images au plus par carrousel : celui-ci se publie à la main."
    : !covers.length ? "Instagram exige une image : générez ou déposez le visuel pour pouvoir publier."
    : null;
  const head = text.slice(0, limit.visible);
  const rest = text.slice(limit.visible);

  const call = (url: string, method: string, body: unknown) =>
    start(async () => {
      setError(null);
      const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Échec");
      router.refresh();
    });

  const decide = (decision: "approved" | "rejected") => {
    const edits: Record<string, unknown> = {};
    if (text.trim() !== post.primary_text.trim()) edits.primary_text = text.trim();
    if (comment.trim() !== (post.description ?? "").trim()) edits.description = comment.trim();
    if (briefChanged) edits.visual_brief = brief.trim();
    if (slidesMoved || slidesRetyped) edits.slides = slides.map((s) => ({ text: s.text.trim(), from: s.from }));
    call(`/api/pubs/${post.id}`, "POST", decision === "approved"
      ? { decision, ...(Object.keys(edits).length ? { edits } : {}) }
      : { decision, ...(reason.trim() ? { reason: reason.trim() } : {}) });
  };
  const saveDate = (value: string) => {
    setDate(value);
    call(`/api/pubs/${post.id}/schedule`, "PATCH", { scheduled_for: value || null });
  };
  const copy = () => {
    const parts = [text, slides.length ? slides.map((s, i) => `Diapositive ${i + 1} : ${s.text}`).join("\n") : "", comment && `Premier commentaire : ${comment}`];
    void navigator.clipboard.writeText(parts.filter(Boolean).join("\n\n")).then(() => setCopied(true));
  };

  const edit = editing && isPending;
  return (
    <>
      <div className="drawer-body">
        {post.status === "rejected" ? null : (
          <section className="detail-sec">
            <h3>{slideCount > 1 ? "Couverture" : "Visuel"}</h3>
            <AdVisual adId={post.id} images={covers.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))} assets={assets} hasBrief={Boolean(post.visual_brief)} />
            {slideCount > 1 ? <CarouselVisuals postId={post.id} slides={post.slides!} images={images} aspect={platform === "instagram" ? "portrait" : "square"} /> : null}
          </section>
        )}

        <section className="detail-sec">
          {edit ? (
            <label className="field">
              <span className="row between">
                <span>Texte{text.trim() !== post.primary_text.trim() ? " (modifié)" : ""}</span>
                <span className={tooLong ? "pub-count is-over" : "pub-count"}>{text.length} / {limit.max}, {limit.visible} visibles</span>
              </span>
              <textarea value={text} rows={10} disabled={pending} onChange={(e) => setText(e.target.value)} />
            </label>
          ) : (
            <>
              <div className="row between">
                <h3>Texte</h3>
                <span className="pub-count">{text.length} / {limit.max}</span>
              </div>
              <div className="detail-text">
                <div className="post-author"><span className="post-avatar" aria-hidden="true">{author.slice(0, 1).toUpperCase()}</span><strong>{author}</strong></div>
                {head}
                {rest ? <><span className="fold-mark">voir plus</span><span className="fold">{rest}</span></> : null}
              </div>
            </>
          )}
        </section>

        {slides.length ? (
          <section className="detail-sec">
            <h3>Diapositives{slidesMoved || slidesRetyped ? ", modifiées" : ""}</h3>
            <ol className="slides">
              {slides.map((s, i) => (
                <li key={s.from}>
                  {edit ? (
                    <>
                      <div className="row between">
                        <span>{i === 0 ? "Couverture" : `Diapositive ${i + 1}`}{s.from !== i ? `, avant en ${s.from + 1}` : ""}</span>
                        <div className="row" style={{ gap: 6 }}>
                          <button type="button" className="link-btn" disabled={pending || i === 0} onClick={() => move(i, -1)} aria-label={`Monter la diapositive ${i + 1}`}>Monter</button>
                          <button type="button" className="link-btn" disabled={pending || i === slides.length - 1} onClick={() => move(i, 1)} aria-label={`Descendre la diapositive ${i + 1}`}>Descendre</button>
                        </div>
                      </div>
                      <textarea value={s.text} rows={2} maxLength={SLIDE_MAX} disabled={pending} onChange={(e) => setSlides(slides.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                    </>
                  ) : (
                    <><span>{i === 0 ? "Couverture" : `Diapositive ${i + 1}`}</span>{s.text}</>
                  )}
                </li>
              ))}
            </ol>
            {edit && (slidesMoved || slidesRetyped) ? (
              <span className="muted" style={{ fontSize: 12 }}>
                Le nouvel ordre est enregistré à l'approbation, et chaque visuel déjà fait suit sa diapositive.
                {slidesRetyped ? " Refaites ensuite le visuel des diapositives dont le texte a changé." : ""}
              </span>
            ) : null}
          </section>
        ) : null}

        {edit ? (
          <section className="detail-sec">
            <label className="field">
              Premier commentaire (le lien, sur LinkedIn)
              <input value={comment} maxLength={600} disabled={pending} onChange={(e) => setComment(e.target.value)} />
            </label>
            <label className="field">
              <span className="row between">
                <span>Brief du visuel{briefChanged ? " (modifié)" : ""}</span>
                <span className={briefTooLong ? "pub-count is-over" : "pub-count"}>{brief.length} / {BRIEF_MAX} au plus</span>
              </span>
              <textarea value={brief} rows={3} disabled={pending} onChange={(e) => setBrief(e.target.value)} />
              {briefChanged ? <span className="muted" style={{ fontSize: 12 }}>Le nouveau brief est enregistré à l'approbation du post. Générez les visuels ensuite pour qu'ils en tiennent compte.</span> : null}
            </label>
          </section>
        ) : comment || brief ? (
          <section className="detail-sec">
            <dl className="detail-fields">
              {comment ? <div className="is-wide"><dt><span>Premier commentaire</span></dt><dd className="detail-text">{comment}</dd></div> : null}
              {brief ? <div className="is-wide"><dt><span>Brief du visuel</span></dt><dd className="detail-brief">{brief}</dd></div> : null}
            </dl>
          </section>
        ) : null}

        <section className="detail-sec">
          <h3>Pourquoi ce post</h3>
          <dl className="detail-why">
            <dt>S'appuie sur</dt><dd>{post.grounding}</dd>
            {tags > 5 ? <><dt>À revoir</dt><dd>{tags} hashtags, 5 au plus conseillés.</dd></> : null}
            {post.status === "rejected" && post.rejection_reason ? <><dt>Refusé</dt><dd>« {post.rejection_reason} »</dd></> : null}
          </dl>
        </section>

        {post.status === "rejected" ? null : (
          <section className="detail-sec">
            <h3>Publication</h3>
            <label className="field" style={{ maxWidth: 220 }}>
              Date prévue
              <input type="date" value={date} disabled={pending} onChange={(e) => saveDate(e.target.value)} />
            </label>
            {post.status === "approved" ? (
              <PublishControls
                postId={post.id}
                state={post}
                blocker={blocker}
                facebook={facebook}
                notice={slideCount && readySlides < slideCount ? `${readySlides} diapositives sur ${slideCount} ont une image : seules ces ${readySlides} seront publiées, dans l'ordre. Vérifiez que la légende tient toujours.` : null}
              />
            ) : null}
          </section>
        )}
      </div>

      {isPending ? (
        <div className="drawer-foot">
          {rejecting ? (
            <label className="field">
              <span>Pourquoi le refuser ? Facultatif, l'agent s'en servira pour les prochains posts.</span>
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
                <button type="button" className="btn btn-dark btn-sm" disabled={pending || tooLong || briefTooLong || slidesInvalid || text.trim().length < 20} onClick={() => decide("approved")}>
                  {changed ? "Approuver la version corrigée" : "Approuver"}
                </button>
                <button type="button" className="btn btn-sm" disabled={pending} onClick={() => setEditing(!editing)}>{editing ? "Relire" : "Modifier"}</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setRejecting(true)}>Refuser</button>
              </>
            )}
          </div>
          {error ? <span className="pub-count is-over" role="alert">{error}</span> : null}
        </div>
      ) : post.status === "approved" ? (
        <div className="drawer-foot">
          <div className="row">
            <button type="button" className="btn btn-lime btn-sm" onClick={copy}>{copied ? "Copié" : "Copier le post"}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => call(`/api/pubs/${post.id}/schedule`, "PATCH", { published: !post.published_at })}>
              {post.published_at ? "Annuler « publié »" : "Marquer comme publié"}
            </button>
          </div>
          {error ? <span className="pub-count is-over" role="alert">{error}</span> : null}
        </div>
      ) : error ? (
        <div className="drawer-foot"><span className="pub-count is-over" role="alert">{error}</span></div>
      ) : null}
    </>
  );
}
