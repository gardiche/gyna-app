/** Libellés des champs détaillés d'une ligne du journal : consigne et compte rendu des sous-agents, paramètres d'une recherche, fiches. */
export const DETAIL_LABEL: Record<string, string> = {
  goal: "Tâche", context: "Consigne de Gyna", summary: "Compte rendu", status: "Statut",
  titles: "Intitulés cherchés", locations: "Lieux", max_profiles: "Nombre demandé", recent_only: "Moins d'un an dans le poste",
  small_companies: "Petites entreprises", company_sizes: "Tailles d'entreprise", industries: "Secteurs", keywords: "Mots-clés",
  segment: "Segment", queries: "Termes cherchés", location: "Lieu", radius_km: "Rayon (km)",
  list: "Liste", name: "Nom", purpose: "Usage", scale: "Échelle", added: "Ajoutés", updated: "Mis à jour", unknown: "Inconnus",
  task: "Tâche", objective: "Objectif", background: "Contexte retenu", criteria: "Critères de l'associé", exclusions: "Exclusions",
  scope: "Périmètre", deliverable: "Livrable attendu", budget_eur: "Budget (€)", understood: "Ce que l'agent a compris", counts: "Chiffres",
};

export const AGENT_LABEL: Record<string, string> = {
  gyna: "Gyna", sourcing: "Sourcing", qualification: "Qualification", redaction: "Rédaction", veille: "Veille", ads: "Ads", campagnes: "Campagnes", associe: "Associé", system: "Système",
};

/** Les champs lisibles d'un `actions.input`, prêts à afficher (liste d'étiquette et de valeur). */
export function details(input: unknown): Array<[string, string]> {
  if (!input || typeof input !== "object") return [];
  return Object.entries(input as Record<string, unknown>)
    .filter(([k, v]) => DETAIL_LABEL[k] && v !== null && v !== undefined && v !== "")
    .map(([k, v]) => [
      DETAIL_LABEL[k]!,
      Array.isArray(v) ? v.join(" ; ") : typeof v === "boolean" ? (v ? "oui" : "non") : typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([n, c]) => `${n} : ${c}`).join(", ") : String(v),
    ]);
}
