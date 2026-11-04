/**
 * Les deux métiers de Gyna, qui sont aussi les deux espaces de l'app : trouver et approcher des personnes
 * (prospection), et créer et gérer ce que la marque diffuse (veille, pubs, posts, campagnes).
 */
export type Space = "prospection" | "creation";
export type Domain = Space | "autre";

export const SPACES: Array<{ key: Space; label: string; hint: string }> = [
  { key: "prospection", label: "Prospection", hint: "Trouver, trier et approcher des prospects" },
  { key: "creation", label: "Création", hint: "Veille, pubs, posts et campagnes" },
];

export const DOMAINS: Array<{ key: Domain; label: string }> = [
  { key: "prospection", label: "Prospection" },
  { key: "creation", label: "Création" },
  { key: "autre", label: "Autres échanges" },
];

/** Métier de chaque sous-agent ; Gyna n'en a pas, elle orchestre les deux. */
export const AGENT_DOMAIN: Record<string, Space> = {
  sourcing: "prospection",
  qualification: "prospection",
  redaction: "prospection",
  veille: "creation",
  ads: "creation",
  campagnes: "creation",
};

/** Pages propres à chaque espace ; les autres (chat, validations, ventures, skills, journal) sont communes. */
export const SPACE_PAGES: Record<Space, string[]> = {
  prospection: ["/prospects"],
  creation: ["/veille", "/pubs", "/posts", "/campagnes"],
};

/** Cookie qui garde l'espace choisi d'une page à l'autre. */
export const SPACE_COOKIE = "gyna_space";

export const spaceOf = (value: string | undefined | null): Space => (value === "creation" ? "creation" : "prospection");

/** Les brouillons de messages relèvent de la prospection, les lots de pubs et de posts de la création ; les skills des deux. */
export function approvalInSpace(kind: string, space: Space): boolean {
  if (kind === "draft") return space === "prospection";
  if (kind === "ad_batch") return space === "creation";
  return true;
}
