import type { SupabaseClient } from "@supabase/supabase-js";
import { FIT, HEAT, PROSPECT_STATUS } from "@gyna/schemas";

/** Filtres de la page Prospects, repris tels quels par l'export CSV. */
export type ProspectFilters = { venture?: string; heat?: string; status?: string; fit?: string; q?: string; from?: string; to?: string };

export const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const PROSPECTS_PAGE_LIMIT = 300;
export const PROSPECTS_EXPORT_LIMIT = 5000;

/** Minuit à Paris du jour donné (AAAA-MM-JJ), pour filtrer sur des journées telles que les associés les vivent. */
export function parisMidnight(day: string): Date {
  const utc = new Date(`${day}T00:00:00Z`);
  const shift = new Date(utc.toLocaleString("en-US", { timeZone: "Europe/Paris" })).getTime() - new Date(utc.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(utc.getTime() - shift);
}

/** Bornes de dates valides parmi les filtres (chaîne vide sinon). */
export function dayRange(sp: ProspectFilters) {
  return { from: sp.from && DAY.test(sp.from) ? sp.from : "", to: sp.to && DAY.test(sp.to) ? sp.to : "" };
}

/** Requête des prospects avec les filtres de la page ; l'appelant choisit la limite. */
export function prospectsQuery(db: SupabaseClient, sp: ProspectFilters, limit: number) {
  let q = db
    .from("prospect_ventures")
    .select("id, status, heat, heat_reason, fit, fit_reason, discarded_reason, brevo_synced_at, created_at, updated_at, ventures!inner(slug, name), prospects!inner(id, full_name, headline, location, linkedin_url, email)")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (sp.venture) q = q.eq("ventures.slug", sp.venture);
  if (sp.heat && (HEAT as readonly string[]).includes(sp.heat)) q = q.eq("heat", sp.heat);
  if (sp.fit === "none") q = q.is("fit", null);
  else if (sp.fit && (FIT as readonly string[]).includes(sp.fit)) q = q.eq("fit", sp.fit);
  if (sp.status === "all") {
    // Écartés compris, pour un export complet d'un tri.
  } else if (sp.status && (PROSPECT_STATUS as readonly string[]).includes(sp.status)) q = q.eq("status", sp.status);
  else q = q.neq("status", "discarded");
  if (sp.q) q = q.ilike("prospects.full_name", `%${sp.q.replace(/[%_]/g, "")}%`);
  const { from, to } = dayRange(sp);
  if (from) q = q.gte("created_at", parisMidnight(from).toISOString());
  if (to) q = q.lt("created_at", new Date(parisMidnight(to).getTime() + 86_400_000).toISOString());
  return q;
}

export const LINEN_LABEL: Record<string, string> = { fort: "Potentiel fort", possible: "Potentiel possible", faible: "Potentiel faible", ecarte: "Écartée" };
const linenOrder: Record<string, number> = { fort: 0, possible: 1, faible: 2, ecarte: 3 };

/**
 * Entreprises trouvées autour d'un lieu (ventures dont la cible est un établissement), avec les filtres de la page
 * qui ont un sens pour elles : venture, nom, dates, et statut (« écartée » = potentiel écarté). Adéquation et chaleur
 * ne s'appliquent qu'aux personnes : si l'un de ces filtres est posé, aucune entreprise n'est renvoyée.
 * La RLS décide de ce que chacun voit (les invités de suivi des campagnes n'y ont pas accès).
 */
export function companiesQuery(db: SupabaseClient, sp: ProspectFilters, limit: number) {
  let q = db
    .from("companies")
    .select("id, name, category, address, city, postal_code, phone, website, rating, reviews_count, maps_url, linen_potential, linen_reason, email, brevo_synced_at, created_at, ventures!inner(slug, name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sp.venture) q = q.eq("ventures.slug", sp.venture);
  if (sp.status === "all") {
    // Écartées comprises.
  } else if (sp.status === "discarded") q = q.eq("linen_potential", "ecarte");
  else q = q.or("linen_potential.is.null,linen_potential.neq.ecarte");
  if (sp.q) q = q.ilike("name", `%${sp.q.replace(/[%_,()]/g, "")}%`);
  const { from, to } = dayRange(sp);
  if (from) q = q.gte("created_at", parisMidnight(from).toISOString());
  if (to) q = q.lt("created_at", new Date(parisMidnight(to).getTime() + 86_400_000).toISOString());
  return q;
}

/** Les filtres d'adéquation, de chaleur ou un statut propre aux personnes excluent les entreprises. */
export function includesCompanies(sp: ProspectFilters): boolean {
  if (sp.fit || sp.heat) return false;
  return !sp.status || sp.status === "all" || sp.status === "discarded";
}

/** Le plus prometteur d'abord (fort, possible, faible, non jugé, écarté), puis la mieux notée. */
export function sortCompanies<T extends { linen_potential: string | null; rating: number | null }>(rows: T[]): T[] {
  const rank = (p: string | null) => (p ? linenOrder[p] ?? 3 : 2.5);
  return rows.slice().sort((a, b) => rank(a.linen_potential) - rank(b.linen_potential) || (b.rating ?? 0) - (a.rating ?? 0));
}

const heatOrder: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
const fitOrder: Record<string, number> = { A: 0, B: 1, C: 2 };

/** Les mieux placés d'abord : adéquation (A, B, C, non trié), puis chaleur. */
export function sortProspects<T extends { fit: string | null; heat: string | null }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => (fitOrder[a.fit ?? ""] ?? 3) - (fitOrder[b.fit ?? ""] ?? 3) || (heatOrder[a.heat ?? ""] ?? 3) - (heatOrder[b.heat ?? ""] ?? 3));
}
