"use client";
import type { PostPlatform } from "@gyna/schemas";
import { CreativeBoard, type BoardBatch, type Tile } from "./CreativeBoard";
import { PostDetail, POST_FORMAT, type PostRow } from "./PostDetail";
import { BatchVisuals } from "./BatchVisuals";
import type { Asset } from "./AssetLibrary";

export interface PostBatch {
  id: string;
  title: string;
  platform: PostPlatform;
  author: string;
  rationale: string;
  /** Date du lot, déjà mise en forme. */
  date: string;
  posts: PostRow[];
}

const PLATFORM: Record<string, string> = { linkedin: "LinkedIn", instagram: "Instagram" };
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const day = (d: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const short = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const hour = (d: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));
const when = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));
/** Premier paragraphe d'un texte, coupé pour tenir sur la carte. */
const lead = (text: string, max = 160) => {
  const first = text.trim().split(/\n\s*\n|\n/)[0] ?? "";
  return first.length > max ? `${first.slice(0, max).trimEnd()}…` : first;
};

function tile(p: PostRow, b: PostBatch): Tile {
  const [state, label, tone] =
    p.status === "rejected" ? (["rejected", "Refusé", "plain"] as const)
    : p.status === "pending" ? (["pending", "À choisir", "warm"] as const)
    : p.published_at ? (["published", "Publié", "lavender"] as const)
    : p.publish_status === "scheduled" ? (["scheduled", "Planifié", "cold"] as const)
    : p.publish_status === "failed" ? (["approved", "Échec de publication", "hot"] as const)
    : p.publish_status === "publishing" ? (["approved", "Publication en cours", "cold"] as const)
    : (["approved", "À publier", "lime"] as const);
  const cover = (p.ad_images ?? []).filter((im) => (im.slide ?? 0) === 0).sort((x, y) => y.created_at.localeCompare(x.created_at))[0]?.url ?? null;
  const format = p.format ? POST_FORMAT[p.format] ?? p.format : null;
  const note =
    state === "scheduled" && p.scheduled_at ? `Part le ${when(p.scheduled_at)}`
    : state === "approved" && p.scheduled_for ? `Prévu le ${short(p.scheduled_for)}`
    : null;
  return {
    id: p.id,
    state,
    label,
    tone,
    image: cover,
    hook: p.slides?.[0]?.text ?? lead(p.primary_text),
    // Sans visuel, l'accroche est déjà en grand sur la carte : l'angle sert alors de titre.
    title: p.headline ?? (cover ? lead(p.primary_text, 90) : p.angle),
    meta: [p.headline || cover ? p.angle : null, format].filter(Boolean).join(" · "),
    slides: p.slides?.length ?? 0,
    note,
    tags: [
      { text: p.angle, tone: "lavender" },
      { text: PLATFORM[b.platform] ?? b.platform, tone: "cold" },
      { text: b.author },
      ...(format ? [{ text: format }] : []),
    ],
  };
}

/**
 * Les posts de la venture en grille, lot par lot, avec en tête ceux qui attendent d'être publiés ;
 * chacun s'ouvre dans le panneau de détail pour être relu, corrigé, décidé puis publié.
 */
export function PostBoard({ batches, assets, connected, today }: { batches: PostBatch[]; assets: Asset[]; connected: { instagram: boolean; facebook: boolean }; today: string }) {
  const byId = new Map(batches.flatMap((b) => b.posts.map((p) => [p.id, { post: p, batch: b }] as const)));
  const upcoming = batches
    .flatMap((b) => b.posts.map((p) => ({ ...p, platform: b.platform, author: b.author })))
    .filter((p) => p.status === "approved" && !p.published_at && p.scheduled_for)
    .sort((a, b) => (a.scheduled_at ?? a.scheduled_for!).localeCompare(b.scheduled_at ?? b.scheduled_for!));

  const board = batches.map((b): BoardBatch => {
    const left = b.posts.filter((p) => p.status === "pending").length;
    const missing = b.posts.filter((p) => p.status !== "rejected" && !(p.ad_images ?? []).some((im) => (im.slide ?? 0) === 0)).map((p) => p.id);
    return {
      id: b.id,
      title: b.title,
      date: b.date,
      tags: [
        { text: PLATFORM[b.platform] ?? b.platform, tone: "cold" },
        { text: b.author },
        left ? { text: plural(left, "post à choisir", "posts à choisir"), tone: "warm" } : { text: "Lot traité", tone: "lime" },
      ],
      why: { label: "Ligne éditoriale", rows: [["Ligne éditoriale", b.rationale]] },
      extra: <BatchVisuals ids={missing} aspect={b.platform === "instagram" ? "portrait" : "square"} />,
      tiles: b.posts.map((p) => tile(p, b)),
    };
  });

  return (
    <CreativeBoard
      noun="post"
      batches={board}
      filters={[
        { key: "pending", label: "À choisir" },
        { key: "approved", label: "À publier" },
        { key: "scheduled", label: "Planifiés" },
        { key: "published", label: "Publiés" },
        { key: "rejected", label: "Refusés" },
      ]}
      before={(open) =>
        upcoming.length ? (
          <section className="card card-pad stack" aria-labelledby="calendrier">
            <h2 id="calendrier" style={{ fontSize: 18, fontWeight: 600 }}>À publier</h2>
            <ul className="calendar">
              {upcoming.map((p) => (
                <li key={p.id} className={p.scheduled_for! < today ? "is-late" : undefined}>
                  <span className="tabular">{day(p.scheduled_for!)}{p.publish_status === "scheduled" && p.scheduled_at ? `, ${hour(p.scheduled_at)}` : ""}{p.publish_status !== "scheduled" && p.scheduled_for! < today ? " (en retard)" : ""}</span>
                  <span className={p.publish_status === "scheduled" ? "pill pill-lime" : p.publish_status === "failed" ? "pill pill-hot" : "pill"}>{p.publish_status === "scheduled" ? "Partira seul" : p.publish_status === "failed" ? "Échec" : "À publier à la main"}</span>
                  <span className="pill pill-cold">{PLATFORM[p.platform] ?? p.platform}</span>
                  <span className="muted">{p.author}</span>
                  <button type="button" className="calendar-text link-btn" aria-haspopup="dialog" onClick={() => open(p.id)}>{p.headline ?? p.primary_text.slice(0, 90)}</button>
                </li>
              ))}
            </ul>
          </section>
        ) : null
      }
      detail={(id) => {
        const found = byId.get(id);
        if (!found) return null;
        const { post, batch } = found;
        const instagram = batch.platform === "instagram";
        return <PostDetail post={post} platform={batch.platform} author={batch.author} assets={assets} connected={instagram && connected.instagram} facebook={instagram && connected.facebook} />;
      }}
    />
  );
}
