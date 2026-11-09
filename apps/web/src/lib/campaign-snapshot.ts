import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parisNow } from "./pilot";
import { pilotReport, type ReportAd } from "./pilot-report";

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const ratio = (a: number, b: number, d = 2) => (b > 0 ? round(a / b, d) : null);

interface Line { spend: number; impressions: number; clicks: number; leads: number }
/** Les mesures d'un groupe de pubs, avec le taux de clic et les coûts calculés (null quand il n'y a rien à diviser). */
function measures(l: Line) {
  return {
    spend_eur: round(l.spend),
    impressions: l.impressions,
    link_clicks: l.clicks,
    ctr_pct: ratio(l.clicks * 100, l.impressions),
    cost_per_click_eur: ratio(l.spend, l.clicks),
    leads: l.leads,
    cost_per_lead_eur: ratio(l.spend, l.leads),
  };
}

/**
 * Photo d'une campagne Meta pour un agent : ce que la page Campagnes affiche, en un seul appel, sans que l'agent ait
 * à enchaîner les lectures chez Meta. Lecture seule. Rend l'enveloppe de pilotage, le total, puis le détail par ensemble
 * de pubs, par pub et par jour. Les liens, les statuts de validation et les placements n'y sont pas.
 */
export async function campaignSnapshot(db: SupabaseClient, ventureId: string) {
  const { data: pilot } = await db
    .from("ad_pilots")
    .select("status, total_budget_eur, target_cost_eur, starts_on, ends_on")
    .eq("venture_id", ventureId)
    .eq("platform", "meta")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pilot) return { error: "Aucune enveloppe de pilotage Meta pour cette venture : rien à photographier." };
  const { day } = parisNow();
  const until = day < pilot.ends_on ? day : pilot.ends_on;
  const report = await pilotReport(pilot.starts_on, until);
  if (!report) return { error: "Le compte publicitaire n'est pas relié à l'app (META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID absent de Vercel)." };
  if ("error" in report) return { error: `Meta a refusé la lecture : ${report.error}` };

  const budget = Number(pilot.total_budget_eur);
  const daysLeft = Math.max(0, Math.round((Date.parse(pilot.ends_on) - Date.parse(day)) / 86_400_000) + 1);
  const byAdset = new Map<string, { line: Line; ads: ReportAd[] }>();
  for (const a of report.ads) {
    const key = a.adset ?? "(sans ensemble)";
    const g = byAdset.get(key) ?? { line: { spend: 0, impressions: 0, clicks: 0, leads: 0 }, ads: [] };
    g.line.spend += a.spend;
    g.line.impressions += a.impressions;
    g.line.clicks += a.clicks;
    g.line.leads += a.leads;
    g.ads.push(a);
    byAdset.set(key, g);
  }
  const today = report.days[report.days.length - 1];
  return {
    as_of: day,
    envelope: {
      status: pilot.status,
      budget_eur: budget,
      spent_eur: round(report.spend),
      remaining_eur: round(budget - report.spend),
      starts_on: pilot.starts_on,
      ends_on: pilot.ends_on,
      days_left_including_today: daysLeft,
      target_cost_per_signup_eur: pilot.target_cost_eur === null ? null : Number(pilot.target_cost_eur),
    },
    total: measures(report),
    by_adset: [...byAdset.entries()]
      .map(([name, g]) => ({
        adset: name,
        ...measures(g.line),
        ads_total: g.ads.length,
        ads_with_impressions: g.ads.filter((a) => a.impressions > 0).length,
      }))
      .sort((a, b) => b.spend_eur - a.spend_eur),
    by_ad: report.ads.map((a) => ({
      id: a.id,
      name: a.name,
      adset: a.adset ?? null,
      status: a.status,
      ...measures(a),
      last_3_days: a.days.slice(-3).map((d) => ({ date: d.date, spend_eur: round(d.spend), impressions: d.impressions, link_clicks: d.clicks, leads: d.leads })),
    })),
    by_day: report.days.map((d) => ({ date: d.date, spend_eur: round(d.spend), impressions: d.impressions, link_clicks: d.clicks, leads: d.leads })),
    today: today ? { date: today.date, spend_eur: round(today.spend), impressions: today.impressions, link_clicks: today.clicks, leads: today.leads } : null,
    campaigns: report.campaigns,
    pixels: report.access.pixels,
    not_included:
      "Les liens de destination, les statuts de validation, les placements (Facebook, Instagram…) et le parcours sur le site (PostHog) : à lire séparément, seulement si l'analyse en a besoin. Un lead est celui que compte le pixel de Meta, pas forcément une pré-inscription reçue.",
  };
}
