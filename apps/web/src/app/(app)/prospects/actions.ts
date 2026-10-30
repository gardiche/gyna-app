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
