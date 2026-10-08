#!/usr/bin/env node
// Transforme packages/db/seed/briefs/<venture>.md en SQL : nouvelle version du brief (si le contenu change),
// objectif de la venture et segments (créés ou mis à jour par nom ; les autres sont conservés).
// Usage : node packages/db/scripts/brief-to-sql.mjs l-amorce [slug-organisation] > brief.sql
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const venture = process.argv[2];
const org = process.argv[3] ?? "alpact";
if (!venture) throw new Error("Usage : brief-to-sql.mjs <slug-venture> [slug-organisation]");
const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../seed/briefs", `${venture}.md`), "utf8").replace(/\r\n/g, "\n");

// Sections de niveau 2 : « ## Titre » → texte jusqu'à la suivante (les séparateurs --- sont retirés).
const sections = new Map();
for (const part of raw.split(/\n(?=## )/).slice(1)) {
  const [title, ...rest] = part.split("\n");
  sections.set(title.replace(/^## /, "").trim(), rest.join("\n").replace(/\n---\s*$/, "").trim());
}
const get = (t) => {
  const v = sections.get(t);
  if (v == null) throw new Error(`Section « ${t} » manquante`);
  return v;
};

const FIELDS = { offre: "Offre", persona: "Persona", promesse: "Promesse", signaux_chauds: "Signaux chauds", objections: "Objections", ton: "Ton", interdits: "Interdits" };
const content = Object.fromEntries(Object.entries(FIELDS).map(([k, t]) => [k, get(`Brief · ${t}`)]));
const goal = get("Objectif de la venture").split("\n")[0].trim();
const recency = Number(get("Fenêtre des signaux").match(/\d+/)?.[0]);
if (!recency || recency < 1 || recency > 365) throw new Error("Fenêtre des signaux invalide");
const segments = get("Segments")
  .split("\n")
  .filter((l) => l.startsWith("|") && !/^\|\s*(Nom|-)/.test(l))
  .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
  .map(([name, description]) => ({ name, description }));

const tag = "$brief$";
const lit = (s) => {
  if (s.includes(tag)) throw new Error("Contenu incompatible avec le délimiteur SQL");
  return `${tag}${s}${tag}`;
};

process.stdout.write(`do ${tag.replace("brief", "b")}
declare
  o uuid;
  v uuid;
  body jsonb := ${lit(JSON.stringify(content))}::jsonb;
  cur record;
begin
  select id into o from organizations where slug = ${lit(org)};
  select id into v from ventures where org_id = o and slug = ${lit(venture)};
  if v is null then raise exception 'Venture introuvable'; end if;
  update ventures set enrollment_goal = ${lit(goal)}, updated_at = now() where id = v;
  select version, content, recency_days into cur from briefs where venture_id = v order by version desc limit 1;
  if cur is null or cur.content <> body or cur.recency_days <> ${recency} then
    insert into briefs (org_id, venture_id, version, content, recency_days)
    values (o, v, coalesce(cur.version, 0) + 1, body, ${recency});
  end if;
${segments
  .map(
    (s) => `  update segments set criteria = jsonb_build_object('description', ${lit(s.description)}), updated_at = now()
    where venture_id = v and name = ${lit(s.name)};
  if not found then
    insert into segments (org_id, venture_id, name, criteria)
    values (o, v, ${lit(s.name)}, jsonb_build_object('description', ${lit(s.description)}));
  end if;`,
  )
  .join("\n")}
end ${tag.replace("brief", "b")};
`);
