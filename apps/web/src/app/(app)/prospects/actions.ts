"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PROSPECT_STATUS, type ProspectStatus } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";

const STAMP: Partial<Record<ProspectStatus, string>> = {
  contacted: "contacted_at",
  replied: "replied_at",
  enrolled: "enrolled_at",
};

/** Mise à jour manuelle du parcours (contacté, a répondu, inscrit, écarté). */
export async function setProspectStatus(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const pvId = String(form.get("pv_id"));
  const prospectId = String(form.get("prospect_id"));
  const status = String(form.get("status")) as ProspectStatus;
  if (!(PROSPECT_STATUS as readonly string[]).includes(status)) return;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  const stamp = STAMP[status];
  if (stamp) patch[stamp] = now;
  if (status === "contacted") patch.contacted_by = session.userId;
  if (status === "discarded") patch.discarded_reason = "Écarté par un associé";
  if (status === "to_review") patch.discarded_reason = null;

  await session.supabase.from("prospect_ventures").update(patch).eq("id", pvId);
  await session.supabase.from("prospects").update({ last_interaction_at: now }).eq("id", prospectId);
  if (status === "contacted") {
    await session.supabase.from("drafts").update({ status: "sent" }).eq("prospect_venture_id", pvId).eq("status", "approved");
  }
  await session.supabase.from("actions").insert({
    org_id: session.orgId,
    agent: "associe",
    tool: "set_status",
    input: { prospect_venture_id: pvId, status },
    result_summary: `Statut mis à jour : ${status}`,
  });
  revalidatePath(`/prospects/${prospectId}`);
  revalidatePath("/prospects");
}

/** Retour à la vue d'où vient l'action groupée, filtres compris ; jamais une adresse hors de la page Prospects. */
function backTo(form: FormData): string {
  const back = String(form.get("back") ?? "");
  return back.startsWith("/prospects") ? back : "/prospects";
}

const MAX_SELECTION = { qualify: 30, companies: 50 };

/** Adresse de retour avec un message ou la liste choisie, pour la voir tout de suite ; jamais hors de la page Prospects. */
function backWith(form: FormData, params: Record<string, string | null>): string {
  const url = new URL(backTo(form), "http://gyna.local");
  for (const [k, v] of Object.entries(params)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  url.searchParams.delete("p");
  url.searchParams.delete("c");
  return `${url.pathname}${url.search}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Range les lignes cochées dans une liste (un « segment ») ou les en retire. La liste se choisit dans le menu ou se
 * crée avec un nom ; elle appartient à la venture des lignes. Valable pour les personnes comme pour les entreprises.
 * Une liste créée ici n'a pas d'échelle de classement : elle sert à regrouper et à filtrer.
 */
async function bulkList(form: FormData, kind: "personnes" | "entreprises", op: "list_add" | "list_remove", ids: string[]): Promise<never> {
  const session = await getSession();
  if (!session || session.campaignViewer) redirect("/login");
  const db = session.supabase;
  const table = kind === "personnes" ? "prospect_ventures" : "companies";
  const col = kind === "personnes" ? "prospect_venture_id" : "company_id";

  const { data: rows } = await db.from(table).select("id, venture_id, org_id").in("id", ids.slice(0, 2000));
  const found = (rows ?? []) as Array<{ id: string; venture_id: string; org_id: string }>;
  if (!found.length) redirect(backWith(form, { notice: "liste_coche" }));
  const { venture_id: ventureId, org_id: orgId } = found[0]!;
  const rowIds = found.filter((r) => r.venture_id === ventureId).map((r) => r.id);

  let listId = String(form.get("list_id") ?? "");
  const name = String(form.get("list_name") ?? "").trim().slice(0, 80);

  if (op === "list_remove") {
    if (!UUID_RE.test(listId)) redirect(backWith(form, { notice: "liste_nom" }));
    await db.from("prospect_list_members").delete().eq("list_id", listId).in(col, rowIds);
    await db.from("actions").insert({
      org_id: session.orgId,
      agent: "associe",
      tool: "list_remove",
      input: { list_id: listId, kind, count: rowIds.length },
      result_summary: `${rowIds.length} ligne(s) retirée(s) d'une liste depuis la page Prospects`,
    });
    revalidatePath("/prospects");
    redirect(backWith(form, { list: listId }));
  }

  if (!UUID_RE.test(listId)) {
    if (!name) redirect(backWith(form, { notice: "liste_nom" }));
    // Une liste du même nom (sans tenir compte des majuscules) est réutilisée plutôt que dupliquée.
    const { data: same } = await db.from("prospect_lists").select("id").eq("venture_id", ventureId).ilike("name", name.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    if (same) listId = (same as { id: string }).id;
    else {
      for (let attempt = 0; attempt < 3 && !UUID_RE.test(listId); attempt++) {
        const { data: top } = await db.from("prospect_lists").select("seq").eq("venture_id", ventureId).order("seq", { ascending: false }).limit(1).maybeSingle();
        const seq = ((top as { seq: number } | null)?.seq ?? 0) + 1;
        const { data: made } = await db.from("prospect_lists").insert({ org_id: orgId, venture_id: ventureId, seq, name, scale: [] }).select("id").maybeSingle();
        if (made) listId = (made as { id: string }).id;
      }
      if (!UUID_RE.test(listId)) redirect(backWith(form, { notice: "liste_nom" }));
    }
  }

  const { data: already } = await db.from("prospect_list_members").select(col).eq("list_id", listId).in(col, rowIds);
  const have = new Set(((already ?? []) as unknown as Array<Record<string, string>>).map((r) => r[col]));
  const toAdd = rowIds.filter((id) => !have.has(id)).map((id) => ({ org_id: orgId, list_id: listId, [col]: id }));
  if (toAdd.length) await db.from("prospect_list_members").insert(toAdd);
  await db.from("actions").insert({
    org_id: session.orgId,
    agent: "associe",
    tool: "list_add",
    input: { list_id: listId, kind, count: toAdd.length },
    result_summary: `${toAdd.length} ligne(s) ajoutée(s) à une liste depuis la page Prospects`,
  });
  revalidatePath("/prospects");
  redirect(backWith(form, { list: listId }));
}


/**
 * Actions sur les personnes cochées : les écarter, ou ouvrir une mission où Gyna fera leur qualification fine.
 * La mission n'est pas lancée d'office : le message est préparé dans le chat, l'associé l'envoie.
 */
export async function bulkProspects(form: FormData) {
  const session = await getSession();
  if (!session || session.campaignViewer) redirect("/login");
  const ids = form.getAll("ids").map(String).filter(Boolean);
  const op = String(form.get("op"));
  if (!ids.length) redirect(backTo(form));
  const db = session.supabase;

  if (op === "list_add" || op === "list_remove") return bulkList(form, "personnes", op, ids);

  if (op === "discard") {
    await db.from("prospect_ventures").update({ status: "discarded", discarded_reason: "Écarté par un associé" }).in("id", ids);
    await db.from("actions").insert({
      org_id: session.orgId,
      agent: "associe",
      tool: "set_status",
      input: { prospect_venture_ids: ids, status: "discarded" },
      result_summary: `${ids.length} prospect(s) écarté(s) depuis la page Prospects`,
    });
    revalidatePath("/prospects");
    redirect(backTo(form));
  }

  if (op === "qualify") {
    const { data } = await db
      .from("prospect_ventures")
      .select("prospect_id, ventures(id, name), prospects(full_name)")
      .in("id", ids.slice(0, MAX_SELECTION.qualify));
    const rows = (data ?? []) as any[];
    if (!rows.length) redirect(backTo(form));
    const venture = rows[0].ventures as { id: string; name: string };
    const list = rows.map((r) => `- ${r.prospects?.full_name ?? "Prospect"} (${r.prospect_id})`).join("\n");
    const prompt = [
      `Fais la qualification fine de ces ${rows.length} prospects de ${venture.name}, choisis sur la page Prospects : lis leurs publications récentes et juge leur chaleur. Les identifiants entre parenthèses sont ceux à passer en prospect_ids.`,
      list,
      ids.length > MAX_SELECTION.qualify ? `(${ids.length - MAX_SELECTION.qualify} autres cochés ne sont pas dans cette liste : ${MAX_SELECTION.qualify} au plus par mission.)` : "",
    ].filter(Boolean).join("\n\n");
    redirect(`/nouvelle?venture=${venture.id}&prompt=${encodeURIComponent(prompt)}`);
  }
  redirect(backTo(form));
}

/** Actions sur les entreprises cochées : les écarter, ou préparer une mission pour juger leur potentiel ou chercher leurs e-mails. */
export async function bulkCompanies(form: FormData) {
  const session = await getSession();
  if (!session || session.campaignViewer) redirect("/login");
  const ids = form.getAll("ids").map(String).filter(Boolean);
  const op = String(form.get("op"));
  if (!ids.length) redirect(backTo(form));
  const db = session.supabase;

  if (op === "list_add" || op === "list_remove") return bulkList(form, "entreprises", op, ids);

  if (op === "discard") {
    await db.from("companies").update({ linen_potential: "ecarte", linen_reason: "Écartée par un associé", rated_at: new Date().toISOString() }).in("id", ids);
    await db.from("actions").insert({
      org_id: session.orgId,
      agent: "associe",
      tool: "rate_companies",
      input: { company_ids: ids, potential: "ecarte" },
      result_summary: `${ids.length} entreprise(s) écartée(s) depuis la page Prospects`,
    });
    revalidatePath("/prospects");
    redirect(backTo(form));
  }

  if (op === "rate" || op === "emails") {
    const { data } = await db.from("companies").select("id, name, ventures(id, name)").in("id", ids.slice(0, MAX_SELECTION.companies));
    const rows = (data ?? []) as any[];
    if (!rows.length) redirect(backTo(form));
    const venture = rows[0].ventures as { id: string; name: string };
    const list = rows.map((r) => `- ${r.name} (${r.id})`).join("\n");
    const ask = op === "rate"
      ? `Juge le potentiel de ces ${rows.length} entreprises de ${venture.name}, choisies sur la page Prospects (rate_companies). Les identifiants entre parenthèses sont les company_ids.`
      : `Cherche l'e-mail publié sur le site de ces ${rows.length} entreprises de ${venture.name}, choisies sur la page Prospects (find_company_emails). Les identifiants entre parenthèses sont les company_ids.`;
    redirect(`/nouvelle?venture=${venture.id}&prompt=${encodeURIComponent(`${ask}\n\n${list}`)}`);
  }
  redirect(backTo(form));
}

export async function deleteProspect(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const prospectId = String(form.get("prospect_id"));
  const { error } = await session.supabase.rpc("delete_prospect", { p_id: prospectId });
  if (error) throw new Error(error.message);
  revalidatePath("/prospects");
  redirect("/prospects");
}

/** Enregistre l'e-mail d'un prospect ou d'une entreprise (vide : l'efface). Une adresse changée repart dans Brevo au prochain envoi. */
export async function setContactEmail(form: FormData) {
  const session = await getSession();
  if (!session || session.campaignViewer) redirect("/login");
  const kind = String(form.get("kind"));
  const id = String(form.get("id"));
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  if (kind === "company") {
    await session.supabase.from("companies").update({ email: email || null, email_source: null, email_found_at: null, brevo_synced_at: null }).eq("id", id);
  } else {
    await session.supabase.from("prospects").update({ email: email || null }).eq("id", id);
    await session.supabase.from("prospect_ventures").update({ brevo_synced_at: null }).eq("prospect_id", id);
  }
  revalidatePath("/prospects");
}
