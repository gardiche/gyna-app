"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BriefContent } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function createVenture(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  const slug = slugify(name);
  const { data, error } = await session.supabase
    .from("ventures")
    .insert({ org_id: session.orgId, name, slug, enrollment_goal: String(form.get("goal") ?? "") || null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await session.supabase.from("briefs").insert({
    org_id: session.orgId,
    venture_id: data.id,
    version: 1,
    content: BriefContent.parse({}),
    created_by: session.userId,
  });
  redirect(`/ventures/${slug}`);
}

/** Enregistrer le brief crée une nouvelle version ; les anciennes restent consultables. */
export async function saveBrief(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const ventureId = String(form.get("venture_id"));
  const slug = String(form.get("slug"));
  const content = BriefContent.parse(
    Object.fromEntries(["persona", "offre", "promesse", "objections", "ton", "signaux_chauds", "interdits"].map((k) => [k, String(form.get(k) ?? "")])),
  );
  const recency = Math.min(365, Math.max(1, Number(form.get("recency_days") ?? 60) || 60));
  const { data: last } = await session.supabase
    .from("briefs")
    .select("version")
    .eq("venture_id", ventureId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await session.supabase.from("briefs").insert({
    org_id: session.orgId,
    venture_id: ventureId,
    version: (last?.version ?? 0) + 1,
    content,
    recency_days: recency,
    created_by: session.userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/ventures/${slug}`);
  redirect(`/ventures/${slug}?ok=brief`);
}

export async function updateVenture(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const slug = String(form.get("slug"));
  await session.supabase
    .from("ventures")
    .update({
      name: String(form.get("name") ?? "").trim(),
      enrollment_goal: String(form.get("goal") ?? "") || null,
      status: String(form.get("status") ?? "active"),
    })
    .eq("id", String(form.get("venture_id")));
  revalidatePath(`/ventures/${slug}`);
  redirect(`/ventures/${slug}?ok=venture`);
}

export async function addSegment(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const slug = String(form.get("slug"));
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  await session.supabase.from("segments").insert({
    org_id: session.orgId,
    venture_id: String(form.get("venture_id")),
    name,
    criteria: { description: String(form.get("criteria") ?? "") },
  });
  revalidatePath(`/ventures/${slug}`);
}

export async function deleteSegment(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  await session.supabase.from("segments").delete().eq("id", String(form.get("segment_id")));
  revalidatePath(`/ventures/${String(form.get("slug"))}`);
}
