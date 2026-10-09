#!/usr/bin/env node
// Transforme packages/db/seed/skills/*.md en SQL : crée chaque skill s'il manque, met à jour
// son nom, son agent et sa description, puis ajoute une nouvelle version courante si le contenu a changé.
// Usage : node packages/db/scripts/skills-to-sql.mjs [slug-organisation] > skills.sql
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../seed/skills");
const org = process.argv[2] ?? "alpact";
const AGENTS = new Set(["gyna", "sourcing", "qualification", "redaction", "veille"]);
const q = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);

const files = readdirSync(dir).filter((f) => f.endsWith(".md") && !["README.md", "evaluations.md"].includes(f));
const out = ["begin;"];
for (const f of files.sort()) {
  const raw = readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${f} : frontmatter manquant`);
  const meta = Object.fromEntries(
    m[1].split("\n").map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
  );
  const body = m[2].trim();
  const name = body.match(/^# (.+)$/m)?.[1]?.trim();
  if (!meta.name || !meta.description || !name) throw new Error(`${f} : name, description ou titre manquant`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.name)) throw new Error(`${f} : name invalide`);
  if (meta.description.length > 1024) throw new Error(`${f} : description trop longue`);
  const agent = meta.agent === "tous" ? null : meta.agent;
  if (agent && !AGENTS.has(agent)) throw new Error(`${f} : agent inconnu ${meta.agent}`);

  out.push(`
-- ${meta.name}
do $skill$
declare
  o uuid;
  s record;
  body text := ${q(body)};
  v uuid;
begin
  select id into o from organizations where slug = ${q(org)};
  if o is null then raise exception 'Organisation % introuvable', ${q(org)}; end if;
  insert into skills (org_id, slug, name, agent, description, active)
  values (o, ${q(meta.name)}, ${q(name)}, ${agent ? `${q(agent)}::agent_name` : "null"}, ${q(meta.description)}, true)
  on conflict (org_id, slug) do update set name = excluded.name, agent = excluded.agent, description = excluded.description, updated_at = now()
  returning id, current_version_id into s;
  if coalesce((select content from skill_versions where id = s.current_version_id), '') <> body then
    insert into skill_versions (org_id, skill_id, version, content)
    values (o, s.id, coalesce((select max(version) from skill_versions where skill_id = s.id), 0) + 1, body)
    returning id into v;
    update skills set current_version_id = v where id = s.id;
  end if;
end $skill$;`);
}
out.push("\ncommit;");
process.stdout.write(out.join("\n") + "\n");
