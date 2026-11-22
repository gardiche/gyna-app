import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { isEmail, splitName, upsertBrevoContact } from "@/lib/brevo";
import { companiesQuery, FILTER_KEYS, includesCompanies, includesPeople, listMemberIds, prospectsQuery, PROSPECTS_EXPORT_LIMIT, type ProspectFilters } from "@/lib/prospects-query";

export const dynamic = "force-dynamic";

/**
 * Envoie dans la liste Brevo de la venture les prospects et entreprises de la page Prospects (mêmes filtres) qui ont un
 * e-mail et ne sont pas déjà partis. Une venture doit être choisie : sa liste Brevo est réglée sur sa page.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.campaignViewer) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const sp = Object.fromEntries(FILTER_KEYS.map((k) => [k, typeof body?.[k] === "string" && body[k] ? body[k] : undefined])) as ProspectFilters;
  if (!sp.venture) return NextResponse.json({ error: "Choisissez une venture : chacune a sa liste Brevo." }, { status: 400 });

  const db = session.supabase;
  const { data: venture } = await db.from("ventures").select("id, name, brevo_list_id").eq("slug", sp.venture).maybeSingle();
  if (!venture) return NextResponse.json({ error: "Venture introuvable." }, { status: 404 });
  // La liste se choisit à l'envoi ; à défaut, celle réglée sur la page de la venture.
  const chosen = String(body?.brevoListId ?? "").trim();
  const listId = /^\d+$/.test(chosen) ? Number(chosen) : venture.brevo_list_id ? Number(venture.brevo_list_id) : null;
  if (!listId) return NextResponse.json({ error: "Choisissez la liste Brevo où envoyer." }, { status: 400 });

  const onlyIds = await listMemberIds(db, sp.list);
  const people = includesPeople(sp) ? await prospectsQuery(db, sp, PROSPECTS_EXPORT_LIMIT, onlyIds) : { data: [], error: null };
  if (people.error) return NextResponse.json({ error: people.error.message }, { status: 500 });
  const places = !onlyIds && includesCompanies(sp) ? await companiesQuery(db, sp, PROSPECTS_EXPORT_LIMIT) : null;
  if (places?.error) return NextResponse.json({ error: places.error.message }, { status: 500 });

  type Job = { table: "prospect_ventures" | "companies"; id: string; email: string; contact: { firstName?: string; lastName?: string } };
  const jobs: Job[] = [];
  let withoutEmail = 0;
  let already = 0;
  for (const r of (people.data ?? []) as any[]) {
    const email = String(r.prospects.email ?? "").trim();
    if (r.brevo_synced_at && Number(r.brevo_synced_list_id) === listId) already++;
    else if (!isEmail(email)) withoutEmail++;
    else jobs.push({ table: "prospect_ventures", id: r.id, email, contact: splitName(r.prospects.full_name) });
  }
  for (const c of (places?.data ?? []) as any[]) {
    const email = String(c.email ?? "").trim();
    if (c.brevo_synced_at && Number(c.brevo_synced_list_id) === listId) already++;
    else if (!isEmail(email)) withoutEmail++;
    else jobs.push({ table: "companies", id: c.id, email, contact: { lastName: c.name } });
  }

  let sent = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();
  for (let i = 0; i < jobs.length; i += 10) {
    await Promise.all(
      jobs.slice(i, i + 10).map(async (j) => {
        const res = await upsertBrevoContact(listId, { email: j.email, ...j.contact });
        if (!res.ok) {
          errors.push(res.error);
          return;
        }
        sent++;
        await db.from(j.table).update({ brevo_synced_at: now, brevo_synced_list_id: listId }).eq("id", j.id);
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
    input: { venture: sp.venture, list_id: listId },
    result_summary: `Brevo (${venture.name}, liste ${listId}) : ${sent} contact${s(sent)} envoyé${s(sent)}, ${withoutEmail} sans e-mail, ${already} déjà dans cette liste${errors.length ? `, ${errors.length} refusé${s(errors.length)}` : ""}.`,
  });
  return NextResponse.json({ sent, withoutEmail, already, failed: errors.length, error: errors[0] ?? null });
}
