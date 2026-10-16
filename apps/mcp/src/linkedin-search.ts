import { normalizeLinkedinUrl, type ProspectInput } from "@gyna/schemas";
import { LINKEDIN_INDUSTRIES } from "./industries.js";

/**
 * Recherche de profils LinkedIn publics par l'acteur Apify harvestapi/linkedin-profile-search, sans cookies,
 * en mode court (titre, lieu, entreprise, sans ouvrir les profils). Les réglages sont fixés ici, pas par l'agent :
 * c'est ce qui rend le sourcing prévisible en coût comme en volume.
 */
export const SEARCH_ACTOR = "harvestapi~linkedin-profile-search";
/** Prix de l'acteur en mode court : 0,10 $ par page de 25 résultats. */
export const USD_PER_PAGE = 0.1;
export const PAGE_SIZE = 25;
/** Conversion prudente (le dollar ne vaut pas plus que l'euro) pour vérifier le budget avant de lancer. */
export const USD_TO_EUR = 1;

export interface SearchRequest {
  titles: string[];
  locations: string[];
  maxItems: number;
  /** Moins d'un an dans l'entreprise actuelle (filtre de LinkedIn). */
  recentOnly: boolean;
  /** Codes de taille d'entreprise de LinkedIn (A = indépendant, B = 1-10, C = 11-50…) ; vide = toutes. */
  companySizes: string[];
  /** Identifiants de secteur de LinkedIn ; vide = tous. */
  industryIds: string[];
  keywords?: string;
}

export interface SearchRun {
  items: unknown[];
  costUsd: number;
  status: string;
}

export type SearchRunner = (req: SearchRequest) => Promise<SearchRun>;

/** Lance l'acteur et attend ses résultats (cinq minutes au plus). */
export const runApifySearch: SearchRunner = async (req) => {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN absent de l'environnement du serveur MCP.");
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const input = {
    profileScraperMode: "Short",
    currentJobTitles: req.titles,
    locations: req.locations,
    maxItems: req.maxItems,
    takePages: Math.ceil(req.maxItems / PAGE_SIZE),
    ...(req.recentOnly ? { yearsAtCurrentCompanyIds: ["1"] } : {}),
    ...(req.companySizes.length ? { companyHeadcount: req.companySizes } : {}),
    ...(req.industryIds.length ? { industryIds: req.industryIds } : {}),
    ...(req.keywords ? { searchQuery: req.keywords } : {}),
  };
  const started = await fetch(`https://api.apify.com/v2/acts/${SEARCH_ACTOR}/runs?waitForFinish=240`, {
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
  const items = await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&limit=${req.maxItems}`, { headers, signal: AbortSignal.timeout(60_000) })
    .then((r) => r.json() as Promise<unknown[]>)
    .catch(() => []);
  return { items: Array.isArray(items) ? items : [], costUsd: Number(run.usageTotalUsd ?? 0), status: String(run.status) };
};

/** Secteurs de LinkedIn dont le nom ou la place dans l'arborescence contient tous les mots cherchés (en anglais). */
export function findIndustries(query: string, limit = 20): Array<{ id: number; label: string; hierarchy: string }> {
  const words = query.toLowerCase().split(" ").map((w) => w.trim()).filter(Boolean);
  return LINKEDIN_INDUSTRIES.filter(([, , h]) => words.every((w) => h.toLowerCase().includes(w)))
    .slice(0, limit)
    .map(([id, label, hierarchy]) => ({ id, label, hierarchy }));
}

/**
 * Noms ou identifiants de secteur → identifiants à filtrer, sous-secteurs compris (« Food and Beverage Services »
 * emporte « Restaurants », « Bars, Taverns, and Nightclubs »…). Les noms inconnus sont rendus à part.
 */
export function resolveIndustries(names: readonly string[] | undefined): { ids: string[]; labels: string[]; unknown: string[] } {
  const ids = new Set<number>();
  const labels: string[] = [];
  const unknown: string[] = [];
  for (const raw of names ?? []) {
    const name = raw.trim().toLowerCase();
    const hit = LINKEDIN_INDUSTRIES.find(([id, label]) => String(id) === name || label.toLowerCase() === name);
    if (!hit) { unknown.push(raw); continue; }
    labels.push(hit[1]);
    for (const [id, , h] of LINKEDIN_INDUSTRIES) if (id === hit[0] || h.startsWith(`${hit[2]} > `)) ids.add(id);
  }
  return { ids: [...ids].map(String), labels, unknown };
}

/** Tailles lisibles → codes de l'acteur. */
const SIZE_CODES: Record<string, string[]> = {
  independant: ["A"], "1-10": ["B"], "11-50": ["C"], "51-200": ["D"], "201-500": ["E"], "501-1000": ["F"], "1001+": ["G", "H", "I"],
};
export function sizeCodes(sizes: readonly string[] | undefined, small: boolean): string[] {
  const all = [...(sizes ?? []), ...(small ? ["independant", "1-10"] : [])];
  return [...new Set(all.flatMap((s) => SIZE_CODES[s] ?? []))];
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/**
 * Transforme un résultat de l'acteur en profil à enregistrer. Les champs varient selon le mode et les versions de
 * l'acteur : on lit plusieurs formes possibles. null si le profil n'a ni adresse LinkedIn valide ni nom.
 */
export function mapProfile(raw: any, segment?: string): ProspectInput | null {
  const url = text(raw?.linkedinUrl, 300) ?? text(raw?.profileUrl, 300) ?? (raw?.publicIdentifier ? `https://www.linkedin.com/in/${raw.publicIdentifier}` : undefined);
  if (!url || !normalizeLinkedinUrl(url)) return null;
  const name = text([raw?.firstName, raw?.lastName].filter(Boolean).join(" "), 200) ?? text(raw?.fullName, 200) ?? text(raw?.name, 200);
  if (!name) return null;
  const position = Array.isArray(raw?.currentPosition) ? raw.currentPosition[0] : Array.isArray(raw?.currentPositions) ? raw.currentPositions[0] : raw?.currentPosition;
  const headline = text(raw?.headline, 300) ?? text(position?.title ?? position?.position, 300);
  const location = text(raw?.location?.linkedinText, 200) ?? text(raw?.location?.parsed?.text, 200) ?? text(raw?.location, 200);
  const company = text(position?.companyName, 200);
  return { linkedin_url: url, full_name: name, ...(headline ? { headline } : {}), ...(location ? { location } : {}), ...(company ? { company } : {}), ...(segment ? { segment } : {}) };
}
