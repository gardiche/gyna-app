import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { isEmail, splitName, upsertBrevoContact } from "@/lib/brevo";
import { companiesQuery, includesCompanies, prospectsQuery, PROSPECTS_EXPORT_LIMIT, type ProspectFilters } from "@/lib/prospects-query";

export const dynamic = "force-dynamic";

/**
 * Envoie dans la liste Brevo de la venture les prospects et entreprises de la page Prospects (mêmes filtres) qui ont un
 * e-mail et ne sont pas déjà partis. Une venture doit être choisie : sa liste Brevo est réglée sur sa page.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.campaignViewer) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const sp = Object.fromEntries(["venture", "heat", "status", "fit", "q", "from", "to"].map((k) => [k, typeof body?.[k] === "string" && body[k] ? body[k] : undefined])) as ProspectFilters;
  if (!sp.venture) return NextResponse.json({ error: "Choisissez une venture : chacune a sa liste Brevo." }, { status: 400 });

  const db = session.supabase;
  const { data: venture } = await db.from("ventures").select("id, name, brevo_list_id").eq("slug", sp.venture).maybeSingle();
  if (!venture) return NextResponse.json({ error: "Venture introuvable." }, { status: 404 });
  if (!venture.brevo_list_id) return NextResponse.json({ error: `Aucune liste Brevo n'est réglée pour ${venture.name} (page de la venture).` }, { status: 400 });

  const people = await prospectsQuery(db, sp, PROSPECTS_EXPORT_LIMIT);
  if (people.error) return NextResponse.json({ error: people.error.message }, { status: 500 });
  const places = includesCompanies(sp) ? await companiesQuery(db, sp, PROSPECTS_EXPORT_LIMIT) : null;
  if (places?.error) return NextResponse.json({ error: places.error.message }, { status: 500 });

  type Job = { table: "prospect_ventures" | "companies"; id: string; email: string; contact: { firstName?: string; lastName?: string } };
  const jobs: Job[] = [];
  let withoutEmail = 0;
  let already = 0;
  for (const r of (people.data ?? []) as any[]) {
    const email = String(r.prospects.email ?? "").trim();
    if (r.brevo_synced_at) already++;
    else if (!isEmail(email)) withoutEmail++;
    else jobs.push({ table: "prospect_ventures", id: r.id, email, contact: splitName(r.prospects.full_name) });
  }
  for (const c of (places?.data ?? []) as any[]) {
    const email = String(c.email ?? "").trim();
    if (c.brevo_synced_at) already++;
    else if (!isEmail(email)) withoutEmail++;
    else jobs.push({ table: "companies", id: c.id, email, contact: { lastName: c.name } });
  }

  let sent = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();
  for (let i = 0; i < jobs.length; i += 10) {
    await Promise.all(
      jobs.slice(i, i + 10).map(async (j) => {
        const res = await upsertBrevoContact(Number(venture.brevo_list_id), { email: j.email, ...j.contact });
        if (!res.ok) {
          errors.push(res.error);
          return;
        }
        sent++;
        await db.from(j.table).update({ brevo_synced_at: now }).eq("id", j.id);
      }),
    );
    // Sans clé ou clé refusée, inutile d'insister sur les lots suivants.
    if (errors.length && sent === 0) break;
  }

  const s = (n: number) => (n > 1 ? "s" : "");
  await db.from("actions").insert({
    org_id: session.orgId,
    agent: "associe",
    tool: "brevo_sync",
    input: { venture: sp.venture, list_id: venture.brevo_list_id },
    result_summary: `Brevo (${venture.name}) : ${sent} contact${s(sent)} envoyé${s(sent)}, ${withoutEmail} sans e-mail, ${already} déjà envoyé${s(already)}${errors.length ? `, ${errors.length} refusé${s(errors.length)}` : ""}.`,
  });
  return NextResponse.json({ sent, withoutEmail, already, failed: errors.length, error: errors[0] ?? null });
}
