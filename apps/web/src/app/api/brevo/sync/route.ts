import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { ensureBrevoAttributes, isEmail, splitName, upsertBrevoContact, type BrevoContact } from "@/lib/brevo";
import { BREVO_ATTRIBUTE_NAMES, COLUMNS, companyValues, personValues, type ColumnValues } from "@/lib/prospect-columns";
import { companiesQuery, FILTER_KEYS, includesCompanies, includesPeople, listMemberIds, prospectsQuery, PROSPECTS_EXPORT_LIMIT, type ProspectFilters } from "@/lib/prospects-query";

export const dynamic = "force-dynamic";

/** Les champs Brevo d'une ligne : les mêmes colonnes que l'export CSV, vides omises, longueur bornée par prudence. */
function brevoFields(v: ColumnValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of COLUMNS) {
    const value = v[c.key].trim();
    if (c.brevo && value) out[c.brevo] = value.length > 500 ? `${value.slice(0, 497)}…` : value;
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Envoie dans une liste Brevo les prospects ou entreprises cochés sur la page Prospects (`ids`), ou à défaut ceux des
 * filtres, avec ou sans e-mail, sauf ceux déjà dans cette liste. Une venture doit être choisie.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.campaignViewer) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const sp = Object.fromEntries(FILTER_KEYS.map((k) => [k, typeof body?.[k] === "string" && body[k] ? body[k] : undefined])) as ProspectFilters;
  if (!sp.venture) return NextResponse.json({ error: "Choisissez une venture : chacune a ses listes Brevo." }, { status: 400 });

  const db = session.supabase;
  const { data: venture } = await db.from("ventures").select("id, name, brevo_list_id").eq("slug", sp.venture).maybeSingle();
  if (!venture) return NextResponse.json({ error: "Venture introuvable." }, { status: 404 });
  // La liste se choisit à l'envoi ; à défaut, celle réglée sur la page de la venture.
  const chosen = String(body?.brevoListId ?? "").trim();
  const listId = /^\d+$/.test(chosen) ? Number(chosen) : venture.brevo_list_id ? Number(venture.brevo_list_id) : null;
  if (!listId) return NextResponse.json({ error: "Choisissez la liste Brevo où envoyer." }, { status: 400 });

  // Les lignes cochées (ids) si l'associé en a coché, sinon toutes celles des filtres.
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 500) : [];
  let peopleRows: any[] = [];
  let placeRows: any[] = [];
  if (ids.length) {
    if (body?.kind === "entreprises") {
      const r = await db.from("companies").select("id, name, category, address, city, postal_code, phone, website, rating, maps_url, linen_potential, linen_reason, email, created_at, brevo_synced_at, brevo_synced_list_id, ventures!inner(slug, name)").in("id", ids).eq("ventures.slug", sp.venture);
      if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
      placeRows = r.data ?? [];
    } else {
      const r = await db.from("prospect_ventures").select("id, status, fit, fit_reason, heat, heat_reason, discarded_reason, created_at, brevo_synced_at, brevo_synced_list_id, ventures!inner(slug, name), prospects!inner(full_name, email, linkedin_url, headline, location)").in("id", ids).eq("ventures.slug", sp.venture);
      if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
      peopleRows = r.data ?? [];
    }
  } else {
    const wantCompanies = sp.kind === "entreprises";
    const onlyIds = await listMemberIds(db, sp.list, wantCompanies ? "entreprises" : "personnes");
    const people = includesPeople(sp) ? await prospectsQuery(db, sp, PROSPECTS_EXPORT_LIMIT, onlyIds) : { data: [], error: null };
    if (people.error) return NextResponse.json({ error: people.error.message }, { status: 500 });
    const places = (wantCompanies || !onlyIds) && includesCompanies(sp) ? await companiesQuery(db, sp, PROSPECTS_EXPORT_LIMIT, wantCompanies ? onlyIds : null) : null;
    if (places?.error) return NextResponse.json({ error: places.error.message }, { status: 500 });
    peopleRows = (people.data ?? []) as any[];
    placeRows = (places?.data ?? []) as any[];
  }

  // Sans e-mail, le contact part quand même : Brevo l'identifie alors par un identifiant interne.
  type Job = { table: "prospect_ventures" | "companies"; id: string; contact: BrevoContact; noEmail: boolean };
  const jobs: Job[] = [];
  let already = 0;
  // Par défaut, les lignes déjà dans la liste sont mises à jour aussi : c'est ce qui leur apporte les nouvelles colonnes.
  const refresh = body?.refresh !== false;
  for (const r of peopleRows) {
    const email = String(r.prospects.email ?? "").trim();
    if (!refresh && r.brevo_synced_at && Number(r.brevo_synced_list_id) === listId) already++;
    else jobs.push({ table: "prospect_ventures", id: r.id, noEmail: !isEmail(email), contact: { ...(isEmail(email) ? { email } : { extId: `gyna-pv-${r.id}` }), ...splitName(r.prospects.full_name), fields: brevoFields(personValues(r)) } });
  }
  for (const c of placeRows) {
    const email = String(c.email ?? "").trim();
    if (!refresh && c.brevo_synced_at && Number(c.brevo_synced_list_id) === listId) already++;
    else jobs.push({ table: "companies", id: c.id, noEmail: !isEmail(email), contact: { ...(isEmail(email) ? { email } : { extId: `gyna-co-${c.id}` }), lastName: c.name, fields: brevoFields(companyValues(c)) } });
  }

  // Les colonnes de Gyna deviennent des champs chez Brevo (créés une fois, rien d'existant n'est touché).
  if (jobs.length) {
    const attrs = await ensureBrevoAttributes(BREVO_ATTRIBUTE_NAMES);
    if (!attrs.ok) return NextResponse.json({ error: attrs.error }, { status: 502 });
  }

  let sent = 0;
  let sentWithoutEmail = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();
  for (let i = 0; i < jobs.length; i += 10) {
    await Promise.all(
      jobs.slice(i, i + 10).map(async (j) => {
        const res = await upsertBrevoContact(listId, j.contact);
        if (!res.ok) {
          errors.push(res.error);
          return;
        }
        sent++;
        if (j.noEmail) sentWithoutEmail++;
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
    input: { venture: sp.venture, list_id: listId, selection: ids.length || null },
    result_summary: `Brevo (${venture.name}, liste ${listId}) : ${sent} contact${s(sent)} envoyé${s(sent)} (dont ${sentWithoutEmail} sans e-mail), ${already} déjà dans cette liste${errors.length ? `, ${errors.length} refusé${s(errors.length)}` : ""}.`,
  });
  return NextResponse.json({ sent, sentWithoutEmail, already, failed: errors.length, error: errors[0] ?? null });
}
