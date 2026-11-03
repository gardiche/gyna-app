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
