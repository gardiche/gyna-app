import "server-only";
import { cookies } from "next/headers";
import { SPACE_COOKIE, spaceOf, type Space } from "./domains";

/** Espace en cours : celui du cookie, et toujours la prospection pour une personne qui ne fait que de la prospection. */
export async function getSpace(prospector = false): Promise<Space> {
  if (prospector) return "prospection";
  return spaceOf((await cookies()).get(SPACE_COOKIE)?.value);
}
