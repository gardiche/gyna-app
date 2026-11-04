"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SPACE_COOKIE, SPACE_PAGES, spaceOf } from "@/lib/domains";
import { getSession } from "@/lib/supabase/server";

/**
 * Passe d'un espace à l'autre et rend la page où aller : l'accueil (qui reprend la dernière conversation du nouvel
 * espace) depuis le chat ou une page de l'autre espace, sinon la page où l'on est. La navigation se fait côté client,
 * sans rechargement de la page.
 */
export async function switchSpace(target: string, path: string): Promise<string> {
  const session = await getSession();
  if (!session || session.campaignViewer || session.prospector) return "/";
  const space = spaceOf(target);
  (await cookies()).set(SPACE_COOKIE, space, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  const other = SPACE_PAGES[space === "creation" ? "prospection" : "creation"];
  const leave = path === "/" || path.startsWith("/c/") || path.startsWith("/nouvelle") || other.some((p) => path.startsWith(p));
  return leave || !path.startsWith("/") ? "/" : path;
}
