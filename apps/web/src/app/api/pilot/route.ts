import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, supabaseAdmin } from "@/lib/supabase/server";
import { stopPilot, syncAdImages } from "@/lib/pilot";

// Le dépôt des visuels chez Meta peut prendre quelques secondes par image.
export const maxDuration = 60;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const Body = z
  .object({
    venture_id: z.string().uuid(),
    status: z.enum(["active", "paused"]),
    total_budget_eur: z.number().positive().max(100_000),
    target_cost_eur: z.number().positive().max(10_000).nullable(),
    starts_on: z.string().regex(DAY),
    ends_on: z.string().regex(DAY),
  })
  .refine((b) => b.ends_on >= b.starts_on, { message: "La date de fin précède la date de début." });

/**
 * Fixe l'enveloppe de pilotage des pubs d'une venture, l'active ou la met en pause.
 * La mise en pause coupe aussitôt les campagnes chez Meta, par l'app elle-même.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !session.fullMember) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Réglages invalides." }, { status: 400 });
  const b = parsed.data;
  // La venture doit être visible de l'associé ; les écritures passent ensuite par le rôle de service (journal compris).
  const { data: venture } = await session.supabase.from("ventures").select("id").eq("id", b.venture_id).maybeSingle();
  if (!venture) return NextResponse.json({ error: "Venture introuvable." }, { status: 404 });
  const db = supabaseAdmin();

  const { data: before } = await db.from("ad_pilots").select("status").eq("venture_id", b.venture_id).maybeSingle();
  const { data: pilot, error } = await db
    .from("ad_pilots")
    .upsert({ org_id: session.orgId, ...b, updated_by: session.userId }, { onConflict: "venture_id" })
    .select("id, org_id, venture_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (b.status === "paused" && before?.status === "active") {
    const res = await stopPilot(db, pilot, "arrêt demandé par un associé");
    return NextResponse.json(res.ok ? { ok: true, paused: res.paused } : { ok: true, warning: res.error });
  }
  if (b.status === "active" && before?.status !== "active") {
    await db.from("actions").insert({
      org_id: session.orgId,
      agent: "associe",
      tool: "pilot_start",
      result_summary: `Pilotage des pubs activé : ${b.total_budget_eur.toFixed(2)} € du ${b.starts_on} au ${b.ends_on}${b.target_cost_eur ? `, coût visé ${b.target_cost_eur.toFixed(2)} € par pré-inscription` : ""}.`,
    });
  }
  // Enveloppe active : les visuels des pubs approuvées sont déposés chez Meta sans attendre l'horloge.
  const sync = b.status === "active" ? await syncAdImages(db, b.venture_id) : { uploaded: 0 };
  return NextResponse.json({ ok: true, ...("error" in sync && sync.error ? { warning: `Visuels non déposés chez Meta : ${sync.error}` } : {}) });
}
