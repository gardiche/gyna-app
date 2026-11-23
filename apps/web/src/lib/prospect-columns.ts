import { FIT_LABEL, HEAT_LABEL, STATUS_LABEL } from "@gyna/schemas";
import { LINEN_LABEL } from "./prospects-query";

/**
 * Les colonnes d'un prospect ou d'une entreprise, dans l'ordre de l'export CSV. Brevo reçoit les mêmes : le nom de
 * son champ personnalisé est dans `brevo` (vide : le champ est déjà fourni autrement, FIRSTNAME, LASTNAME ou l'e-mail).
 * Une seule définition pour les deux, afin que ce qu'on retrouve dans Brevo soit ce qu'on voit dans Gyna.
 */
export const COLUMNS = [
  { key: "nom", label: "Nom", brevo: null },
  { key: "entreprise", label: "Entreprise", brevo: "ENTREPRISE" },
  { key: "email", label: "E-mail", brevo: null },
  { key: "lien", label: "Lien LinkedIn ou Google Maps", brevo: "LIEN" },
  { key: "titre", label: "Titre ou coordonnées", brevo: "TITRE_OU_COORDONNEES" },
  { key: "lieu", label: "Lieu", brevo: "LIEU" },
  { key: "venture", label: "Venture", brevo: "VENTURE" },
  { key: "adequation", label: "Adéquation", brevo: "ADEQUATION" },
  { key: "raison_tri", label: "Raison du tri", brevo: "RAISON_DU_TRI" },
  { key: "chaleur", label: "Chaleur", brevo: "CHALEUR" },
  { key: "raison_chaleur", label: "Raison de la chaleur", brevo: "RAISON_DE_LA_CHALEUR" },
  { key: "statut", label: "Statut", brevo: "STATUT" },
  { key: "trouve_le", label: "Trouvé le", brevo: "TROUVE_LE" },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]["key"];
export type ColumnValues = Record<ColumnKey, string>;

/** Champs personnalisés à créer chez Brevo, un par colonne qui n'a pas déjà son champ. */
export const BREVO_ATTRIBUTE_NAMES: string[] = COLUMNS.flatMap((c) => (c.brevo ? [c.brevo] : []));

const day = (d: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris" }).format(new Date(d));
const text = (v: unknown) => (v == null ? "" : String(v));

/** Valeurs d'une ligne de la page Prospects (personne), telles que dans l'export CSV. */
export function personValues(r: any): ColumnValues {
  return {
    nom: text(r.prospects.full_name),
    entreprise: "",
    email: text(r.prospects.email),
    lien: text(r.prospects.linkedin_url),
    titre: text(r.prospects.headline),
    lieu: text(r.prospects.location),
    venture: text(r.ventures.name),
    adequation: r.fit ? (FIT_LABEL as Record<string, string>)[r.fit] ?? r.fit : r.status === "discarded" ? "Écarté" : "Non trié",
    raison_tri: text(r.fit_reason ?? r.discarded_reason),
    chaleur: r.heat ? (HEAT_LABEL as Record<string, string>)[r.heat] ?? r.heat : "",
    raison_chaleur: text(r.heat_reason),
    statut: (STATUS_LABEL as Record<string, string>)[r.status] ?? text(r.status),
    trouve_le: day(r.created_at),
  };
}

/** Valeurs d'une entreprise, telles que dans l'export CSV. */
export function companyValues(c: any): ColumnValues {
  return {
    nom: "",
    entreprise: text(c.name),
    email: text(c.email),
    lien: text(c.maps_url),
    titre: [c.category, c.phone, c.website, c.rating != null ? `${c.rating}/5` : null].filter(Boolean).join(" · "),
    lieu: [c.address, [c.postal_code, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    venture: text(c.ventures.name),
    adequation: c.linen_potential ? LINEN_LABEL[c.linen_potential] ?? c.linen_potential : "Non jugée",
    raison_tri: text(c.linen_reason),
    chaleur: "",
    raison_chaleur: "",
    statut: c.linen_potential === "ecarte" ? "Écartée" : "Nouveau",
    trouve_le: day(c.created_at),
  };
}
