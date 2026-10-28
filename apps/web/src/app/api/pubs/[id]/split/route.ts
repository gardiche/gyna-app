import { NextResponse } from "next/server";
import { z } from "zod";
import { BrandKitContent, checkBrandText } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { storeImage } from "@/lib/media";
import { fetchLogo, finishVisual, type VisualChecks } from "@/lib/finish-visual";
import { splitGrid } from "@/lib/split-grid";

export const maxDuration = 120;

const Body = z.object({
  /** La grille que contient l'image : lignes × colonnes, égal au nombre de diapositives. */
  rows: z.number().int().min(1).max(10),
  cols: z.number().int().min(1).max(10),
  /** La version de la couverture à découper ; à défaut, la dernière. */
  image_id: z.string().uuid().optional(),
});

/**
 * Découpe l'image de couverture d'un carrousel qui contient déjà toutes les diapositives (grille, bandes ou colonnes)
 * en une image par diapositive, sans rien régénérer : chaque case reçoit la même finition que les autres visuels
 * (format de la charte, vrai logo, vérifications). Les nouvelles images s'ajoutent, les anciennes versions restent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.fullMember) return NextResponse.json({ error: "Non autorisé" }, { status: session ? 403 : 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide" }, { status: 400 });
  const { rows, cols, image_id } = parsed.data;
  const db = session.supabase;

  const { data: ad } = await db.from("ads").select("id, org_id, slides, ad_batches!inner(venture_id)").eq("id", id).maybeSingle();
  if (!ad) return NextResponse.json({ error: "Pub introuvable." }, { status: 404 });
  const slides = (ad.slides ?? []) as Array<{ text: string }>;
  if (slides.length < 2) return NextResponse.json({ error: "Cette pub n'est pas un carrousel." }, { status: 400 });
  if (rows * cols !== slides.length) return NextResponse.json({ error: `La grille (${rows} × ${cols}) ne correspond pas aux ${slides.length} diapositives.` }, { status: 400 });

  const { data: covers } = await db.from("ad_images").select("id, url, raw_url, created_at").eq("ad_id", ad.id).eq("slide", 0).order("created_at", { ascending: false });
  const source = image_id ? covers?.find((c) => c.id === image_id) : covers?.[0];
  if (!source) return NextResponse.json({ error: "Aucune image de couverture à découper." }, { status: 404 });

  // L'image brute (sans logo) si elle existe : le logo sera posé sur chaque case, pas seulement sur la première.
  const file = await fetch(source.raw_url ?? source.url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!file?.ok) return NextResponse.json({ error: "L'image à découper est introuvable." }, { status: 502 });
  let cells: Buffer[];
  try {
    cells = await splitGrid(Buffer.from(await file.arrayBuffer()), rows, cols);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  const batch = (ad as any).ad_batches;
  const { data: kitRow } = await db.from("brand_kits").select("logo_asset_id, content").eq("venture_id", batch.venture_id).order("version", { ascending: false }).limit(1).maybeSingle();
  const kit = kitRow ? BrandKitContent.parse(kitRow.content) : null;
  const notices: string[] = [];
  if (!source.raw_url && kit) notices.push("L'image d'origine n'avait pas de version sans logo : le logo de la première case y est déjà posé.");

  try {
    const logo = kit ? await fetchLogo(db, kitRow?.logo_asset_id, batch.venture_id) : null;
    const rowsToInsert: Array<Record<string, unknown>> = [];
    for (const [i, cell] of cells.entries()) {
      let final = { data: cell, mime: "image/png" };
      let checks: VisualChecks | null = null;
      let rawUrl: string | null = null;
      if (kit) {
        const done = await finishVisual({ image: cell, mime: "image/png", aspect: "square", kit, logo });
        final = { data: done.data, mime: done.mime };
        checks = done.checks;
        checks.textes = checkBrandText(kit, [slides[i]!.text]);
        if (checks.textes.length) checks.avertissements.push(`Le texte de la diapositive enfreint la charte : ${checks.textes.join(", ")}.`);
        checks.avertissements.push(...notices);
        rawUrl = (await storeImage(ad.org_id, `pubs/${ad.id}`, cell, "image/png")).url;
      }
      const stored = await storeImage(ad.org_id, `pubs/${ad.id}`, final.data, final.mime);
      rowsToInsert.push({
        org_id: ad.org_id, ad_id: ad.id, url: stored.url, path: stored.path, aspect: "square", slide: i, checks, raw_url: rawUrl, created_by: session.userId,
        prompt: `Case ${i + 1} sur ${cells.length} de l'image de couverture découpée (${rows} × ${cols}), sans regénération.`,
      });
    }
    const { error } = await db.from("ad_images").insert(rowsToInsert);
    if (error) throw new Error(error.message);
    await db.from("actions").insert({ org_id: ad.org_id, agent: "associe", tool: "split_ad_image", result_summary: `Image d'une pub carrousel découpée en ${cells.length} diapositives` });
    return NextResponse.json({ ok: true, count: cells.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
