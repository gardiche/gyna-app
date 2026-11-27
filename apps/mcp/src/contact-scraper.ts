import { runApifyActor, type ActorRunner } from "./linkedin-profiles.js";
import { filterEmails, safeSiteUrl, siteHost } from "./email-finder.js";

/**
 * Lecture approfondie des sites d'entreprises par l'acteur Apify vdrmota/contact-info-scraper, avec un vrai navigateur :
 * elle lit les sites construits par scripts (Wix, Squarespace…) que la lecture simple voit vides. Sans cookies.
 * Payante : elle ne se lance que si on la demande, et le budget de la mission est vérifié avant.
 * Réglages fixés ici : quelques pages par site, le même domaine seulement, pas d'enrichissement de personnes.
 */
export const CONTACT_ACTOR = "vdrmota~contact-info-scraper";
/** Pages lues au plus par site (accueil et liens directs). */
export const DEEP_PAGES_PER_SITE = 4;
/** Page lue avec un navigateur : 0,002 $ + 0,003 $ (palier gratuit, relevé le 26/11/2026). */
export const USD_PER_DEEP_PAGE = 0.005;
/** Estimation prudente par site, pour vérifier le budget avant de lancer. */
export const USD_PER_DEEP_SITE = DEEP_PAGES_PER_SITE * USD_PER_DEEP_PAGE + 0.001;

export interface DeepFinding { email: string; source: string; others: string[] }
export interface DeepRun { found: Map<string, DeepFinding>; costUsd: number; status: string; pages: number }

/**
 * Lit les sites donnés et rend, par site (clé : l'adresse donnée en entrée), la meilleure adresse publiée et la page
 * où elle figure. Les adresses passent par le même filtre que la lecture simple (domaine du site ou messagerie
 * grand public) : une adresse d'agence ou de partenaire n'est pas gardée.
 */
export async function deepFindEmails(websites: string[], run: ActorRunner = runApifyActor): Promise<DeepRun> {
  const starts = new Map<string, string>(); // host -> adresse donnée
  for (const w of websites) {
    const u = safeSiteUrl(w);
    if (u && !starts.has(siteHost(u))) starts.set(siteHost(u), w);
  }
  if (!starts.size) return { found: new Map(), costUsd: 0, status: "SKIPPED", pages: 0 };
  const result = await run(CONTACT_ACTOR, {
    startUrls: [...starts.values()].map((w) => ({ url: safeSiteUrl(w)!.toString() })),
    maxRequestsPerStartUrl: DEEP_PAGES_PER_SITE,
    maxDepth: 1,
    maxRequests: DEEP_PAGES_PER_SITE * starts.size,
    sameDomain: true,
    mergeContacts: false,
    considerChildFrames: false,
    useBrowser: true,
    waitUntil: "domcontentloaded",
    maximumLeadsEnrichmentRecords: 0,
    proxyConfig: { useApifyProxy: true },
  }, DEEP_PAGES_PER_SITE * starts.size + 10);

  // Une ligne par page lue : on regroupe par site, la page d'où vient chaque adresse sert de source.
  const perSite = new Map<string, Array<{ email: string; page: string }>>();
  for (const item of result.items as any[]) {
    const origin = safeSiteUrl(String(item?.originalStartUrl ?? item?.url ?? ""));
    if (!origin) continue;
    const host = siteHost(origin);
    if (!starts.has(host)) continue;
    const page = typeof item?.url === "string" ? item.url : origin.toString();
    const pageHost = safeSiteUrl(page) ? siteHost(safeSiteUrl(page)!) : host;
    const kept = filterEmails(Array.isArray(item?.emails) ? item.emails.map(String) : [], [host, pageHost]);
    const list = perSite.get(host) ?? [];
    for (const email of kept) if (!list.some((x) => x.email === email)) list.push({ email, page });
    perSite.set(host, list);
  }
  const found = new Map<string, DeepFinding>();
  for (const [host, list] of perSite) {
    const order = filterEmails(list.map((x) => x.email), [host]);
    if (!order.length) continue;
    const best = list.find((x) => x.email === order[0])!;
    found.set(starts.get(host)!, { email: best.email, source: best.page, others: order.slice(1, 4) });
  }
  // L'acteur facture à l'événement : le coût relevé peut être incomplet, on compte au moins chaque page lue.
  const costUsd = Math.max(result.costUsd, result.items.length * USD_PER_DEEP_PAGE + 0.001);
  return { found, costUsd, status: result.status, pages: result.items.length };
}
