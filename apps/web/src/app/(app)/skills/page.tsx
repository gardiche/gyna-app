import Link from "next/link";
import { redirect } from "next/navigation";
import { AGENTS } from "@gyna/schemas";
import { AGENT_LABEL, SKILL_GROUPS as GROUPS } from "@/lib/agents";
import { getSession } from "@/lib/supabase/server";
import { createSkill } from "./actions";

export const dynamic = "force-dynamic";


export default async function SkillsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { data: skills } = await session.supabase
    .from("skills")
    .select("id, slug, name, agent, active, updated_at, skill_versions!skill_versions_skill_id_fkey(version)")
    .order("agent")
    .order("name");

  return (
    <>
      <div>
        <h1 className="page-title">Skills</h1>
        <p className="page-sub">Votre expertise, attribuée à chaque agent. Au début de chaque tâche, un agent charge tous ses skills actifs, plus ceux partagés par tous.</p>
      </div>
      <div className="workspace">
        <section className="card card-pad card-main stack">
          {GROUPS.map((agent) => {
            const list = (skills ?? []).filter((s) => (s.agent ?? "all") === agent);
            if (!list.length) return null;
            return (
              <div key={agent} className="stack" style={{ gap: 8 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600 }}>{AGENT_LABEL[agent]}</h2>
                {list.map((s: any) => (
                  <Link key={s.id} href={`/skills/${s.slug}`} className="row between" style={{ padding: "12px 16px", borderRadius: 14, background: "var(--soft-2)", textDecoration: "none" }}>
                    <span style={{ fontSize: 15, fontWeight: 500, opacity: s.active ? 1 : 0.55 }}>{s.name}</span>
                    <span className="row" style={{ gap: 8 }}>
                      {s.active ? null : <span className="pill">Désactivé</span>}
                      <span className="muted">{s.skill_versions?.length ?? 0} version(s)</span>
                    </span>
                  </Link>
                ))}
              </div>
            );
          })}
          {!skills?.length ? <p className="empty">Aucun skill. Créez le premier à droite.</p> : null}
        </section>
        <aside>
          <form action={createSkill} className="card-lime" style={{ paddingBottom: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Nouveau skill</h2>
            <label className="field" style={{ color: "var(--ink)" }}>Nom<input name="name" required /></label>
            <label className="field" style={{ color: "var(--ink)" }}>
              Agent
              <select name="agent" defaultValue="qualification">
                <option value="">{AGENT_LABEL.all}</option>
                {AGENTS.map((a) => <option key={a} value={a}>{AGENT_LABEL[a]}</option>)}
              </select>
            </label>
            <button type="submit" className="btn btn-dark">Créer</button>
          </form>
        </aside>
      </div>
    </>
  );
}
