import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { restoreSkillVersion, saveSkill } from "../actions";

export const dynamic = "force-dynamic";

const fmt = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

export default async function SkillPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { slug } = await params;
  const { ok } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;

  const { data: s } = await db.from("skills").select("id, slug, name, agent, current_version_id").eq("slug", slug).maybeSingle();
  if (!s) notFound();
  const { data: versions } = await db
    .from("skill_versions")
    .select("id, version, content, created_at")
    .eq("skill_id", s.id)
    .order("version", { ascending: false });
  const current = versions?.find((v) => v.id === s.current_version_id) ?? versions?.[0];

  return (
    <>
      <div>
        <h1 className="page-title">{s.name}</h1>
        <p className="page-sub">Identifiant pour les agents : {s.slug}. Version courante : {current?.version ?? "aucune"}.</p>
      </div>
      {ok ? <p className="notice" role="status">Nouvelle version enregistrée. Les agents l'utiliseront dès leur prochaine tâche.</p> : null}
      <div className="workspace">
        <form action={saveSkill} className="card card-pad card-main stack">
          <input type="hidden" name="skill_id" value={s.id} />
          <input type="hidden" name="slug" value={s.slug} />
          <label className="field">Nom<input name="name" defaultValue={s.name} /></label>
          <label className="field">
            Contenu (markdown)
            <textarea name="content" defaultValue={current?.content ?? ""} style={{ minHeight: 420, fontSize: 14 }} required />
          </label>
          <div className="row"><button type="submit" className="btn btn-dark">Enregistrer une nouvelle version</button></div>
        </form>
        <aside>
          <section className="card card-pad stack">
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Versions</h2>
            {(versions ?? []).map((v) => (
              <form key={v.id} action={restoreSkillVersion} className="row between">
                <input type="hidden" name="skill_id" value={s.id} />
                <input type="hidden" name="slug" value={s.slug} />
                <input type="hidden" name="version_id" value={v.id} />
                <span style={{ fontSize: 14 }}>Version {v.version}, {fmt(v.created_at)}</span>
                {v.id === s.current_version_id ? <span className="pill pill-lime">Courante</span> : <button type="submit" className="btn btn-ghost btn-sm">Rétablir</button>}
              </form>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
