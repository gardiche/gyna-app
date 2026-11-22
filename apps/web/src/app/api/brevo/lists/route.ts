import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { listBrevoLists } from "@/lib/brevo";

export const dynamic = "force-dynamic";

/** Listes de contacts du compte Brevo, pour choisir où envoyer depuis la page Prospects (lecture seule). */
export async function GET() {
  const session = await getSession();
  if (!session || session.campaignViewer) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const res = await listBrevoLists();
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
  return NextResponse.json({ lists: res.lists });
}
