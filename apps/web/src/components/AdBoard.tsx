"use client";
import type { AdPlatform } from "@gyna/schemas";
import { CreativeBoard, type BoardBatch, type Tile } from "./CreativeBoard";
import { AdDetail, AD_FORMAT, type AdRow } from "./AdDetail";
import type { Asset } from "./AssetLibrary";
import type { PreviewBrand } from "./AdPreview";

export interface AdBatch {
  id: string;
  title: string;
  platform: AdPlatform;
  objective: string | null;
  audience: string | null;
  rationale: string;
  /** Date du lot, déjà mise en forme. */
  date: string;
  ads: AdRow[];
}

const PLATFORM: Record<string, string> = { meta: "Meta", linkedin: "LinkedIn", google: "Google", tiktok: "TikTok", other: "Autre" };
const META: Record<string, string> = { paused: "En pause chez Meta", stopped: "Arrêtée chez Meta" };
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
/** Premier paragraphe d'un texte, coupé pour tenir sur la carte. */
const lead = (text: string, max = 160) => {
  const first = text.trim().split(/\n\s*\n/)[0] ?? "";
  return first.length > max ? `${first.slice(0, max).trimEnd()}…` : first;
};

function tile(ad: AdRow, platform: string): Tile {
  const live = ad.status === "approved" && ad.external_status === "active";
  const [state, label, tone] =
    ad.status === "rejected" ? (["rejected", "Refusée", "plain"] as const)
    : ad.status === "pending" ? (["pending", "À choisir", "warm"] as const)
    : live ? (["live", "En diffusion", "live"] as const)
    : (["approved", "Approuvée", "lime"] as const);
  // Un carrousel montre sa couverture ; les autres diapositives se voient dans le détail.
  const carousel = (ad.slides?.length ?? 0) > 1;
  const image = (ad.ad_images ?? []).filter((im) => !carousel || (im.slide ?? 0) === 0).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.url ?? null;
  const format = ad.format ? AD_FORMAT[ad.format] ?? ad.format : null;
  return {
    id: ad.id,
    state,
    label,
    tone,
    image,
    hook: ad.slides?.[0]?.text ?? lead(ad.primary_text),
    // Sans visuel, l'accroche est déjà en grand sur la carte : l'angle sert alors de titre.
    title: ad.headline ?? (image ? lead(ad.primary_text, 90) : ad.angle),
    meta: [ad.headline || image ? ad.angle : null, format].filter(Boolean).join(" · "),
    slides: ad.slides?.length ?? 0,
    note: ad.status === "approved" && ad.external_status ? META[ad.external_status] ?? null : null,
    tags: [
      { text: ad.angle, tone: "lavender" },
      { text: PLATFORM[platform] ?? platform, tone: "cold" },
      ...(format ? [{ text: format }] : []),
      ...(ad.template ? [{ text: ad.template }] : []),
    ],
  };
}

/** Les pubs de la venture en grille, lot par lot ; chacune s'ouvre dans le panneau de détail pour être relue, corrigée et décidée. */
export function AdBoard({ batches, assets, readOnly = false, brand }: { batches: AdBatch[]; assets: Asset[]; readOnly?: boolean; brand?: PreviewBrand }) {
  const byId = new Map(batches.flatMap((b) => b.ads.map((a) => [a.id, { ad: a, platform: b.platform }] as const)));
  const board = batches.map((b): BoardBatch => {
    const left = b.ads.filter((a) => a.status === "pending").length;
    return {
      id: b.id,
      title: b.title,
      date: b.date,
      tags: [
        { text: PLATFORM[b.platform] ?? b.platform, tone: "cold" },
        left ? { text: plural(left, "pub à choisir", "pubs à choisir"), tone: "warm" } : { text: "Lot traité", tone: "lime" },
      ],
      why: {
        label: "Pourquoi ces angles",
        rows: [
          ...(b.objective ? [["Objectif", b.objective] as [string, string]] : []),
          ...(b.audience ? [["Public", b.audience] as [string, string]] : []),
          ["Angles", b.rationale],
        ],
      },
      tiles: b.ads.map((a) => tile(a, b.platform)),
    };
  });

  return (
    <CreativeBoard
      noun="pub"
      batches={board}
      filters={[
        { key: "pending", label: "À choisir" },
        { key: "approved", label: "Approuvées" },
        { key: "live", label: "En diffusion" },
        { key: "rejected", label: "Refusées" },
      ]}
      detail={(id) => {
        const found = byId.get(id);
        return found ? <AdDetail ad={found.ad} platform={found.platform} assets={assets} readOnly={readOnly} brand={brand} /> : null;
      }}
    />
  );
}
