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

const FORMAT: Record<string, string> = { text: "Texte", image: "Image", carousel: "Carrousel", document: "Document", video: "Vidéo" };

/**
 * Un post proposé par l'agent, présenté comme dans le fil du réseau : ce qui se voit avant « voir plus »,
 * puis la suite, les diapositives et le premier commentaire. Il se corrige, se date, s'approuve ou se refuse ;
 * une fois approuvé, l'associé le publie lui-même puis le marque comme publié.
 */
export function PostCard({ post, platform, author, assets, connected }: { post: PostRow; platform: PostPlatform; author: string; assets: Asset[]; connected: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(post.primary_text);
  const [comment, setComment] = useState(post.description ?? "");
  const [date, setDate] = useState(post.scheduled_for ?? "");
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const limit = POST_LIMITS[platform];
  const tooLong = text.length > limit.max;
  const tags = countHashtags(text);
  const changed = text.trim() !== post.primary_text.trim() || comment.trim() !== (post.description ?? "").trim();
  const isPending = post.status === "pending";
  const images = post.ad_images ?? [];
  const covers = images.filter((im) => (im.slide ?? 0) === 0);
  const slideCount = post.slides?.length ?? 0;
  // Diapositives d'un carrousel encore sans image (la couverture comprise).
  const missingSlides = slideCount ? Array.from({ length: slideCount }, (_, i) => i).filter((i) => !images.some((im) => (im.slide ?? 0) === i)).length : 0;
  // Pourquoi ce post ne peut pas partir tout seul, s'il y a lieu.
  const blocker =
    platform !== "instagram" ? "LinkedIn n'est pas encore relié : copiez le post et publiez-le vous-même."
    : !connected ? "Instagram n'est pas encore relié à l'app : copiez le post et publiez-le vous-même."
    : slideCount === 1 || slideCount > 10 ? "Instagram accepte les carrousels de 2 à 10 images : celui-ci se publie à la main."
    : missingSlides ? `Il manque le visuel de ${missingSlides} diapositive${missingSlides > 1 ? "s" : ""} : générez-les ou déposez-les pour pouvoir publier le carrousel.`
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
    const edits: Record<string, string> = {};
    if (text.trim() !== post.primary_text.trim()) edits.primary_text = text.trim();
    if (comment.trim() !== (post.description ?? "").trim()) edits.description = comment.trim();
    call(`/api/pubs/${post.id}`, "POST", decision === "approved"
      ? { decision, ...(Object.keys(edits).length ? { edits } : {}) }
      : { decision, ...(reason.trim() ? { reason: reason.trim() } : {}) });
  };
  const saveDate = (value: string) => {
    setDate(value);
    call(`/api/pubs/${post.id}/schedule`, "PATCH", { scheduled_for: value || null });
  };
  const copy = () => {
    const parts = [text, post.slides?.length ? post.slides.map((s, i) => `Diapositive ${i + 1} : ${s.text}`).join("\n") : "", comment && `Premier commentaire : ${comment}`];
    void navigator.clipboard.writeText(parts.filter(Boolean).join("\n\n")).then(() => setCopied(true));
  };

  return (
    <article className={`pub-card${post.status === "rejected" ? " is-rejected" : ""}`} aria-label={`Post : ${post.angle}`}>
      <div className="pub-tags">
        <span className="pill pill-lavender">{post.angle}</span>
        {post.format ? <span className="pill">{FORMAT[post.format] ?? post.format}</span> : null}
        {post.template ? <span className="muted" style={{ fontSize: 12 }}>{post.template}</span> : null}
        <span style={{ marginLeft: "auto" }} className={post.published_at ? "pill pill-cold" : post.status === "approved" ? "pill pill-lime" : post.status === "rejected" ? "pill" : "pill pill-warm"}>
          {post.published_at ? "Publié" : post.publish_status === "scheduled" ? "Planifié" : post.status === "approved" ? "Approuvé" : post.status === "rejected" ? "Refusé" : "À choisir"}
        </span>
      </div>

      {editing && isPending ? (
        <div className="pub-edit">
          <label className="field">
            <span className="row between">
              <span>Texte{text.trim() !== post.primary_text.trim() ? " (modifié)" : ""}</span>
              <span className={tooLong ? "pub-count is-over" : "pub-count"}>{text.length} / {limit.max}, {limit.visible} visibles</span>
            </span>
            <textarea value={text} rows={9} disabled={pending} onChange={(e) => setText(e.target.value)} />
          </label>
          <label className="field">
            Premier commentaire (le lien, sur LinkedIn)
            <input value={comment} maxLength={600} disabled={pending} onChange={(e) => setComment(e.target.value)} />
          </label>
        </div>
      ) : (
        <div className="pub-preview">
          <div className="post-author"><span className="post-avatar" aria-hidden="true">{author.slice(0, 1).toUpperCase()}</span><strong>{author}</strong></div>
          <p className="pub-preview-text">
            {head}
            {rest ? (expanded ? rest : <>… <button type="button" className="link-btn" onClick={() => setExpanded(true)}>voir plus</button></>) : null}
          </p>
          {post.slides?.length ? (
            <ol className="slides">
              {post.slides.map((s, i) => <li key={i}><span>{i === 0 ? "Couverture" : `Diapositive ${i + 1}`}</span>{s.text}</li>)}
            </ol>
          ) : null}
          {post.visual_brief ? <div className="pub-visual" style={{ marginBottom: 10 }}><span>Visuel à produire</span>{post.visual_brief}</div> : null}
          {comment ? <p className="post-comment"><strong>Premier commentaire : </strong>{comment}</p> : null}
        </div>
      )}

      {post.status === "rejected" ? null : (
        <AdVisual adId={post.id} images={covers.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))} assets={assets} hasBrief={Boolean(post.visual_brief)} />
      )}

      {post.status !== "rejected" && slideCount > 1 ? (
        <CarouselVisuals postId={post.id} slides={post.slides!} images={images} aspect={platform === "instagram" ? "portrait" : "square"} />
      ) : null}

      <p className="pub-why">
        <strong>S'appuie sur : </strong>{post.grounding}
        {tags > 5 ? <><br /><strong>À revoir : </strong>{tags} hashtags, 5 au plus conseillés.</> : null}
        {post.status === "rejected" && post.rejection_reason ? <><br /><strong>Refusé : </strong>« {post.rejection_reason} »</> : null}
      </p>

      {post.status === "rejected" ? null : (
        <label className="field" style={{ maxWidth: 220 }}>
          Date prévue
          <input type="date" value={date} disabled={pending} onChange={(e) => saveDate(e.target.value)} />
        </label>
      )}

      {isPending ? (
        <>
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
                <button type="button" className="btn btn-dark btn-sm" disabled={pending || tooLong || text.trim().length < 20} onClick={() => decide("approved")}>
                  {changed ? "Approuver la version corrigée" : "Approuver"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setEditing(!editing)}>{editing ? "Aperçu" : "Modifier"}</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setRejecting(true)}>Refuser</button>
              </>
            )}
          </div>
        </>
      ) : post.status === "approved" ? (
        <>
        <PublishControls postId={post.id} state={post} blocker={blocker} />
        <div className="row">
          <button type="button" className="btn btn-lime btn-sm" onClick={copy}>{copied ? "Copié" : "Copier le post"}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => call(`/api/pubs/${post.id}/schedule`, "PATCH", { published: !post.published_at })}>
            {post.published_at ? "Annuler « publié »" : "Marquer comme publié"}
          </button>
        </div>
        </>
      ) : null}
      {error ? <span className="muted" role="alert">{error}</span> : null}
    </article>
  );
}
