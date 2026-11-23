import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { COLUMNS, companyValues, personValues, type ColumnValues } from "@/lib/prospect-columns";
import { companiesQuery, FILTER_KEYS, includesCompanies, includesPeople, listMemberIds, prospectsQuery, PROSPECTS_EXPORT_LIMIT, sortCompanies, sortProspects, type ProspectFilters } from "@/lib/prospects-query";

export const dynamic = "force-dynamic";

/** Une cellule CSV : entre guillemets, guillemets doublés, sans retour à la ligne. */
const cell = (v: unknown) => `"${String(v ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;

/**
 * Export CSV des prospects, avec exactement les filtres de la page Prospects (venture, adéquation, chaleur,
 * statut, nom, dates). Point-virgule et BOM pour qu'Excel l'ouvre correctement en français.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.campaignViewer) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const params = new URL(req.url).searchParams;
  const sp = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? undefined])) as ProspectFilters;

  // Une liste choisie : ses membres seulement, avec le classement, la raison et les champs de la liste.
  // Pour les entreprises, la liste ne sert qu'à filtrer ; le classement et les champs de la liste sont ceux des personnes.
  const wantCompanies = sp.kind === "entreprises";
  const onlyIds = await listMemberIds(session.supabase, sp.list, wantCompanies ? "entreprises" : "personnes");
  const peopleList = Boolean(onlyIds) && !wantCompanies;
  const listMembers = new Map<string, { grade: string | null; reason: string | null; attributes: Record<string, unknown> }>();
  if (peopleList && onlyIds?.length) {
    const { data: ms } = await session.supabase.from("prospect_list_members").select("prospect_venture_id, grade, reason, attributes").eq("list_id", sp.list!);
    for (const m of (ms ?? []) as any[]) listMembers.set(m.prospect_venture_id, m);
  }
  const { data, error } = includesPeople(sp) ? await prospectsQuery(session.supabase, sp, PROSPECTS_EXPORT_LIMIT, onlyIds) : { data: [], error: null };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const companiesRes = (wantCompanies || !onlyIds) && includesCompanies(sp) ? await companiesQuery(session.supabase, sp, PROSPECTS_EXPORT_LIMIT, wantCompanies ? onlyIds : null) : null;
  if (companiesRes?.error) return NextResponse.json({ error: companiesRes.error.message }, { status: 500 });

  const asCells = (v: ColumnValues) => COLUMNS.map((c) => v[c.key]);
  const companyRows = sortCompanies((companiesRes?.data ?? []) as any[]).map((c: any) => asCells(companyValues(c)));

  const rows = sortProspects((data ?? []) as any[]).map((r: any) => [
    ...asCells(personValues(r)),
    ...(peopleList
      ? [listMembers.get(r.id)?.grade ?? "", listMembers.get(r.id)?.reason ?? "", Object.entries(listMembers.get(r.id)?.attributes ?? {}).map(([k, v]) => `${k} : ${v}`).join(" ; ")]
      : []),
  ]);
  const labels: string[] = COLUMNS.map((c) => c.label);
  const head = peopleList ? [...labels, "Classement de la liste", "Raison (liste)", "Champs de la liste"] : labels;
  const csv = "﻿" + [head, ...rows, ...(peopleList ? [] : companyRows)].map((line) => line.map(cell).join(";")).join("\r\n") + "\r\n";

  const name = ["prospects", sp.venture, sp.from && `du-${sp.from}`, sp.to && `au-${sp.to}`].filter(Boolean).join("_");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}.csv"`,
      "cache-control": "no-store",
    },
  });
}
