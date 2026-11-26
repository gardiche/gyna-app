"use client";
import { useState } from "react";

/** Deux initiales tirées d'un nom (« Atelier Tilia » → « AT »). */
function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]!).join("") || "?").toUpperCase();
}

/** Teinte stable par nom, prise dans la palette de l'app, pour que les initiales se distinguent d'une ligne à l'autre. */
const TONES = ["var(--lavender-soft)", "var(--lime-soft)", "var(--hot-soft)", "var(--cold-soft)", "var(--warm-soft)"];
function toneOf(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
}

/**
 * Photo d'une personne ou logo d'une entreprise. Sans image, ou si elle ne se charge plus (les adresses d'images
 * LinkedIn expirent), on affiche les initiales : rien n'est inventé.
 * `favicon` : l'image vient d'un service d'icônes de site, qui rend une petite icône générique (16 px) quand le site
 * n'en a pas ; on la traite alors comme une image absente.
 */
export function Avatar({
  src, name, size = 44, shape = "round", favicon = false, className,
}: { src?: string | null; name: string; size?: number; shape?: "round" | "square"; favicon?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const show = Boolean(src) && !failed;
  return (
    <span
      className={`avatar avatar-${shape}${favicon && show ? " avatar-logo" : ""}${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)), background: show ? undefined : toneOf(name) }}
      aria-hidden="true"
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          onLoad={(e) => { if (favicon && e.currentTarget.naturalWidth <= 16) setFailed(true); }}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

/** Photo de la personne, avec le logo de son entreprise en petite vignette dans le coin. */
export function PersonAvatar({ photo, name, company, logo, logoIsFavicon = false, size = 44 }: { photo?: string | null; name: string; company?: string | null; logo?: string | null; logoIsFavicon?: boolean; size?: number }) {
  return (
    <span className="avatar-stack" style={{ width: size, height: size }}>
      <Avatar src={photo} name={name} size={size} />
      {company && logo ? <Avatar src={logo} name={company} size={Math.round(size * 0.4)} shape="square" favicon={logoIsFavicon} className="avatar-badge" /> : null}
    </span>
  );
}
