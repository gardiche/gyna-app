import { NextResponse } from "next/server";
import { FIT_LABEL, HEAT_LABEL, STATUS_LABEL } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { prospectsQuery, PROSPECTS_EXPORT_LIMIT, sortProspects, type ProspectFilters } from "@/lib/prospects-query";

export const dynamic = "force-dynamic";

const COLUMNS = ["Nom", "Lien LinkedIn", "Titre", "Lieu", "Venture", "Adéquation", "Raison du tri", "Chaleur", "Raison de la chaleur", "Statut", "Trouvé le"];

/** Une cellule CSV : entre guillemets, guillemets doublés, sans retour à la ligne. */
const cell = (v: unknown) => `"${String(v ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
const day = (d: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris" }).format(new Date(d));

/**
 * Export CSV des prospects, avec exactement les filtres de la page Prospects (venture, adéquation, chaleur,
 * statut, nom, dates). Point-virgule et BOM pour qu'Excel l'ouvre correctement en français.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.campaignViewer) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const params = new URL(req.url).searchParams;
  const sp = Object.fromEntries(["venture", "heat", "status", "fit", "q", "from", "to"].map((k) => [k, params.get(k) ?? undefined])) as ProspectFilters;

  const { data, error } = await prospectsQuery(session.supabase, sp, PROSPECTS_EXPORT_LIMIT);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = sortProspects((data ?? []) as any[]).map((r: any) => [
    r.prospects.full_name,
    r.prospects.linkedin_url,
    r.prospects.headline,
    r.prospects.location,
    r.ventures.name,
    r.fit ? (FIT_LABEL as Record<string, string>)[r.fit] ?? r.fit : r.status === "discarded" ? "Écarté" : "Non trié",
    r.fit_reason ?? r.discarded_reason,
    r.heat ? (HEAT_LABEL as Record<string, string>)[r.heat] ?? r.heat : "",
    r.heat_reason,
    (STATUS_LABEL as Record<string, string>)[r.status] ?? r.status,
    day(r.created_at),
  ]);
  const csv = "﻿" + [COLUMNS, ...rows].map((line) => line.map(cell).join(";")).join("\r\n") + "\r\n";

  const name = ["prospects", sp.venture, sp.from && `du-${sp.from}`, sp.to && `au-${sp.to}`].filter(Boolean).join("_");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}.csv"`,
      "cache-control": "no-store",
    },
  });
}
