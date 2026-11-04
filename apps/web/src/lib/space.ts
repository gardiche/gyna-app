import "server-only";
import { cookies } from "next/headers";
import type { Session } from "@/lib/supabase/server";
import { listConversations } from "@/lib/data";
import { SPACE_COOKIE, spaceOf, type Space } from "./domains";

/** Espace en cours : celui du cookie, et toujours la prospection pour une personne qui ne fait que de la prospection. */
export async function getSpace(prospector = false): Promise<Space> {
  if (prospector) return "prospection";
  return spaceOf((await cookies()).get(SPACE_COOKIE)?.value);
}

/** Où rouvrir le chat dans un espace : sa dernière conversation, sinon une nouvelle (adresse finale, sans redirection). */
export async function homeFor(session: Session, space: Space): Promise<string> {
  const mine = await listConversations(session.supabase, 30, session.userId);
  const last = mine.find((c) => c.domain === space) ?? mine.find((c) => c.domain === "autre");
  return last ? `/c/${last.id}` : "/nouvelle";
}
