/**
 * Les deux métiers de Gyna : trouver et approcher des personnes (prospection), et faire vivre
 * la marque sur les réseaux et en publicité (veille, pubs, posts, campagnes).
 */
export type Domain = "prospection" | "reseaux" | "autre";

export const DOMAINS: Array<{ key: Domain; label: string }> = [
  { key: "prospection", label: "Prospection" },
  { key: "reseaux", label: "Réseaux et pubs" },
  { key: "autre", label: "Autres échanges" },
];

/** Métier de chaque sous-agent ; Gyna n'en a pas, elle orchestre les deux. */
export const AGENT_DOMAIN: Record<string, Exclude<Domain, "autre">> = {
  sourcing: "prospection",
  qualification: "prospection",
  redaction: "prospection",
  veille: "reseaux",
  ads: "reseaux",
  campagnes: "reseaux",
};
