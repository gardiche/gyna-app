"use server";
import { cookies } from "next/headers";
import { SPACE_COOKIE, SPACE_PAGES, spaceOf } from "@/lib/domains";
import { getSession } from "@/lib/supabase/server";
import { homeFor } from "@/lib/space";

/**
 * Retient l'espace choisi (cookie) et dit où aller : la dernière conversation du nouvel espace depuis le chat ou une
 * page de l'autre espace (adresse finale, pas de redirection), `null` si l'on reste sur la page où l'on est.
 * Le menu, les conversations et l'équipe des deux espaces sont déjà dans la page : eux ne dépendent pas de cette réponse.
 */
export async function switchSpace(target: string, path: string): Promise<string | null> {
  const session = await getSession();
  if (!session || session.campaignViewer || session.prospector) return "/";
  const space = spaceOf(target);
  (await cookies()).set(SPACE_COOKIE, space, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const other = SPACE_PAGES[space === "creation" ? "prospection" : "creation"];
  const leave = path === "/" || path.startsWith("/c/") || path.startsWith("/nouvelle") || other.some((p) => path.startsWith(p));
  return leave ? homeFor(session, space) : null;
}
