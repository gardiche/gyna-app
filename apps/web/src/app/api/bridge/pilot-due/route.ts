import { NextResponse } from "next/server";
import { verifyBridgeSignature } from "@/lib/bridge";
import { supabaseAdmin } from "@/lib/supabase/server";
import { accountSpend, parisNow, startDailyRun, stopPilot, type Pilot } from "@/lib/pilot";

export const maxDuration = 120;

/** Heure de Paris à partir de laquelle l'agent fait son passage du jour. */
const RUN_HOUR = 8;

/**
 * Appel signé du pont, toutes les dix minutes, pour chaque pilotage actif :
 * 1. garde-fous tenus par l'app elle-même (période finie, enveloppe dépensée) : tout est mis en pause, sans agent ;
 * 2. un passage de l'agent Campagnes par jour.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyBridgeSignature(req, "/api/bridge/pilot-due", raw)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { day, hour } = parisNow();
  const { data } = await db
    .from("ad_pilots")
    .select("id, org_id, venture_id, status, total_budget_eur, target_cost_eur, starts_on, ends_on, conversation_id, last_run_on")
    .eq("status", "active");
  const results: Array<{ venture_id: string; outcome: string }> = [];

  for (const row of data ?? []) {
    const pilot = { ...row, total_budget_eur: Number(row.total_budget_eur) } as Pilot;
    if (day > pilot.ends_on) {
      await stopPilot(db, pilot, "période terminée");
      results.push({ venture_id: pilot.venture_id, outcome: "ended" });
      continue;
    }
    if (day < pilot.starts_on) continue;
    const spend = await accountSpend(pilot.starts_on, day);
    if (spend !== null && spend >= pilot.total_budget_eur) {
      await stopPilot(db, pilot, `enveloppe dépensée : ${spend.toFixed(2)} € sur ${pilot.total_budget_eur.toFixed(2)} €`);
      results.push({ venture_id: pilot.venture_id, outcome: "budget_spent" });
      continue;
    }
    if (hour >= RUN_HOUR && pilot.last_run_on !== day) {
      results.push({ venture_id: pilot.venture_id, outcome: await startDailyRun(db, pilot, day) });
    }
  }
  return NextResponse.json({ ok: true, results });
}
