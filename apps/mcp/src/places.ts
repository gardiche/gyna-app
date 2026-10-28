import { chargedUsd } from "./linkedin-profiles.js";

/**
 * Recherche d'entreprises autour d'un lieu par l'acteur Apify compass/crawler-google-places (Google Maps), sans
 * cookies, sans ouvrir les fiches détaillées ni lire les avis. Réglages fixés ici : l'agent choisit quoi chercher
 * et où, pas comment, ce qui rend le coût prévisible.
 */
export const PLACES_ACTOR = "compass~crawler-google-places";
/** Estimation prudente par lieu rapporté, pour vérifier le budget avant de lancer (le coût réel est relevé après). */
export const USD_PER_PLACE = 0.01;
/** Plancher du coût déclaré par lieu : l'acteur facture à l'événement, que `usageTotalUsd` ne compte pas. */
const FLOOR_USD_PER_PLACE = 0.005;

export interface PlacesRequest {
  queries: string[];
  location: string;
  radiusKm: number;
  /** Nombre de lieux au plus par terme cherché. */
  perQuery: number;
}

export interface PlacesRun { items: unknown[]; costUsd: number; status: string }
export type PlacesRunner = (req: PlacesRequest) => Promise<PlacesRun>;

/** Position d'un lieu cherché (OpenStreetMap), pour borner la recherche à un rayon. null si introuvable. */
async function geocode(place: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`, {
      headers: { "user-agent": "gyna-sourcing/1.0 (alpact)" },
      signal: AbortSignal.timeout(10_000),
    });
    const [hit] = (await r.json()) as Array<{ lat: string; lon: string }>;
    const lat = Number(hit?.lat), lng = Number(hit?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

/** Lance l'acteur et attend ses résultats (cinq minutes au plus). */
export const runApifyPlaces: PlacesRunner = async (req) => {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN absent de l'environnement du serveur MCP.");
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const point = await geocode(req.location);
  const input = {
    searchStringsArray: req.queries,
    ...(point
      ? { customGeolocation: { type: "Point", coordinates: [point.lng, point.lat], radiusKm: req.radiusKm } }
      : { locationQuery: req.location }),
    maxCrawledPlacesPerSearch: req.perQuery,
    language: "fr",
    skipClosedPlaces: true,
    scrapePlaceDetailPage: false,
    scrapeContacts: false,
    maxReviews: 0,
    maxImages: 0,
  };
  const started = await fetch(`https://api.apify.com/v2/acts/${PLACES_ACTOR}/runs?waitForFinish=240`, {
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
  const limit = req.perQuery * req.queries.length;
  const items = await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&limit=${limit}`, { headers, signal: AbortSignal.timeout(60_000) })
    .then((r) => r.json() as Promise<unknown[]>)
    .catch(() => []);
  const list = Array.isArray(items) ? items : [];
  return { items: list, costUsd: Math.max(chargedUsd(run), Number(run?.usageTotalUsd ?? 0), list.length * FLOOR_USD_PER_PLACE), status: String(run.status) };
};

export interface PlaceRow {
  place_id: string;
  name: string;
  category: string | null;
  categories: string[];
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews_count: number | null;
  lat: number | null;
  lng: number | null;
  maps_url: string | null;
  search_term: string | null;
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Transforme un résultat de l'acteur en ligne à enregistrer. null s'il n'a ni identifiant ni nom, ou s'il est fermé. */
export function mapPlace(raw: any): PlaceRow | null | "closed" {
  const placeId = text(raw?.placeId, 200);
  const name = text(raw?.title, 300);
  if (!placeId || !name) return null;
  if (raw?.permanentlyClosed === true) return "closed";
  const rating = num(raw?.totalScore);
  return {
    place_id: placeId,
    name,
    category: text(raw?.categoryName, 120),
    categories: Array.isArray(raw?.categories) ? raw.categories.map((c: unknown) => text(c, 120)).filter((c: string | null): c is string => !!c).slice(0, 10) : [],
    address: text(raw?.address, 300),
    city: text(raw?.city, 120),
    postal_code: text(raw?.postalCode, 20),
    phone: text(raw?.phone ?? raw?.phoneUnformatted, 40),
    website: text(raw?.website, 300),
    rating: rating === null ? null : Math.round(Math.min(5, Math.max(0, rating)) * 10) / 10,
    reviews_count: num(raw?.reviewsCount) === null ? null : Math.round(raw.reviewsCount),
    lat: num(raw?.location?.lat),
    lng: num(raw?.location?.lng),
    maps_url: text(raw?.url, 500),
    search_term: text(raw?.searchString, 120),
  };
}
