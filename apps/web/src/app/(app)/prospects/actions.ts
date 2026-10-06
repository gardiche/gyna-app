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
