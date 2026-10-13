import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, supabaseAdmin } from "@/lib/supabase/server";
import { publishPost } from "@/lib/publish";

export const maxDuration = 300;

const Body = z.union([
  z.object({ when: z.literal("now"), facebook: z.boolean().optional() }),
  z.object({ when: z.literal("later"), scheduled_at: z.string().datetime({ offset: true }), facebook: z.boolean().optional() }),
  z.object({ when: z.literal("cancel") }),
]);

/** Décision d'un associé sur la publication d'un post approuvé : maintenant, à une heure donnée, ou annuler la planification. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide" }, { status: 400 });
  const db = session.supabase;

  // La RLS garantit que le post appartient à l'organisation de l'associé.
  const { data: ad } = await db.from("ads").select("id, status, published_at, publish_status").eq("id", id).maybeSingle();
  if (!ad) return NextResponse.json({ error: "Post introuvable." }, { status: 404 });
  if (ad.status !== "approved") return NextResponse.json({ error: "Le post doit d'abord être approuvé." }, { status: 409 });
  if (ad.published_at) return NextResponse.json({ error: "Ce post est déjà publié." }, { status: 409 });

  if (parsed.data.when === "cancel") {
    await db.from("ads").update({ publish_status: null, scheduled_at: null, publish_error: null }).eq("id", id).in("publish_status", ["scheduled", "failed"]);
    return NextResponse.json({ ok: true });
  }
  // Le choix « aussi sur Facebook » est gardé avec le post : la publication planifiée le relira.
  await db.from("ads").update({ also_facebook: Boolean(parsed.data.facebook) }).eq("id", id);
  if (parsed.data.when === "later") {
    const at = new Date(parsed.data.scheduled_at);
    if (at.getTime() < Date.now() + 60_000) return NextResponse.json({ error: "Choisissez une heure à venir." }, { status: 400 });
    const { error } = await db
      .from("ads")
      .update({ publish_status: "scheduled", scheduled_at: at.toISOString(), scheduled_for: at.toISOString().slice(0, 10), publish_error: null })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const r = await publishPost(supabaseAdmin(), id, [null, "scheduled", "failed"]);
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
