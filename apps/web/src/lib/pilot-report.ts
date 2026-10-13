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
}
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
 * Ce que Meta rapporte pour le compte publicitaire entre deux dates (AAAA-MM-JJ) : campagnes, pubs, jours.
 * Lecture seule, faite par l'app elle-même, sans agent. null si le compte n'est pas relié.
 */
export async function pilotReport(since: string, until: string): Promise<PilotReport | { error: string } | null> {
  if (!pilotGuardReady()) return null;
  const act = `act_${metaAccount().account}`;
  const range = JSON.stringify({ since, until });
  const metrics = "spend,impressions,inline_link_clicks,actions";
  try {
    const [campaigns, adList, byAd, byDay] = await Promise.all([
      metaGraph(`${act}/campaigns`, { fields: "name,effective_status,daily_budget", limit: "50" }, "GET"),
      metaGraph(`${act}/ads`, { fields: "name,effective_status", limit: "200" }, "GET"),
      metaGraph(`${act}/insights`, { level: "ad", fields: `ad_id,${metrics}`, time_range: range, limit: "200" }, "GET"),
      metaGraph(`${act}/insights`, { fields: metrics, time_range: range, time_increment: "1", limit: "100" }, "GET"),
    ]);
    // Trois questions indépendantes : un refus sur l'une ne doit pas cacher les autres.
    const ask = (path: string, fields: string) => metaGraph(`${act}/${path}`, { fields, limit: "50" }, "GET").then((r: any) => (r.data ?? []) as any[]).catch(() => null);
    const [pages, pixels, instagram] = await Promise.all([ask("promote_pages", "name"), ask("adspixels", "name,last_fired_time"), ask("instagram_accounts", "username")]);
    const stats = new Map<string, any>((byAd.data ?? []).map((r: any) => [r.ad_id, r]));
    const ads: ReportAd[] = (adList.data ?? []).map((a: any) => {
      const s = stats.get(a.id);
      return { id: a.id, name: a.name, status: a.effective_status, spend: num(s?.spend), impressions: num(s?.impressions), clicks: num(s?.inline_link_clicks), leads: leadsOf(s) };
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
