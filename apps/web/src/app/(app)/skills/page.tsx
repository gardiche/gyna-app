import Link from "next/link";
import { redirect } from "next/navigation";
import type { AgentName } from "@gyna/schemas";
import { TEAM } from "@/lib/agents";
import { getSession } from "@/lib/supabase/server";
import { AgentAvatar } from "@/components/AgentAvatar";
import { createSkill } from "./actions";

export const dynamic = "force-dynamic";

interface SkillRow {
  id: string;
  slug: string;
  name: string;
  agent: AgentName | null;
  active: boolean;
  version: number | null;
  proposal: boolean;
}

function SkillList({ skills }: { skills: SkillRow[] }) {
  if (!skills.length) return <p className="muted skill-empty">Aucun skill pour l'instant.</p>;
  return (
    <ul className="skill-list">
      {skills.map((s) => (
        <li key={s.id}>
          <Link href={`/skills/${s.slug}`} className={s.active ? "skill-row" : "skill-row is-off"}>
            <span className="skill-name">{s.name}</span>
            <span className="row" style={{ gap: 6 }}>
              {s.proposal ? <span className="pill pill-lavender">Proposition en attente</span> : null}
              {s.active ? null : <span className="pill">Désactivé</span>}
              {s.version ? <span className="skill-version">v{s.version}</span> : <span className="skill-version">Vide</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NewSkill({ agent }: { agent: AgentName | null }) {
  return (
    <details className="skill-new">
      <summary>Nouveau skill</summary>
      <form action={createSkill} className="row" style={{ marginTop: 10 }}>
        <input type="hidden" name="agent" value={agent ?? ""} />
        <label className="sr-only" htmlFor={`new-${agent ?? "all"}`}>Nom du skill</label>
        <input id={`new-${agent ?? "all"}`} name="name" required placeholder="Par exemple : Relances" className="skill-new-input" />
        <button type="submit" className="btn btn-dark btn-sm">Créer</button>
      </form>
    </details>
  );
}

export default async function SkillsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const [{ data: skills }, { data: proposals }] = await Promise.all([
    db
      .from("skills")
      .select("id, slug, name, agent, active, current_version_id, skill_versions!skill_versions_skill_id_fkey(id, version)")
      .order("name"),
    db.from("skill_proposals").select("slug").eq("status", "pending"),
  ]);
  const pendingSlugs = new Set((proposals ?? []).map((p) => p.slug));
  const rows: SkillRow[] = (skills ?? []).map((s: any) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    agent: s.agent,
    active: s.active,
    version: (s.skill_versions ?? []).find((v: any) => v.id === s.current_version_id)?.version ?? null,
    proposal: pendingSlugs.has(s.slug),
  }));
  const newProposals = (proposals ?? []).filter((p) => !rows.some((r) => r.slug === p.slug)).length;
  const shared = rows.filter((s) => !s.agent);

  return (
    <>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div>
          <h1 className="page-title">Skills</h1>
          <p className="page-sub">
            Le savoir-faire d'Alpact, écrit pour chaque agent. Au début de chaque tâche, un agent lit ses skills actifs et ceux partagés par tous.
          </p>
        </div>
        {newProposals ? (
          <Link href="/validations" className="btn btn-lime btn-sm">
            {newProposals} nouveau{newProposals > 1 ? "x" : ""} skill{newProposals > 1 ? "s" : ""} proposé{newProposals > 1 ? "s" : ""} par Gyna
          </Link>
        ) : null}
      </div>

      <div className="skill-grid">
        {TEAM.map((a) => (
          <section key={a.key} className="card skill-card" aria-labelledby={`skills-${a.key}`}>
            <div className="skill-card-head">
              <AgentAvatar agent={a.key} size={48} />
              <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <h2 id={`skills-${a.key}`}>{a.name}</h2>
                  <span className="pill pill-lime">{a.tag}</span>
                </div>
                <p className="muted">{a.summary}</p>
              </div>
              <Link href={`/agents/${a.key}`} className="card-link skill-card-link">Voir l'agent</Link>
            </div>
            <SkillList skills={rows.filter((s) => s.agent === a.key)} />
            <NewSkill agent={a.key} />
          </section>
        ))}

        <section className="card skill-card skill-card-shared" aria-labelledby="skills-shared">
          <div className="skill-card-head">
            <span className="avatar-stack" aria-hidden="true">
              {TEAM.map((a) => <AgentAvatar key={a.key} agent={a.key} size={26} />)}
            </span>
            <div className="stack" style={{ gap: 4, minWidth: 0 }}>
              <h2 id="skills-shared">Partagés par tous les agents</h2>
              <p className="muted">Le ton, les règles et le contexte communs, chargés par chaque agent en plus des siens.</p>
            </div>
          </div>
          <SkillList skills={shared} />
          <NewSkill agent={null} />
        </section>
      </div>
    </>
  );
}
