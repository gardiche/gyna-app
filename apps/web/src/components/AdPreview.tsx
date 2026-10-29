"use client";
import { useState } from "react";

/** Nom et logo affichés en tête de la pub, comme ceux de la Page Facebook et du compte Instagram. */
export interface PreviewBrand { name: string; logo: string | null }

// Libellés des boutons tels que Meta les affiche en français ; un bouton déjà rédigé en français passe tel quel.
const CTA: Record<string, string> = {
  LEARN_MORE: "En savoir plus",
  SIGN_UP: "S'inscrire",
  APPLY_NOW: "Postuler",
  SUBSCRIBE: "S'abonner",
  CONTACT_US: "Nous contacter",
  GET_QUOTE: "Demander un devis",
  BOOK_TRAVEL: "Réserver",
  DOWNLOAD: "Télécharger",
  SHOP_NOW: "Acheter",
  REGISTER: "S'inscrire",
};
const ctaLabel = (cta: string | null) => (cta ? CTA[cta.trim().toUpperCase().replace(/\s+/g, "_")] ?? cta : "En savoir plus");

/** Texte principal coupé comme dans le fil : 125 caractères environ, puis « voir plus ». */
function Clamp({ text, more, limit = 125 }: { text: string; more: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  const cut = text.length > limit && !open;
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {cut ? `${text.slice(0, limit).trimEnd()}… ` : text}
      {cut ? <button type="button" className="apv-more" onClick={() => setOpen(true)}>{more}</button> : null}
    </span>
  );
}

function Avatar({ brand, size }: { brand: PreviewBrand; size: number }) {
  return brand.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logo} alt="" className="apv-avatar" style={{ width: size, height: size }} />
  ) : (
    <span className="apv-avatar apv-avatar-empty" style={{ width: size, height: size }}>{brand.name.slice(0, 1)}</span>
  );
}

/** Visuel unique, ou diapositives qui défilent pour un carrousel. */
function Media({ images, cards }: { images: string[]; cards?: Array<{ headline: string; cta: string }> }) {
  if (!images.length) return <div className="apv-media-empty">Le visuel n'est pas encore fait.</div>;
  if (images.length === 1) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={images[0]} alt="" className="apv-media" />;
  }
  return (
    <div className="apv-carousel">
      {images.map((src, i) => (
        <figure key={src + i}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" />
          {cards?.[i] ? (
            <figcaption className="apv-fb-bar">
              <strong>{cards[i]!.headline}</strong>
              <span className="apv-fb-btn">{cards[i]!.cta}</span>
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

/**
 * Aperçu de la pub dans le fil Facebook et dans le fil Instagram, dessiné par l'app à partir des textes et
 * du dernier visuel. Proche du rendu réel, sans en être une capture : Meta adapte la coupe du texte et le cadrage.
 */
export function AdPreview({
  brand,
  text,
  headline,
  description,
  cta,
  images,
  slideHeadlines,
}: {
  brand: PreviewBrand;
  text: string;
  headline: string;
  description: string;
  cta: string | null;
  images: string[];
  slideHeadlines?: string[];
}) {
  const [where, setWhere] = useState<"facebook" | "instagram">("facebook");
  const button = ctaLabel(cta);
  const handle = brand.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
  const carousel = images.length > 1;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" role="tablist" aria-label="Réseau" style={{ gap: 6 }}>
        {(["facebook", "instagram"] as const).map((w) => (
          <button key={w} type="button" role="tab" aria-selected={where === w} className={where === w ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"} onClick={() => setWhere(w)}>
            {w === "facebook" ? "Facebook" : "Instagram"}
          </button>
        ))}
      </div>

      {where === "facebook" ? (
        <article className="apv apv-fb" aria-label="Aperçu dans le fil Facebook">
          <header className="apv-head">
            <Avatar brand={brand} size={40} />
            <div>
              <strong>{brand.name}</strong>
              <small>Sponsorisé · 🌐</small>
            </div>
            <span className="apv-dots" aria-hidden="true">···</span>
          </header>
          <p className="apv-text"><Clamp text={text} more="Voir plus" /></p>
          <Media images={images} cards={carousel ? images.map((_, i) => ({ headline: slideHeadlines?.[i] || headline, cta: button })) : undefined} />
          {carousel ? null : (
            <div className="apv-fb-bar">
              <div>
                {headline ? <strong>{headline}</strong> : null}
                {description ? <small>{description}</small> : null}
              </div>
              <span className="apv-fb-btn">{button}</span>
            </div>
          )}
          <footer className="apv-fb-actions" aria-hidden="true">
            <span>👍 J'aime</span>
            <span>💬 Commenter</span>
            <span>↗ Partager</span>
          </footer>
        </article>
      ) : (
        <article className="apv apv-ig" aria-label="Aperçu dans le fil Instagram">
          <header className="apv-head">
            <Avatar brand={brand} size={32} />
            <div>
              <strong>{handle || brand.name}</strong>
              <small>Sponsorisé</small>
            </div>
            <span className="apv-dots" aria-hidden="true">···</span>
          </header>
          <Media images={images} />
          <div className="apv-ig-cta">
            <span>{button}</span>
            <span aria-hidden="true">›</span>
          </div>
          <div className="apv-ig-icons" aria-hidden="true">
            <span>♡</span>
            <span>💬</span>
            <span>➤</span>
            {carousel ? <span className="apv-ig-pager">{images.map((_, i) => <i key={i} className={i === 0 ? "on" : undefined} />)}</span> : null}
            <span style={{ marginLeft: "auto" }}>🔖</span>
          </div>
          <p className="apv-text">
            <strong>{handle || brand.name}</strong> <Clamp text={text} more="plus" />
          </p>
        </article>
      )}
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Aperçu dessiné par Gyna : proche du rendu réel, mais Meta adapte la coupe du texte et le cadrage selon l'emplacement.
      </p>
    </div>
  );
}
