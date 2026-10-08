import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres, { type Sql } from "postgres";
import { execFileSync } from "node:child_process";
import { signMissionToken, verifyMissionToken } from "./token.js";
import * as t from "./tools.js";

/**
 * Test d'intégration : vraies migrations sur un Postgres en mémoire (PGlite),
 * avec un minimum de Supabase simulé (schéma auth, rôle authenticated, publication realtime).
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/db");
const SECRET = "secret-jwt-de-test";
const PORT = 55432;

const SUPABASE_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon;
  create role authenticated;
  grant usage on schema public, auth to authenticated;
  create publication supabase_realtime;
`;

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let orgId: string;
let ventureId: string;
let missionId: string;
let token: string;
const userA = "11111111-1111-1111-1111-111111111111";
const userB = "22222222-2222-2222-2222-222222222222";

before(async () => {
  db = await PGlite.create();
  await db.exec(SUPABASE_STUB);
  for (const f of ["0001_init.sql", "0002_mcp_role.sql", "0004_skills_per_agent.sql", "0005_draft_feedback.sql", "0006_skill_proposals.sql", "0007_skill_descriptions.sql", "0008_realtime_messages.sql"]) await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  await db.exec(readFileSync(join(root, "seed", "seed.sql"), "utf8"));
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);

  server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
  await server.start();
  sql = postgres({ host: "127.0.0.1", port: PORT, max: 1, prepare: false, onnotice: () => {} });

  const [org] = await sql`select id from organizations where slug = 'alpact'`;
  orgId = org!.id;
  const [v] = await sql`select id from ventures where slug = 'l-amorce'`;
  ventureId = v!.id;

  // Le trigger rattache automatiquement un email autorisé ; pas l'autre.
  await sql`insert into auth.users (id, email) values (${userA}, 'THOMAS@alpact.co'), (${userB}, 'inconnu@exemple.fr')`;

  const [c] = await sql`insert into conversations (org_id, model, venture_id) values (${orgId}, 'm', ${ventureId}) returning id`;
  const [m] = await sql`
    insert into missions (org_id, conversation_id, venture_id, objective, budget_cap_eur)
    values (${orgId}, ${c!.id}, ${ventureId}, 'Trouver 20 profils', 1) returning id`;
  missionId = m!.id;
  token = await signMissionToken(
    { org_id: orgId, mission_id: missionId, conversation_id: c!.id, venture_id: ventureId, budget_cap_eur: 1 },
    SECRET,
  );
});

after(async () => {
  await sql?.end({ timeout: 1 });
  await server?.stop();
  await db?.close();
});

const ctx = async () => ({ sql, claims: await verifyMissionToken(token, SECRET) });

test("seule une adresse autorisée devient membre", async () => {
  const members = await sql`select user_id from members`;
  assert.deepEqual(members.map((r) => r.user_id), [userA]);
});

test("jeton : refuse une signature étrangère", async () => {
  const forged = await signMissionToken({ org_id: orgId, mission_id: missionId, conversation_id: missionId, venture_id: null, budget_cap_eur: 999 }, "autre");
  await assert.rejects(verifyMissionToken(forged, SECRET));
});

test("get_brief renvoie le brief courant", async () => {
  const r = await t.getBrief(await ctx(), { venture_slug: "l-amorce" });
  assert.equal(r.venture, "L'Amorce");
  assert.equal((r.brief as any).recency_days, 60);
});

test("get_skill renvoie la version courante des skills de départ", async () => {
  const s = (await t.getSkill(await ctx(), { slug: "qualification-chaleur" })) as any;
  assert.equal(s.version, 1);
  assert.match(s.content, /Chaud/);
});

test("get_agent_skills charge les skills de l'agent et les skills partagés, sauf les désactivés", async () => {
  const [org] = await sql`select id from organizations where slug = 'alpact'`;
  const [sk] = await sql`insert into skills (org_id, slug, name, agent) values (${org.id}, 'ton-alpact', 'Ton Alpact', null) returning id`;
  const [v] = await sql`insert into skill_versions (org_id, skill_id, version, content) values (${org.id}, ${sk.id}, 1, 'Sobre.') returning id`;
  await sql`update skills set current_version_id = ${v.id} where id = ${sk.id}`;
  const r = (await t.getAgentSkills(await ctx(), { agent: "redaction" })) as any;
  assert.deepEqual(r.skills.map((s: any) => s.slug), ["ton-alpact", "premiere-approche"]);
  await sql`update skills set active = false where slug = 'premiere-approche'`;
  const r2 = (await t.getAgentSkills(await ctx(), { agent: "redaction" })) as any;
  assert.deepEqual(r2.skills.map((s: any) => s.slug), ["ton-alpact"]);
  await sql`update skills set active = true where slug = 'premiere-approche'`;
  await sql`delete from skills where id = ${sk.id}`;
});

let claireId: string;

test("upsert_prospects dédoublonne les variantes d'URL", async () => {
  const r1 = await t.upsertProspects(await ctx(), {
    mission_token: token,
    venture_slug: "l-amorce",
    prospects: [
      { linkedin_url: "https://www.linkedin.com/in/Claire-Martin/", full_name: "Claire Martin", company: "Acme" },
      { linkedin_url: "https://fr.linkedin.com/in/julien-roux?utm=1", full_name: "Julien Roux" },
    ],
  });
  assert.equal(r1.created, 2);
  claireId = r1.prospects[0]!.id;
  const r2 = await t.upsertProspects(await ctx(), {
    mission_token: token,
    venture_slug: "l-amorce",
    prospects: [{ linkedin_url: "http://linkedin.com/in/claire-martin", full_name: "Claire Martin", headline: "Cheffe de projet" }],
  });
  assert.equal(r2.created, 0);
  assert.equal(r2.existing, 1);
  assert.equal(r2.prospects[0]!.id, claireId);
  const [p] = await sql`select headline from prospects where id = ${claireId}`;
  assert.equal(p!.headline, "Cheffe de projet");
});

let signalId: string;

test("add_signals rejette un signal hors fenêtre", async () => {
  const r = await t.addSignals(await ctx(), {
    mission_token: token,
    prospect_id: claireId,
    venture_slug: "l-amorce",
    signals: [
      { kind: "post", url: "https://www.linkedin.com/posts/1", excerpt: "Envie de reconversion", published_at: new Date(Date.now() - 5 * 86400000).toISOString() },
      { kind: "post", url: "https://www.linkedin.com/posts/2", excerpt: "Vieux post", published_at: new Date(Date.now() - 400 * 86400000).toISOString() },
    ],
  });
  assert.equal(r.signal_ids.length, 1);
  assert.equal(r.rejected.length, 1);
  signalId = r.signal_ids[0]!;
});

test("qualify_prospect : « chaud » exige un signal récent", async () => {
  await assert.rejects(
    t.qualifyProspect(await ctx(), { mission_token: token, prospect_id: claireId, venture_slug: "l-amorce", heat: "hot", heat_reason: "Parle de reconversion", signal_ids: [] }),
    t.ToolError,
  );
  const ok = await t.qualifyProspect(await ctx(), {
    mission_token: token, prospect_id: claireId, venture_slug: "l-amorce", heat: "hot", heat_reason: "Parle de reconversion", signal_ids: [signalId],
  });
  assert.ok(ok.ok);
  const [pv] = await sql`select status, heat from prospect_ventures where prospect_id = ${claireId}`;
  assert.equal(pv!.status, "qualified");
  assert.equal(pv!.heat, "hot");
});

test("submit_draft : un seul brouillon en attente, avec sa validation", async () => {
  const body = "Bonjour Claire, j'ai lu votre post sur votre envie de changer de métier.";
  const r = await t.submitDraft(await ctx(), { mission_token: token, prospect_id: claireId, venture_slug: "l-amorce", body });
  assert.ok(r.draft_id);
  await assert.rejects(t.submitDraft(await ctx(), { mission_token: token, prospect_id: claireId, venture_slug: "l-amorce", body }), t.ToolError);
  const [a] = await sql`select kind, summary from approvals where ref_id = ${r.draft_id}`;
  assert.equal(a!.kind, "draft");
  assert.match(a!.summary, /Claire Martin/);
});

test("get_feedback : corrections et refus des associés, texte d'origine figé", async () => {
  const [d] = await sql`select id, original_body from drafts where status = 'pending'`;
  await sql`update drafts set body = 'Bonjour Claire, votre post sur la reconversion m''a marqué.', original_body = 'x',
            status = 'approved', decided_at = now() where id = ${d!.id}`;
  const [after] = await sql`select original_body from drafts where id = ${d!.id}`;
  assert.equal(after!.original_body, d!.original_body);

  const [pv] = await sql`select id from prospect_ventures where prospect_id = ${claireId}`;
  await sql`insert into drafts (org_id, prospect_venture_id, body, status, rejection_reason, decided_at)
            values (${orgId}, ${pv!.id}, 'Bonjour, découvrez notre bootcamp !', 'rejected', 'Trop commercial', now())`;
  await sql`insert into drafts (org_id, prospect_venture_id, body, status, decided_at)
            values (${orgId}, ${pv!.id}, 'Bonjour Claire, merci pour votre post.', 'approved', now())`;

  const r = (await t.getFeedback(await ctx(), { venture_slug: "l-amorce" })) as any;
  assert.equal(r.approved_unchanged, 1);
  assert.equal(r.feedback.length, 2);
  const rejected = r.feedback.find((f: any) => f.decision === "rejected");
  assert.equal(rejected.rejection_reason, "Trop commercial");
  assert.equal(rejected.final_body, null);
  const edited = r.feedback.find((f: any) => f.decision === "approved");
  assert.equal(edited.proposed_body, d!.original_body);
  assert.match(edited.final_body, /m'a marqué/);
});

test("get_venture_stats : étapes cumulées, chaleur, brouillons et taux", async () => {
  await sql`update ventures set enrollment_goal = '10 à 15' where id = ${ventureId}`;
  const r = (await t.getVentureStats(await ctx(), { venture_slug: "l-amorce" })) as any;
  assert.deepEqual(r.goal, { text: "10 à 15", min: 10, max: 15 });
  assert.equal(r.funnel.prospects, 2);
  assert.equal(r.funnel.qualified, 1);
  assert.equal(r.funnel.to_review, 1);
  assert.equal(r.heat.hot, 1);
  assert.equal(r.heat.hot_without_draft, 0);
  assert.equal(r.drafts.rejected, 1);
  assert.equal(r.rates.reply_rate, null);

  await sql`update prospect_ventures set status = 'replied', contacted_at = now(), replied_at = now() where prospect_id = ${claireId}`;
  const r2 = (await t.getVentureStats(await ctx(), { venture_slug: "l-amorce" })) as any;
  assert.equal(r2.funnel.contacted, 1);
  assert.equal(r2.funnel.qualified, 1);
  assert.equal(r2.rates.reply_rate, 1);
  assert.equal(r2.recent.contacted_7d, 1);
  await sql`update prospect_ventures set status = 'qualified', contacted_at = null, replied_at = null where prospect_id = ${claireId}`;
  await assert.rejects(t.getVentureStats(await ctx(), { venture_slug: "inconnue" }), t.ToolError);
});

test("propose_skill_update : proposition en validation, sans toucher au skill", async () => {
  const [before] = await sql`select current_version_id from skills where slug = 'premiere-approche'`;
  const r = await t.proposeSkillUpdate(await ctx(), {
    mission_token: token, slug: "premiere-approche", content: "Toujours proposer un créneau précis dans la semaine.", rationale: "Demande de Thomas en conversation.",
    description: "Écrit le premier message LinkedIn à un prospect qualifié.",
  });
  assert.equal(r.new_skill, false);
  const [p] = await sql`select agent::text as agent, base_version_id, status from skill_proposals where id = ${r.proposal_id}`;
  assert.equal(p!.agent, "redaction");
  assert.equal(p!.base_version_id, before!.current_version_id);
  const [a] = await sql`select kind, summary from approvals where ref_id = ${r.proposal_id}`;
  assert.equal(a!.kind, "skill_update");
  const [after] = await sql`select current_version_id from skills where slug = 'premiere-approche'`;
  assert.equal(after!.current_version_id, before!.current_version_id);

  await assert.rejects(
    t.proposeSkillUpdate(await ctx(), { mission_token: token, slug: "premiere-approche", content: "Une autre version du même skill.", rationale: "Deuxième essai.", description: "Écrit le premier message LinkedIn." }),
    /attend déjà/,
  );
  await assert.rejects(
    t.proposeSkillUpdate(await ctx(), { mission_token: token, slug: "nouveau-skill", content: "Contenu d'un skill inédit.", rationale: "Nouveau besoin." }),
    /nom/,
  );
  const n = await t.proposeSkillUpdate(await ctx(), {
    mission_token: token, slug: "relances", name: "Relances", agent: null, description: "Règles de relance communes à tous les agents.", content: "Relancer une seule fois, après sept jours.", rationale: "Règle commune.",
  });
  assert.equal(n.new_skill, true);
});

test("skills-to-sql : charge les skills du dépôt, sans nouvelle version si rien ne change", async () => {
  const script = join(root, "scripts", "skills-to-sql.mjs");
  const run = () => db.exec(execFileSync(process.execPath, [script], { encoding: "utf8" }));
  await run();
  const skills = await sql`select slug, description, current_version_id from skills where slug in ('regles-alpact', 'premiere-approche', 'lire-un-signal')`;
  assert.equal(skills.length, 3);
  assert.ok(skills.every((s) => s.description && s.current_version_id));
  const [shared] = await sql`select agent from skills where slug = 'regles-alpact'`;
  assert.equal(shared!.agent, null);
  const [before] = await sql`select count(*)::int as n from skill_versions`;
  await run();
  const [after] = await sql`select count(*)::int as n from skill_versions`;
  assert.equal(after!.n, before!.n);
  const r = (await t.getAgentSkills(await ctx(), { agent: "redaction" })) as any;
  assert.ok(r.skills.some((s: any) => s.slug === "regles-alpact" && s.description));
});

test("brief-to-sql : nouvelle version du brief, objectif et segments, sans doublon", async () => {
  const run = () => db.exec(execFileSync(process.execPath, [join(root, "scripts", "brief-to-sql.mjs"), "l-amorce"], { encoding: "utf8" }));
  await run();
  await run();
  const r = await t.getBrief(await ctx(), { venture_slug: "l-amorce" });
  const brief = r.brief as any;
  assert.equal(brief.recency_days, 120);
  assert.match(brief.content.offre, /16 semaines/);
  assert.equal(r.segments.length, 4);
  const [n] = await sql`select count(*)::int as n from briefs where venture_id = ${ventureId}`;
  assert.equal(n!.n, 2);
  const [v] = await sql`select enrollment_goal from ventures where id = ${ventureId}`;
  assert.equal(v!.enrollment_goal, "50 pré-inscriptions");
});

test("le journal refuse toute modification", async () => {
  const [row] = await sql`select count(*)::int as n from actions where mission_id = ${missionId}`;
  assert.ok(row!.n >= 4);
  await assert.rejects(sql`update actions set result_summary = 'x'`);
  await assert.rejects(sql`delete from actions`);
});

test("report_cost : au-delà du plafond, la mission attend un accord et les écritures sont bloquées", async () => {
  const r = await t.reportCost(await ctx(), { mission_token: token, amount_eur: 1.5, source: "apify", agent: "sourcing" });
  const [act] = await sql`select agent from actions where tool = 'report_cost' order by created_at desc limit 1`;
  assert.equal(act!.agent, "sourcing");
  assert.equal(r.budget_exceeded, true);
  const [m] = await sql`select status from missions where id = ${missionId}`;
  assert.equal(m!.status, "awaiting_approval");
  await assert.rejects(
    t.upsertProspects(await ctx(), { mission_token: token, venture_slug: "l-amorce", prospects: [{ linkedin_url: "https://linkedin.com/in/x", full_name: "X" }] }),
    /accord/,
  );
});

test("RLS : un membre voit les prospects, un inconnu ne voit rien", async () => {
  const count = async (user: string) => {
    const rows = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${user}, true)`;
      await tx`set local role authenticated`;
      return tx`select count(*)::int as n from prospects`;
    });
    return rows[0]!.n as number;
  };
  assert.equal(await count(userA), 2);
  assert.equal(await count(userB), 0);
});

test("suppression d'un prospect : signaux, brouillon et validation partent avec lui", async () => {
  await sql`delete from prospects where id = ${claireId}`;
  const [s] = await sql`select count(*)::int as n from signals where prospect_id = ${claireId}`;
  const [a] = await sql`select count(*)::int as n from approvals where kind = 'draft'`;
  assert.equal(s!.n, 0);
  assert.equal(a!.n, 0);
});

test("purge des prospects échus", async () => {
  await sql`update prospects set last_interaction_at = now() - interval '13 months'`;
  const [r] = await sql`select purge_expired_prospects() as n`;
  assert.equal(r!.n, 1);
});
