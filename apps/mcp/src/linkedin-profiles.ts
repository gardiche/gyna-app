import { normalizeLinkedinUrl } from "@gyna/schemas";

/**
 * Lecture des profils complets et des publications récentes de prospects, par les acteurs Apify de HarvestAPI,
 * sans cookies. Réglages fixés ici : l'agent choisit quels prospects lire, pas comment les lire.
 */
export const PROFILE_ACTOR = "harvestapi~linkedin-profile-scraper";
export const POSTS_ACTOR = "harvestapi~linkedin-profile-posts";
/** 0,004 $ par profil complet. */
export const USD_PER_PROFILE = 0.004;
/** 0,002 $ par publication ; au plus MAX_POSTS par profil. */
export const USD_PER_POST = 0.002;
export const MAX_POSTS = 10;

export interface ActorRun { items: unknown[]; costUsd: number; status: string }

/** Prix des événements facturés par les acteurs de HarvestAPI (palier gratuit et Bronze, relevés le 16/10/2026). */
const EVENT_PRICE_USD: Record<string, number> = {
  "search-page": 0.1, profile: 0.004, profile_with_email: 0.01, post: 0.002, reaction: 0.002, comment: 0.002,
  "no-result": 0.001, "apify-actor-start": 0.00005, "short-profile": 0.002,
};

/**
 * Coût réel d'un lancement. Ces acteurs facturent à l'événement (une page de recherche, un profil, une publication) :
 * `usageTotalUsd` ne compte que la puissance de calcul, presque nulle, et sous-estimait les dépenses. On additionne
 * les événements facturés ; à défaut, la consommation déclarée.
 */
export function chargedUsd(run: any): number {
  const counts = (run?.chargedEventCounts ?? run?.accountedChargedEventCounts) as Record<string, number> | undefined;
  if (counts && Object.keys(counts).length) {
    return Object.entries(counts).reduce((sum, [event, n]) => sum + (EVENT_PRICE_USD[event] ?? 0) * Number(n || 0), 0);
  }
  return Number(run?.usageTotalUsd ?? 0);
}
export type ActorRunner = (actor: string, input: Record<string, unknown>, maxItems: number) => Promise<ActorRun>;

/** Lance un acteur et attend ses résultats (cinq minutes au plus). */
export const runApifyActor: ActorRunner = async (actor, input, maxItems) => {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN absent de l'environnement du serveur MCP.");
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const started = await fetch(`https://api.apify.com/v2/acts/${actor}/runs?waitForFinish=240`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(260_000),
  });
  if (!started.ok) throw new Error(`Apify a refusé le lancement (${started.status}) : ${(await started.text()).slice(0, 300)}`);
  let run = ((await started.json()) as { data: any }).data;
  for (let i = 0; i < 2 && ["READY", "RUNNING"].includes(run.status); i++) {
    const r = await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?waitForFinish=60`, { headers, signal: AbortSignal.timeout(75_000) });
    run = ((await r.json()) as { data: any }).data;
  }
  const items = await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&limit=${maxItems}`, { headers, signal: AbortSignal.timeout(60_000) })
    .then((r) => r.json() as Promise<unknown[]>)
    .catch(() => []);
  return { items: Array.isArray(items) ? items : [], costUsd: chargedUsd(run), status: String(run.status) };
};

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** Intitulés qui désignent une personne à son compte ou à la tête de sa propre structure. */
const FOUNDER_WORDS = ["fondat", "founder", "co-fond", "cofond", "ceo", "dirigeant", "gérant", "gerant", "président", "president", "owner", "propriétaire", "entrepreneur", "créateur", "créatrice", "createur", "auto-entrepreneur", "freelance", "indépendant", "independant", "porteur de projet", "porteuse de projet"];

const isFounderTitle = (title: string) => FOUNDER_WORDS.some((w) => title.toLowerCase().includes(w));

function dateOf(d: any): Date | null {
  const year = Number(d?.year);
  if (!year) return null;
  const month = MONTHS[String(d?.month ?? "").slice(0, 3).toLowerCase()] ?? 1;
  return new Date(Date.UTC(year, month - 1, 1));
}
const isCurrent = (e: any) => !e?.endDate || /present|aujourd|today/i.test(String(e?.endDate?.text ?? ""));
const monthsSince = (d: Date, now: Date) => (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + (now.getUTCMonth() - d.getUTCMonth());

export interface ProfileFacts {
  /** Mois depuis le début du plus ancien poste en cours de fondateur, dirigeant ou indépendant ; null s'il n'y en a pas. */
  founder_months: number | null;
  founder_title: string | null;
  founder_company: string | null;
  /** Postes salariés en cours à côté (intitulés). */
  current_jobs: string[];
  /** Années depuis la première expérience datée. */
  career_years: number | null;
  open_to_work: boolean;
}

/** Faits tirés du profil par le code, sans interprétation. */
export function profileFacts(raw: any, now = new Date()): ProfileFacts {
  const exp: any[] = Array.isArray(raw?.experience) ? raw.experience : [];
  const current = exp.filter(isCurrent);
  const founder = current
    .filter((e) => isFounderTitle(String(e?.position ?? e?.title ?? "")))
    .map((e) => ({ e, start: dateOf(e?.startDate) }))
    .sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity))[0];
  const firstStart = exp.map((e) => dateOf(e?.startDate)).filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0];
  return {
    founder_months: founder?.start ? monthsSince(founder.start, now) : null,
    founder_title: founder ? String(founder.e?.position ?? founder.e?.title ?? "") || null : null,
    founder_company: founder ? String(founder.e?.companyName ?? "") || null : null,
    current_jobs: current.filter((e) => !isFounderTitle(String(e?.position ?? e?.title ?? ""))).map((e) => `${e?.position ?? e?.title ?? "?"} chez ${e?.companyName ?? "?"}`).slice(0, 4),
    career_years: firstStart ? Math.floor(monthsSince(firstStart, now) / 12) : null,
    open_to_work: Boolean(raw?.openToWork),
  };
}

const cut = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

/** Ce qu'on garde d'un profil complet, en base et pour l'agent : l'essentiel, sans photos ni compétences. */
export function profileSummary(raw: any) {
  const exp: any[] = Array.isArray(raw?.experience) ? raw.experience : [];
  return {
    headline: cut(raw?.headline, 300),
    about: cut(raw?.about, 1200),
    location: cut(raw?.location?.linkedinText, 200),
    experience: exp.slice(0, 8).map((e) => ({
      title: cut(e?.position ?? e?.title, 200),
      company: cut(e?.companyName, 200),
      start: cut(e?.startDate?.text, 40),
      end: cut(e?.endDate?.text, 40),
      type: cut(e?.employmentType, 40),
      description: cut(e?.description, 300),
    })),
  };
}

/** Clé LinkedIn d'un résultat d'acteur (profil ou auteur de publication). */
export function keyOf(raw: any): string | null {
  const url = raw?.linkedinUrl ?? raw?.url ?? (raw?.publicIdentifier ? `https://www.linkedin.com/in/${raw.publicIdentifier}` : null);
  return typeof url === "string" ? normalizeLinkedinUrl(url) : null;
}

export interface PostSummary { url: string; date: string; text: string; kind: string }

/** Publication réduite à ce qui sert à juger : lien, date, texte. null si l'un manque. */
export function postSummary(raw: any): PostSummary | null {
  const url = cut(raw?.linkedinUrl, 500);
  const date = cut(raw?.postedAt?.date, 40);
  const text = cut(raw?.content, 900);
  if (!url || !date || !text) return null;
  return { url, date, text, kind: String(raw?.type ?? "post") };
}

/** Adresse publique (avec l'identifiant lisible) d'un profil lu, si l'acteur la donne. */
export function publicUrlOf(raw: any): string | null {
  const id = typeof raw?.publicIdentifier === "string" ? raw.publicIdentifier.trim() : "";
  if (id && !/^AC[a-zA-Z0-9_-]{20,}$/.test(id)) return `https://www.linkedin.com/in/${id}`;
  return null;
}

const plain = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Associe chaque prospect demandé au profil lu. La recherche rend souvent une adresse interne (« ACwAA… ») et la
 * lecture du profil une adresse publique : on essaie l'adresse, puis toute valeur du résultat qui reprend l'adresse
 * demandée, puis le nom, unique dans le lot.
 */
export function matchProfiles<R extends { id: string; linkedin_url: string; full_name: string }>(rows: R[], items: unknown[]): Map<string, any> {
  const out = new Map<string, any>();
  const used = new Set<any>();
  const take = (row: R, item: any) => { out.set(row.id, item); used.add(item); };
  for (const row of rows) {
    const key = normalizeLinkedinUrl(row.linkedin_url);
    const tail = key?.split("/in/")[1] ?? "";
    const hit = (items as any[]).find((it) => !used.has(it) && (keyOf(it) === key || Object.values(it ?? {}).some((v) => typeof v === "string" && tail.length > 5 && v.toLowerCase().includes(tail))));
    if (hit) take(row, hit);
  }
  for (const row of rows) {
    if (out.has(row.id)) continue;
    const name = plain(row.full_name);
    const same = (items as any[]).filter((it) => !used.has(it) && plain([it?.firstName, it?.lastName].filter(Boolean).join(" ") || it?.fullName || it?.name) === name);
    if (name && same.length === 1) take(row, same[0]);
  }
  return out;
}
