"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SPACE_COOKIE, SPACE_PAGES, spaceOf } from "@/lib/domains";
import { getSession } from "@/lib/supabase/server";

/**
 * Passe d'un espace à l'autre. Depuis le chat ou une page de l'autre espace, on rouvre l'accueil, qui reprend la
 * dernière conversation du nouvel espace ; sur une page commune, on y reste.
 */
export async function switchSpace(target: string, path: string) {
  const session = await getSession();
  if (!session || session.campaignViewer || session.prospector) redirect("/");
  const space = spaceOf(target);
  (await cookies()).set(SPACE_COOKIE, space, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  const other = SPACE_PAGES[space === "creation" ? "prospection" : "creation"];
  const leave = path === "/" || path.startsWith("/c/") || path.startsWith("/nouvelle") || other.some((p) => path.startsWith(p));
  redirect(leave || !path.startsWith("/") ? "/" : path);
}
