"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AGENTS } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "" = partagé par tous les agents (null en base) ; undefined = valeur invalide. */
function parseAgent(v: FormDataEntryValue | null): string | null | undefined {
  const a = String(v ?? "");
  if (a === "") return null;
  return (AGENTS as readonly string[]).includes(a) ? a : undefined;
}

export async function createSkill(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const name = String(form.get("name") ?? "").trim();
  const agent = parseAgent(form.get("agent"));
  if (!name || agent === undefined) return;
  const slug = slugify(name);
  const { error } = await session.supabase.from("skills").insert({ org_id: session.orgId, slug, name, agent });
  if (error) throw new Error(error.message);
  redirect(`/skills/${slug}`);
}

/** Chaque enregistrement crée une version immuable et la rend courante. */
export async function saveSkill(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const skillId = String(form.get("skill_id"));
  const slug = String(form.get("slug"));
  const content = String(form.get("content") ?? "").trim();
  if (!content) return;
  const db = session.supabase;
  const { data: last } = await db
    .from("skill_versions")
    .select("version")
    .eq("skill_id", skillId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: v, error } = await db
    .from("skill_versions")
    .insert({ org_id: session.orgId, skill_id: skillId, version: (last?.version ?? 0) + 1, content, created_by: session.userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db.from("skills").update({ current_version_id: v.id, name: String(form.get("name") ?? "").trim() || undefined }).eq("id", skillId);
  revalidatePath(`/skills/${slug}`);
  redirect(`/skills/${slug}?ok=1`);
}

export async function restoreSkillVersion(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const slug = String(form.get("slug"));
  await session.supabase.from("skills").update({ current_version_id: String(form.get("version_id")) }).eq("id", String(form.get("skill_id")));
  revalidatePath(`/skills/${slug}`);
}

/** Attribution du skill à un agent et activation, sans créer de nouvelle version. */
export async function updateSkillSettings(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const slug = String(form.get("slug"));
  const agent = parseAgent(form.get("agent"));
  if (agent === undefined) return;
  const { error } = await session.supabase
    .from("skills")
    .update({ agent, active: form.get("active") === "on", updated_at: new Date().toISOString() })
    .eq("id", String(form.get("skill_id")));
  if (error) throw new Error(error.message);
  revalidatePath(`/skills/${slug}`);
  revalidatePath("/skills");
  redirect(`/skills/${slug}?ok=settings`);
}
