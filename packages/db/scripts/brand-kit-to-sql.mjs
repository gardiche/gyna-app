#!/usr/bin/env node
// Transforme packages/db/seed/brand-kits/<venture>.md en SQL : nouvelle version de la charte de marque
// (si le contenu change). Le logo est celui de la bibliothèque de la venture : le seul logo qui ne parle
// pas du Campus Numérique, sinon celui dont l'identifiant est donné en argument.
// Prérequis : pnpm --filter @gyna/schemas build (le contenu est validé par BrandKitContent).
// Usage : node packages/db/scripts/brand-kit-to-sql.mjs l-amorce [slug-organisation] [--logo=<uuid>] > charte.sql
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const logoArg = args.find((a) => a.startsWith("--logo="))?.slice(7);
const [venture, org = "alpact"] = args.filter((a) => !a.startsWith("--"));
if (!venture) throw new Error("Usage : brand-kit-to-sql.mjs <slug-venture> [slug-organisation] [--logo=<uuid>]");
if (logoArg && !/^[0-9a-f-]{36}$/i.test(logoArg)) throw new Error("--logo attend un identifiant (uuid)");

const { BrandKitContent } = await import(pathToFileURL(join(here, "../../schemas/dist/index.js")).href).catch(() => {
  throw new Error("Construire d'abord les schémas : pnpm --filter @gyna/schemas build");
});

const raw = readFileSync(join(here, "../seed/brand-kits", `${venture}.md`), "utf8").replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
const sections = new Map();
for (const part of raw.split(/\n(?=## )/).slice(1)) {
  const [title, ...rest] = part.split("\n");
  sections.set(title.replace(/^## /, "").trim(), rest.join("\n").trim());
}
const get = (t) => {
  const v = sections.get(t);
  if (v == null) throw new Error(`Section « ${t} » manquante`);
  return v;
};

const field = (section, label) => {
  const m = get(section).match(new RegExp(`^- ${label} :[ \t]*(.*)$`, "m"));
  return (m?.[1] ?? "").trim();
};
const items = (section) => get(section).split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());
const rows = (section) =>
  get(section)
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*(-|Nom\b|Hex\b|Canal\b|Texte\b)/.test(l) && !/^\|[\s|-]*\|?$/.test(l))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
const yes = (label) => /^oui/i.test(field("Contrôles automatiques", label));
const number = (s) => (s === "" ? null : Number(s.replace("%", "").replace(",", ".")));
const prose = (section) => get(section).trim();

const content = BrandKitContent.parse({
  logo: { coin: field("Logo", "Coin") || null, taille_pct: number(field("Logo", "Taille")), marge_pct: number(field("Logo", "Marge")) },
  palette: rows("Palette").map(([nom, hex, usage = ""]) => ({ nom, hex, usage })),
  polices: { titres: field("Polices", "Titres"), texte: field("Polices", "Texte") },
  ton: { adresse: field("Ton", "Adresse") || null, registre: field("Ton", "Registre") },
  interdits: { mots: items("Interdits · Mots"), formules: items("Interdits · Formules"), regles: items("Interdits · Règles"),
    sans_exclamation: yes("Sans point d'exclamation"), sans_emoji: yes("Sans émoji"), sans_tiret_cadratin: yes("Sans tiret cadratin"), sans_prix: yes("Sans prix") },
  formats: rows("Formats").map(([canal, format, note = ""]) => ({ canal, format, note })),
  cible: prose("Cible"),
  positionnement: prose("Positionnement"),
  mentions: rows("Mentions obligatoires").map(([texte, ou = ""]) => ({ texte, ou })),
});

const tag = "$ck$";
const lit = (s) => {
  if (s.includes(tag)) throw new Error("Contenu incompatible avec le délimiteur SQL");
  return `${tag}${s}${tag}`;
};

process.stdout.write(`do $b$
declare
  o uuid;
  v uuid;
  logo uuid := ${logoArg ? `${lit(logoArg)}::uuid` : "null"};
  n int;
  body jsonb := ${lit(JSON.stringify(content))}::jsonb;
  cur record;
begin
  select id into o from organizations where slug = ${lit(org)};
  select id into v from ventures where org_id = o and slug = ${lit(venture)};
  if v is null then raise exception 'Venture introuvable'; end if;
  if logo is not null then
    if not exists (select 1 from venture_assets where id = logo and venture_id = v and kind = 'logo') then
      raise exception 'Ce logo n''est pas dans la bibliothèque de la venture';
    end if;
  else
    -- Jamais le logo du Campus Numérique in the Alps, repéré par sa note ou sa description.
    select count(*) into n from venture_assets
      where venture_id = v and kind = 'logo' and coalesce(note, '') || ' ' || coalesce(description, '') !~* 'campus';
    if n = 1 then
      select id into logo from venture_assets
        where venture_id = v and kind = 'logo' and coalesce(note, '') || ' ' || coalesce(description, '') !~* 'campus';
    else
      raise notice 'Logo non choisi (% candidat(s)) : relancer avec --logo=<uuid> ou le choisir dans l''app.', n;
    end if;
  end if;
  select version, content, logo_asset_id into cur from brand_kits where venture_id = v order by version desc limit 1;
  if cur is null or cur.content <> body or cur.logo_asset_id is distinct from logo then
    insert into brand_kits (org_id, venture_id, version, logo_asset_id, content)
    values (o, v, coalesce(cur.version, 0) + 1, logo, body);
  end if;
end $b$;
`);
