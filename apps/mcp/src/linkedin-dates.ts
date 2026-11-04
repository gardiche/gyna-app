/**
 * Date de publication d'un contenu LinkedIn, lue dans son adresse.
 *
 * L'identifiant d'une publication (post, partage, article) est un numéro de 19 chiffres dont les 41 premiers bits
 * sont l'heure de création en millisecondes depuis 1970 : on le décale de 22 bits pour la retrouver, à la
 * milliseconde, sans ouvrir la page. LinkedIn n'affiche lui-même que « 3 sem. », trop vague pour dater un signal.
 */
const ID_PATTERNS = [
  /urn:li:(?:activity|ugcPost|share|post):(\d{17,20})/i,
  /(?:activity|ugcPost|share)[-:](\d{17,20})/i,
];

const EARLIEST = Date.UTC(2012, 0, 1);

/** Date ISO (UTC) de la publication, ou null si l'adresse n'en contient pas ou si la valeur est invraisemblable. */
export function linkedinPostDate(url: string, now = Date.now()): string | null {
  let id: string | undefined;
  for (const re of ID_PATTERNS) {
    id = re.exec(url)?.[1];
    if (id) break;
  }
  if (!id) return null;
  const ms = Number(BigInt(id) >> 22n);
  if (!Number.isFinite(ms) || ms < EARLIEST || ms > now + 86_400_000) return null;
  return new Date(ms).toISOString();
}
