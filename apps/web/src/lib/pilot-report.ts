import "server-only";
import { metaAccount, metaGraph, pilotGuardReady } from "./pilot";

export interface ReportAd {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  /** Résultats jour par jour de cette pub. */
  days: ReportDay[];
  /** Vidéo de la créative chez Meta, s'il y en a une. `source` est l'adresse du fichier, valable un temps limité. */
  video: ReportVideo | null;
}
export interface ReportVideo { id: string; source: string | null; thumbnail: string | null; link: string | null; seconds: number | null;
  /** Aperçu de la pub chez Meta (cadre intégré qui lit la vidéo), quand Meta ne donne pas le fichier. */
  preview: string | null }
export interface ReportDay { date: string; spend: number; impressions: number; clicks: number; leads: number }
export interface PilotReport {
  campaigns: Array<{ id: string; name: string; status: string; dailyBudget: number | null }>;
  /** Ce que le jeton voit du compte publicitaire : sans Page ni pixel, l'agent ne peut rien lancer. null = Meta a refusé la question. */
  access: { pages: string[] | null; pixels: Array<{ name: string; lastFired: string | null }> | null; instagram: string[] | null };
  ads: ReportAd[];
  days: ReportDay[];
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
}

/**
 * Pré-inscriptions comptées par Meta dans une ligne de résultats. L'événement Lead du pixel remonte sous plusieurs
 * noms selon les comptes : on prend le premier présent, sans les additionner (ce serait compter deux fois).
 */
function leadsOf(row: any): number {
  const actions: Array<{ action_type: string; value: string }> = row?.actions ?? [];
  for (const type of ["lead", "offsite_conversion.fb_pixel_lead", "onsite_web_lead"]) {
    const hit = actions.find((a) => a.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * Vidéos des créatives du compte publicitaire, par pub : l'identifiant de la vidéo dans la créative, puis sa source.
 * Lecture seule ; si Meta refuse (droits manquants), le suivi s'affiche sans vidéo.
 */
async function adVideos(act: string): Promise<{ videos: Map<string, ReportVideo>; thumbs: Map<string, string> }> {
  const videos = new Map<string, ReportVideo>();
  const thumbs = new Map<string, string>();
  try {
    const list: any = await metaGraph(`${act}/ads`, { fields: "creative{video_id,thumbnail_url,object_story_spec{video_data{video_id,image_url}}}", limit: "200" }, "GET");
    const byVideo = new Map<string, string[]>();
    for (const a of list.data ?? []) {
      const c = a.creative;
      const id: string | undefined = c?.video_id ?? c?.object_story_spec?.video_data?.video_id;
      if (c?.thumbnail_url) thumbs.set(a.id, c.thumbnail_url);
      if (id) byVideo.set(id, [...(byVideo.get(id) ?? []), a.id]);
    }
    if (!byVideo.size) return { videos, thumbs };
    const ids = [...byVideo.keys()];
    const info: any = await metaGraph("", { ids: ids.join(","), fields: "source,picture,permalink_url,length" }, "GET").catch(() => ({}));
    for (const [id, adIds] of byVideo) {
      const v = info[id];
      const video: ReportVideo = {
        id,
        source: v?.source ?? null,
        thumbnail: v?.picture ?? null,
        link: v?.permalink_url ? (String(v.permalink_url).startsWith("http") ? v.permalink_url : `https://www.facebook.com${v.permalink_url}`) : null,
        seconds: v?.length ? Math.round(Number(v.length)) : null,
        preview: null,
      };
      for (const adId of adIds) videos.set(adId, video);
    }
    // Meta ne donne presque jamais le fichier d'une vidéo de pub : son aperçu, lui, la lit.
    await Promise.all(
      [...videos].filter(([, v]) => !v.source).map(async ([adId, v]) => {
        try {
          const r: any = await metaGraph(`${adId}/previews`, { ad_format: "MOBILE_FEED_STANDARD" }, "GET");
          const src = /src="([^"]+)"/.exec(r.data?.[0]?.body ?? "")?.[1]?.replace(/&amp;/g, "&");
          if (src?.startsWith("https://")) videos.set(adId, { ...v, preview: src });
        } catch {
          /* pas d'aperçu : l'image et le lien restent */
        }
      }),
    );
  } catch {
    /* sans vidéo */
  }
  return { videos, thumbs };
}

/**
 * Ce que Meta rapporte pour le compte publicitaire entre deux dates (AAAA-MM-JJ) : campagnes, pubs, jours.
 * Lecture seule, faite par l'app elle-même, sans agent. null si le compte n'est pas relié.
 */
export async function pilotReport(since: string, until: string): Promise<PilotReport | { error: string } | null> {
  if (!pilotGuardReady()) return null;
  const act = `act_${metaAccount().account}`;
  const range = JSON.stringify({ since, until });
  const metrics = "spend,impressions,inline_link_clicks,actions";
  try {
    const [campaigns, adList, byAd, byDay, byAdDay] = await Promise.all([
      metaGraph(`${act}/campaigns`, { fields: "name,effective_status,daily_budget", limit: "50" }, "GET"),
      metaGraph(`${act}/ads`, { fields: "name,effective_status", limit: "200" }, "GET"),
      metaGraph(`${act}/insights`, { level: "ad", fields: `ad_id,${metrics}`, time_range: range, limit: "200" }, "GET"),
      metaGraph(`${act}/insights`, { fields: metrics, time_range: range, time_increment: "1", limit: "100" }, "GET"),
      // Jour par jour et pub par pub : un refus ici ne doit pas cacher le reste du suivi.
      metaGraph(`${act}/insights`, { level: "ad", fields: `ad_id,${metrics}`, time_range: range, time_increment: "1", limit: "500" }, "GET").catch(() => ({ data: [] })),
    ]);
    // Trois questions indépendantes : un refus sur l'une ne doit pas cacher les autres.
    const ask = (path: string, fields: string) => metaGraph(`${act}/${path}`, { fields, limit: "50" }, "GET").then((r: any) => (r.data ?? []) as any[]).catch(() => null);
    // Pages : celles que le jeton peut gérer avec le droit de publicité. La liste « promote_pages » du compte
    // publicitaire reste vide pour un utilisateur système, même quand il a tous les droits : on ne s'y fie qu'en second.
    const mine = metaGraph("me/accounts", { fields: "name,tasks,instagram_business_account{username}", limit: "50" }, "GET").then((r: any) => (r.data ?? []) as any[]).catch(() => null);
    const [owned, promotable, pixels, linkedToAccount] = await Promise.all([mine, ask("promote_pages", "name"), ask("adspixels", "name,last_fired_time"), ask("instagram_accounts", "username")]);
    const advertisable = owned?.filter((p) => !p.tasks || (p.tasks as string[]).includes("ADVERTISE")) ?? null;
    // Instagram : le compte rattaché au compte publicitaire, ou à défaut le compte professionnel relié à la Page,
    // que Meta accepte aussi comme identité des pubs.
    const viaPage = (advertisable ?? []).map((p) => p.instagram_business_account).filter(Boolean) as Array<{ username: string }>;
    const instagram = linkedToAccount?.length ? linkedToAccount : viaPage.length ? viaPage : linkedToAccount;
    const pages = advertisable?.length ? advertisable : promotable?.length ? promotable : advertisable ?? promotable;
    const stats = new Map<string, any>((byAd.data ?? []).map((r: any) => [r.ad_id, r]));
    const { videos, thumbs } = await adVideos(act);
    const perAd = new Map<string, ReportDay[]>();
    for (const r of byAdDay.data ?? []) perAd.set(r.ad_id, [...(perAd.get(r.ad_id) ?? []), { date: r.date_start, spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.inline_link_clicks), leads: leadsOf(r) }]);
    const ads: ReportAd[] = (adList.data ?? []).map((a: any) => {
      const s = stats.get(a.id);
      return { id: a.id, name: a.name, status: a.effective_status, spend: num(s?.spend), impressions: num(s?.impressions), clicks: num(s?.inline_link_clicks), leads: leadsOf(s), days: (perAd.get(a.id) ?? []).sort((x, y) => x.date.localeCompare(y.date)), video: videos.get(a.id) ? { ...videos.get(a.id)!, thumbnail: videos.get(a.id)!.thumbnail ?? thumbs.get(a.id) ?? null } : null };
    });
    const days: ReportDay[] = (byDay.data ?? []).map((r: any) => ({ date: r.date_start, spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.inline_link_clicks), leads: leadsOf(r) }));
    const sum = (k: "spend" | "impressions" | "clicks" | "leads") => days.reduce((n, d) => n + d[k], 0);
    return {
      // Meta exprime les budgets en centimes.
      campaigns: (campaigns.data ?? []).map((c: any) => ({ id: c.id, name: c.name, status: c.effective_status, dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null })),
      access: {
        pages: pages?.map((p) => p.name) ?? null,
        pixels: pixels?.map((p) => ({ name: p.name, lastFired: p.last_fired_time ?? null })) ?? null,
        instagram: instagram?.map((i) => i.username) ?? null,
      },
      ads: ads.sort((a, b) => b.spend - a.spend),
      days,
      spend: sum("spend"),
      impressions: sum("impressions"),
      clicks: sum("clicks"),
      leads: sum("leads"),
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
