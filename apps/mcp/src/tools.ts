import type { Sql } from "postgres";
import {
  AddCompetitorAdsInput,
  AddSignalsInput,
  checkAdLimits,
  checkPostLimits,
  DescribeAdReferenceInput,
  GetAdFeedbackInput,
  GetCompetitorAdsInput,
  SubmitAdsInput,
  SubmitPostsInput,
  SaveWatchSummaryInput,
  UpsertCompetitorInput,
  DiscardProspectInput,
  LogActionInput,
  normalizeLinkedinUrl,
  ProposeSkillUpdateInput,
  QualifyProspectInput,
  SaveCampaignDocInput,
  SearchLinkedinProfilesInput,
  FindLinkedinIndustriesInput,
  RecordAdLaunchInput,
  ReportCostInput,
  SubmitDraftInput,
  UpsertProspectsInput,
  type MissionClaims,
} from "@gyna/schemas";
import type { z } from "zod";
import { findIndustries, mapProfile, PAGE_SIZE, resolveIndustries, runApifySearch, sizeCodes, USD_PER_PAGE, USD_TO_EUR, type SearchRunner } from "./linkedin-search.js";

export class ToolError extends Error {}

type Ctx = { sql: Sql; claims: MissionClaims };

/* ---------- Garde-fous communs ---------- */

async function mission(ctx: Ctx, { forWrite }: { forWrite: boolean }) {
  const [m] = await ctx.sql`
    select id, status, cost_eur::float as cost_eur, budget_cap_eur::float as budget_cap_eur
    from missions where id = ${ctx.claims.mission_id} and org_id = ${ctx.claims.org_id}`;
  if (!m) throw new ToolError("Mission introuvable.");
  if (forWrite && m.status === "awaiting_approval")
    throw new ToolError("Budget de mission dépassé : demande l'accord d'un associé avant de continuer.");
  if (forWrite && m.status !== "running") throw new ToolError(`Mission ${m.status} : plus aucune écriture possible.`);
  return m as { id: string; status: string; cost_eur: number; budget_cap_eur: number };
}

async function venture(ctx: Ctx, slug: string) {
  const [v] = await ctx.sql`select id, name from ventures where org_id = ${ctx.claims.org_id} and slug = ${slug}`;
  if (!v) throw new ToolError(`Venture « ${slug} » introuvable.`);
  return v as { id: string; name: string };
}

async function log(ctx: Ctx, agent: string, tool: string, summary: string, input: object = {}, status = "ok") {
  await ctx.sql`
    insert into actions (org_id, mission_id, agent, tool, input, result_summary, status)
    values (${ctx.claims.org_id}, ${ctx.claims.mission_id}, ${agent}, ${tool}, ${ctx.sql.json(input as never)}, ${summary}, ${status})`;
}

/* ---------- Lecture ---------- */

export async function getBrief(ctx: Ctx, input: { venture_slug: string }) {
  await mission(ctx, { forWrite: false });
  const v = await venture(ctx, input.venture_slug);
  const [b] = await ctx.sql`
    select version, content, recency_days from briefs where venture_id = ${v.id} order by version desc limit 1`;
  const segs = await ctx.sql`select name, criteria from segments where venture_id = ${v.id} order by name`;
  return { venture: v.name, brief: b ?? null, segments: segs };
}

export async function getSkill(ctx: Ctx, input: { slug: string }) {
  await mission(ctx, { forWrite: false });
  const [s] = await ctx.sql`
    select s.slug, s.name, s.agent, s.description, v.version, v.content
    from skills s join skill_versions v on v.id = s.current_version_id
    where s.org_id = ${ctx.claims.org_id} and s.slug = ${input.slug}`;
  if (!s) throw new ToolError(`Skill « ${input.slug} » introuvable ou sans version.`);
  return s;
}

/** Tous les skills actifs d'un agent, plus ceux partagés par tous les agents. */
export async function getAgentSkills(ctx: Ctx, input: { agent: string }) {
  await mission(ctx, { forWrite: false });
  const skills = await ctx.sql`
    select s.slug, s.name, coalesce(s.agent::text, 'tous') as agent, s.description, v.version, v.content
    from skills s join skill_versions v on v.id = s.current_version_id
    where s.org_id = ${ctx.claims.org_id} and s.active
      and (s.agent is null or s.agent::text = ${input.agent})
    order by s.agent nulls first, s.name`;
  return { agent: input.agent, count: skills.length, skills };
}

/** Nombres entiers lus dans l'objectif libre d'une venture : « 10 à 15 » → 10 et 15. */
function parseGoal(text: string | null): { min: number | null; max: number | null } {
  const n = (text ?? "").match(/\d+/g)?.map(Number) ?? [];
  return n.length ? { min: Math.min(...n), max: Math.max(...n) } : { min: null, max: null };
}

const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 1000 : null);

/**
 * Chiffres de l'entonnoir d'une venture, pour piloter l'objectif : étapes cumulées, chaleur,
 * brouillons, rythme récent, taux de conversion réels et dépense sur 30 jours. Lecture seule.
 */
export async function getVentureStats(ctx: Ctx, input: { venture_slug: string }) {
  await mission(ctx, { forWrite: false });
  const [v] = await ctx.sql`
    select id, name, enrollment_goal from ventures where org_id = ${ctx.claims.org_id} and slug = ${input.venture_slug}`;
  if (!v) throw new ToolError(`Venture « ${input.venture_slug} » introuvable.`);

  const [f] = await ctx.sql`
    select
      count(*) filter (where status <> 'discarded')::int as prospects,
      count(*) filter (where status = 'to_review')::int as to_review,
      count(*) filter (where status in ('qualified', 'contacted', 'replied', 'enrolled'))::int as qualified,
      count(*) filter (where status in ('contacted', 'replied', 'enrolled'))::int as contacted,
      count(*) filter (where status in ('replied', 'enrolled'))::int as replied,
      count(*) filter (where status = 'enrolled')::int as enrolled,
      count(*) filter (where status = 'discarded')::int as discarded,
      count(*) filter (where heat = 'hot' and status <> 'discarded')::int as hot,
      count(*) filter (where heat = 'warm' and status <> 'discarded')::int as warm,
      count(*) filter (where heat = 'cold' and status <> 'discarded')::int as cold,
      count(*) filter (where heat = 'hot' and status = 'qualified'
        and not exists (select 1 from drafts d where d.prospect_venture_id = pv.id))::int as hot_without_draft,
      count(*) filter (where created_at >= now() - interval '7 days')::int as added_7d,
      count(*) filter (where contacted_at >= now() - interval '7 days')::int as contacted_7d,
      count(*) filter (where contacted_at >= now() - interval '30 days')::int as contacted_30d,
      count(*) filter (where replied_at >= now() - interval '30 days')::int as replied_30d,
      min(contacted_at) as first_contact_at
    from prospect_ventures pv
    where org_id = ${ctx.claims.org_id} and venture_id = ${v.id}`;
  const [d] = await ctx.sql`
    select
      count(*) filter (where d.status = 'pending')::int as pending,
      count(*) filter (where d.status = 'approved')::int as approved_not_sent,
      count(*) filter (where d.status = 'sent')::int as sent,
      count(*) filter (where d.status = 'rejected')::int as rejected
    from drafts d join prospect_ventures pv on pv.id = d.prospect_venture_id
    where d.org_id = ${ctx.claims.org_id} and pv.venture_id = ${v.id}`;
  const [c] = await ctx.sql`
    select coalesce(sum(cost_eur), 0)::float as cost_30d, count(*)::int as missions_30d from missions
    where org_id = ${ctx.claims.org_id} and venture_id = ${v.id} and started_at >= now() - interval '30 days'`;

  return {
    venture: v.name,
    goal: { text: v.enrollment_goal, ...parseGoal(v.enrollment_goal) },
    funnel: {
      prospects: f!.prospects, to_review: f!.to_review, qualified: f!.qualified,
      contacted: f!.contacted, replied: f!.replied, enrolled: f!.enrolled, discarded: f!.discarded,
    },
    heat: { hot: f!.hot, warm: f!.warm, cold: f!.cold, hot_without_draft: f!.hot_without_draft },
    drafts: d,
    rates: {
      reply_rate: rate(f!.replied, f!.contacted),
      enroll_rate_of_replies: rate(f!.enrolled, f!.replied),
      enroll_rate_of_contacted: rate(f!.enrolled, f!.contacted),
    },
    recent: {
      added_7d: f!.added_7d, contacted_7d: f!.contacted_7d, contacted_30d: f!.contacted_30d, replied_30d: f!.replied_30d,
      first_contact_at: f!.first_contact_at,
    },
    spend: c,
  };
}

export async function findProspect(ctx: Ctx, input: { linkedin_url: string }) {
  await mission(ctx, { forWrite: false });
  const key = normalizeLinkedinUrl(input.linkedin_url);
  if (!key) throw new ToolError("URL de profil LinkedIn (/in/) attendue.");
  const [p] = await ctx.sql`select id, full_name from prospects where org_id = ${ctx.claims.org_id} and linkedin_key = ${key}`;
  if (!p) return { exists: false };
  const links = await ctx.sql`
    select v.slug as venture, pv.status, pv.heat, pv.contacted_at
    from prospect_ventures pv join ventures v on v.id = pv.venture_id where pv.prospect_id = ${p.id}`;
  return { exists: true, prospect_id: p.id, ventures: links };
}

/**
 * Derniers retours des associés sur les brouillons : refus (avec leur raison) et corrections (texte proposé et texte final).
 * Les brouillons approuvés tels quels ne sont que comptés.
 */
export async function getFeedback(ctx: Ctx, input: { venture_slug?: string; limit?: number }) {
  await mission(ctx, { forWrite: false });
  const ventureId = input.venture_slug ? (await venture(ctx, input.venture_slug)).id : null;
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 30);
  const items = await ctx.sql`
    select d.status::text as decision, d.decided_at, v.slug as venture, pv.heat, pv.heat_reason,
           d.original_body as proposed_body,
           case when d.body <> d.original_body then d.body end as final_body,
           d.rejection_reason
    from drafts d
    join prospect_ventures pv on pv.id = d.prospect_venture_id
    join ventures v on v.id = pv.venture_id
    where d.org_id = ${ctx.claims.org_id} and d.decided_at is not null
      and (d.status = 'rejected' or d.body <> d.original_body)
      and (${ventureId}::uuid is null or pv.venture_id = ${ventureId})
    order by d.decided_at desc
    limit ${limit}`;
  const [c] = await ctx.sql`
    select count(*)::int as n from drafts d join prospect_ventures pv on pv.id = d.prospect_venture_id
    where d.org_id = ${ctx.claims.org_id} and d.status in ('approved', 'sent') and d.body = d.original_body
      and (${ventureId}::uuid is null or pv.venture_id = ${ventureId})`;
  return { approved_unchanged: c!.n, feedback: items };
}

/* ---------- Écriture ---------- */

export async function upsertProspects(ctx: Ctx, input: z.infer<typeof UpsertProspectsInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const out = { created: 0, existing: 0, attached: 0, prospects: [] as Array<{ id: string; linkedin_url: string; new: boolean }>, alerts: [] as string[] };

  await ctx.sql.begin(async (tx) => {
    for (const p of input.prospects) {
      const key = normalizeLinkedinUrl(p.linkedin_url)!;
      let accountId: string | null = null;
      if (p.company) {
        const [a] = await tx`
          insert into accounts (org_id, name) values (${ctx.claims.org_id}, ${p.company})
          on conflict (org_id, name) do update set name = excluded.name returning id`;
        accountId = a!.id;
      }
      const [row] = await tx`
        insert into prospects (org_id, linkedin_url, linkedin_key, full_name, headline, location, account_id, source)
        values (${ctx.claims.org_id}, ${p.linkedin_url}, ${key}, ${p.full_name}, ${p.headline ?? null}, ${p.location ?? null}, ${accountId}, 'apify')
        on conflict (org_id, linkedin_key) do update set
          headline = coalesce(excluded.headline, prospects.headline),
          location = coalesce(excluded.location, prospects.location),
          account_id = coalesce(excluded.account_id, prospects.account_id)
        returning id, (xmax = 0) as inserted`;
      const isNew = Boolean(row!.inserted);
      if (isNew) out.created++;
      else {
        out.existing++;
        const earlier = await tx`
          select v.name, pv.status from prospect_ventures pv join ventures v on v.id = pv.venture_id
          where pv.prospect_id = ${row!.id} and pv.venture_id <> ${v.id}
            and pv.status in ('contacted', 'replied', 'enrolled')`;
        for (const e of earlier) out.alerts.push(`${p.full_name} a déjà été contacté(e) pour ${e.name} (${e.status}).`);
      }
      let segmentId: string | null = null;
      if (p.segment) {
        const [s] = await tx`select id from segments where venture_id = ${v.id} and name = ${p.segment}`;
        segmentId = s?.id ?? null;
      }
      const attached = await tx`
        insert into prospect_ventures (org_id, prospect_id, venture_id, segment_id, mission_id)
        values (${ctx.claims.org_id}, ${row!.id}, ${v.id}, ${segmentId}, ${ctx.claims.mission_id})
        on conflict (prospect_id, venture_id) do nothing returning id`;
      if (attached.length) out.attached++;
      out.prospects.push({ id: row!.id, linkedin_url: p.linkedin_url, new: isNew });
    }
  });

  await log(ctx, "sourcing", "upsert_prospects",
    `${out.created} prospect(s) créé(s), ${out.existing} déjà connu(s), ${out.attached} rattaché(s) à ${v.name}`,
    { venture: input.venture_slug, count: input.prospects.length });
  return out;
}

/**
 * Sourcing en un appel : lance la recherche Apify avec des réglages fixés par le code, enregistre tous les profils
 * exploitables (adresse LinkedIn et nom), et déclare le coût. Aucun tri : c'est le travail de la Qualification.
 */
export async function searchLinkedinProfiles(ctx: Ctx, input: z.infer<typeof SearchLinkedinProfilesInput>, run: SearchRunner = runApifySearch) {
  const m = await mission(ctx, { forWrite: true });
  await venture(ctx, input.venture_slug);
  const industries = resolveIndustries(input.industries);
  if (industries.unknown.length) {
    const hints = industries.unknown.flatMap((n) => findIndustries(n.split(" ")[0] ?? n, 5).map((i) => i.label));
    throw new ToolError(`Secteur inconnu de LinkedIn : ${industries.unknown.join(", ")}.${hints.length ? ` Noms proches : ${[...new Set(hints)].join(", ")}.` : ""} Cherche le nom exact avec find_linkedin_industries.`);
  }
  const estimate = Math.ceil(input.max_profiles / PAGE_SIZE) * USD_PER_PAGE * USD_TO_EUR;
  const remaining = m.budget_cap_eur - m.cost_eur;
  if (estimate > remaining) {
    throw new ToolError(`Recherche estimée à ${estimate.toFixed(2)} €, il reste ${remaining.toFixed(2)} € sur le budget de la mission : réduis max_profiles ou demande l'accord d'un associé.`);
  }

  const result = await run({
    titles: input.titles,
    locations: input.locations,
    maxItems: input.max_profiles,
    recentOnly: input.recent_only,
    companySizes: sizeCodes(input.company_sizes, input.small_companies),
    industryIds: industries.ids,
    ...(input.keywords ? { keywords: input.keywords } : {}),
  });

  const seen = new Set<string>();
  const profiles = [];
  let unusable = 0;
  for (const item of result.items) {
    const p = mapProfile(item, input.segment);
    if (!p) { unusable++; continue; }
    const key = normalizeLinkedinUrl(p.linkedin_url)!;
    if (seen.has(key)) continue;
    seen.add(key);
    profiles.push(p);
  }

  // Les profils sont payés : ils sont enregistrés avant de déclarer le coût, qui peut faire passer la mission en attente.
  const totals = { created: 0, existing: 0, attached: 0, alerts: [] as string[] };
  for (let i = 0; i < profiles.length; i += 50) {
    const r = await upsertProspects(ctx, { mission_token: "", venture_slug: input.venture_slug, prospects: profiles.slice(i, i + 50) });
    totals.created += r.created;
    totals.existing += r.existing;
    totals.attached += r.attached;
    totals.alerts.push(...r.alerts);
  }
  const cost = await reportCost(ctx, { mission_token: "", amount_eur: Math.round(result.costUsd * USD_TO_EUR * 10000) / 10000, source: "apify", agent: "sourcing" });

  const byLocation = new Map<string, number>();
  for (const p of profiles) byLocation.set(p.location ?? "Lieu non renseigné", (byLocation.get(p.location ?? "Lieu non renseigné") ?? 0) + 1);
  return {
    run_status: result.status,
    industries: industries.labels,
    found: result.items.length,
    saved: profiles.length,
    unusable,
    ...totals,
    by_location: [...byLocation.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([location, count]) => ({ location, count })),
    cost_eur: cost.cost_eur,
    budget_cap_eur: cost.budget_cap_eur,
    budget_exceeded: cost.budget_exceeded,
  };
}

/** Trouve le nom exact des secteurs de LinkedIn à partir d'un mot en anglais. */
export async function findLinkedinIndustries(ctx: Ctx, input: z.infer<typeof FindLinkedinIndustriesInput>) {
  await mission(ctx, { forWrite: false });
  const matches = findIndustries(input.query, 25);
  return { count: matches.length, industries: matches, note: matches.length ? "Passe le champ label tel quel dans industries ; ses sous-secteurs sont inclus." : "Aucun secteur : essaie un autre mot anglais, plus général." };
}

export async function addSignals(ctx: Ctx, input: z.infer<typeof AddSignalsInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const [p] = await ctx.sql`select id from prospects where id = ${input.prospect_id} and org_id = ${ctx.claims.org_id}`;
  if (!p) throw new ToolError("Prospect introuvable.");
  const [b] = await ctx.sql`select recency_days from briefs where venture_id = ${v.id} order by version desc limit 1`;
  const windowDays = (b?.recency_days as number | undefined) ?? 60;
  const oldest = Date.now() - windowDays * 86_400_000;

  const kept: string[] = [];
  const rejected: string[] = [];
  for (const s of input.signals) {
    const t = Date.parse(s.published_at);
    if (t < oldest || t > Date.now() + 86_400_000) {
      rejected.push(`${s.url} : hors de la fenêtre de ${windowDays} jours`);
      continue;
    }
    const [row] = await ctx.sql`
      insert into signals (org_id, prospect_id, venture_id, kind, url, excerpt, published_at)
      values (${ctx.claims.org_id}, ${p.id}, ${v.id}, ${s.kind}, ${s.url}, ${s.excerpt}, ${s.published_at})
      on conflict (prospect_id, url) do update set excerpt = excluded.excerpt
      returning id`;
    kept.push(row!.id);
  }
  await ctx.sql`update prospects set last_interaction_at = now() where id = ${p.id}`;
  await log(ctx, "qualification", "add_signals", `${kept.length} signal(aux) ajouté(s), ${rejected.length} rejeté(s)`,
    { prospect_id: p.id, count: input.signals.length });
  return { signal_ids: kept, rejected };
}

export async function qualifyProspect(ctx: Ctx, input: z.infer<typeof QualifyProspectInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const [pv] = await ctx.sql`
    select id from prospect_ventures where prospect_id = ${input.prospect_id} and venture_id = ${v.id} and org_id = ${ctx.claims.org_id}`;
  if (!pv) throw new ToolError("Ce prospect n'est pas rattaché à cette venture.");

  if (input.heat === "hot") {
    const [b] = await ctx.sql`select recency_days from briefs where venture_id = ${v.id} order by version desc limit 1`;
    const windowDays = (b?.recency_days as number | undefined) ?? 60;
    const ids = input.signal_ids.length ? input.signal_ids : ["00000000-0000-0000-0000-000000000000"];
    const [c] = await ctx.sql`
      select count(*)::int as n from signals
      where prospect_id = ${input.prospect_id} and id in ${ctx.sql(ids)}
        and published_at >= now() - make_interval(days => ${windowDays})`;
    if (!c || c.n < 1)
      throw new ToolError(`« Chaud » exige au moins un signal sourcé de moins de ${windowDays} jours (signal_ids).`);
  }

  await ctx.sql`
    update prospect_ventures set
      heat = ${input.heat}, heat_reason = ${input.heat_reason}, qualified_at = now(), mission_id = ${ctx.claims.mission_id},
      status = case when status in ('to_review', 'qualified', 'discarded') then 'qualified'::prospect_status else status end
    where id = ${pv.id}`;
  await log(ctx, "qualification", "qualify_prospect", `Prospect qualifié : ${input.heat}`, { prospect_id: input.prospect_id, heat: input.heat });
  return { ok: true, prospect_venture_id: pv.id };
}

export async function discardProspect(ctx: Ctx, input: z.infer<typeof DiscardProspectInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const res = await ctx.sql`
    update prospect_ventures set status = 'discarded', discarded_reason = ${input.reason}, mission_id = ${ctx.claims.mission_id}
    where prospect_id = ${input.prospect_id} and venture_id = ${v.id} and org_id = ${ctx.claims.org_id}
      and status in ('to_review', 'qualified') returning id`;
  if (!res.length) throw new ToolError("Prospect introuvable, ou déjà contacté : il ne peut plus être écarté par un agent.");
  await log(ctx, "qualification", "discard_prospect", "Prospect écarté", { prospect_id: input.prospect_id });
  return { ok: true };
}

export async function submitDraft(ctx: Ctx, input: z.infer<typeof SubmitDraftInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const [pv] = await ctx.sql`
    select pv.id, pv.status, p.full_name from prospect_ventures pv join prospects p on p.id = pv.prospect_id
    where pv.prospect_id = ${input.prospect_id} and pv.venture_id = ${v.id} and pv.org_id = ${ctx.claims.org_id}`;
  if (!pv) throw new ToolError("Ce prospect n'est pas rattaché à cette venture.");
  if (pv.status !== "qualified") throw new ToolError("Un brouillon ne se prépare que pour un prospect qualifié.");

  const [skill] = await ctx.sql`
    select current_version_id from skills where org_id = ${ctx.claims.org_id} and agent = 'redaction' and current_version_id is not null
    order by updated_at desc limit 1`;

  try {
    const draftId = await ctx.sql.begin(async (tx) => {
      const [d] = await tx`
        insert into drafts (org_id, prospect_venture_id, mission_id, body, skill_version_id)
        values (${ctx.claims.org_id}, ${pv.id}, ${ctx.claims.mission_id}, ${input.body}, ${skill?.current_version_id ?? null})
        returning id`;
      await tx`
        insert into approvals (org_id, kind, ref_id, summary)
        values (${ctx.claims.org_id}, 'draft', ${d!.id}, ${`Brouillon pour ${pv.full_name} (${v.name})`})`;
      return d!.id as string;
    });
    await log(ctx, "redaction", "submit_draft", "Brouillon soumis à validation", { prospect_id: input.prospect_id });
    return { ok: true, draft_id: draftId };
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      throw new ToolError("Un brouillon attend déjà une validation pour ce prospect.");
    throw err;
  }
}

/**
 * Propose un skill nouveau ou modifié. Rien ne change avant l'accord d'un associé :
 * la proposition part dans « À valider » avec l'avant, l'après et la raison.
 */
export async function proposeSkillUpdate(ctx: Ctx, input: z.infer<typeof ProposeSkillUpdateInput>) {
  await mission(ctx, { forWrite: true });
  const [skill] = await ctx.sql`
    select id, name, agent::text as agent, description, current_version_id from skills
    where org_id = ${ctx.claims.org_id} and slug = ${input.slug}`;
  if (!skill && !input.name) throw new ToolError("Nouveau skill : précise son nom (name).");
  if (!skill && input.agent === undefined) throw new ToolError("Nouveau skill : précise l'agent qui le chargera (agent, ou null pour tous).");
  const name = input.name ?? (skill!.name as string);
  const agent = input.agent === undefined ? (skill!.agent as string | null) : input.agent;
  const description = input.description ?? (skill?.description as string | null) ?? null;
  if (!description) throw new ToolError("Précise la description du skill (description) : ce qu'il fait et quand l'utiliser.");

  try {
    const proposalId = await ctx.sql.begin(async (tx) => {
      const [p] = await tx`
        insert into skill_proposals (org_id, mission_id, skill_id, base_version_id, slug, name, agent, description, content, rationale)
        values (${ctx.claims.org_id}, ${ctx.claims.mission_id}, ${skill?.id ?? null}, ${skill?.current_version_id ?? null},
                ${input.slug}, ${name}, ${agent}, ${description}, ${input.content}, ${input.rationale})
        returning id`;
      await tx`
        insert into approvals (org_id, kind, ref_id, summary)
        values (${ctx.claims.org_id}, 'skill_update', ${p!.id},
                ${skill ? `Skill « ${name} » : modification proposée` : `Nouveau skill proposé : « ${name} »`})`;
      return p!.id as string;
    });
    await log(ctx, "gyna", "propose_skill_update", `Skill « ${name} » proposé à validation`, { slug: input.slug, new: !skill });
    return { ok: true, proposal_id: proposalId, new_skill: !skill };
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      throw new ToolError("Une proposition attend déjà une validation pour ce skill. Attends la décision d'un associé.");
    throw err;
  }
}

/* ---------- Veille concurrentielle ---------- */

/** Concurrents connus d'une venture, avec le nombre de pubs observées et la date de leur fiche. */
export async function listCompetitors(ctx: Ctx, input: { venture_slug: string }) {
  await mission(ctx, { forWrite: false });
  const v = await venture(ctx, input.venture_slug);
  const competitors = await ctx.sql`
    select c.id, c.name, c.kind, c.website, c.linkedin_url, c.facebook_url, c.instagram_url, c.summary, c.profiled_at,
           count(a.id)::int as ads, count(a.id) filter (where a.active)::int as active_ads,
           max(a.created_at) as last_ad_collected_at
    from competitors c left join competitor_ads a on a.competitor_id = c.id
    where c.org_id = ${ctx.claims.org_id} and c.venture_id = ${v.id}
    group by c.id order by c.kind, c.name`;
  const [s] = await ctx.sql`
    select created_at from watch_summaries where venture_id = ${v.id} order by created_at desc limit 1`;
  return { venture: v.name, count: competitors.length, competitors, last_summary_at: s?.created_at ?? null };
}

/** Crée un concurrent ou complète sa fiche ; un champ absent ne remplace jamais une valeur connue. */
export async function upsertCompetitor(ctx: Ctx, input: z.infer<typeof UpsertCompetitorInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const [row] = await ctx.sql`
    insert into competitors (org_id, venture_id, name, kind, website, linkedin_url, facebook_url, instagram_url,
                             summary, profile, profiled_at, mission_id)
    values (${ctx.claims.org_id}, ${v.id}, ${input.name}, ${input.kind ?? "direct"}, ${input.website ?? null},
            ${input.linkedin_url ?? null}, ${input.facebook_url ?? null}, ${input.instagram_url ?? null},
            ${input.summary ?? null}, ${input.profile ?? null}, ${input.profile ? new Date() : null}, ${ctx.claims.mission_id})
    on conflict (venture_id, lower(name)) do update set
      kind = case when ${input.kind ?? null}::text is null then competitors.kind else excluded.kind end,
      website = coalesce(excluded.website, competitors.website),
      linkedin_url = coalesce(excluded.linkedin_url, competitors.linkedin_url),
      facebook_url = coalesce(excluded.facebook_url, competitors.facebook_url),
      instagram_url = coalesce(excluded.instagram_url, competitors.instagram_url),
      summary = coalesce(excluded.summary, competitors.summary),
      profile = coalesce(excluded.profile, competitors.profile),
      profiled_at = coalesce(excluded.profiled_at, competitors.profiled_at),
      mission_id = excluded.mission_id
    returning id, (xmax = 0) as inserted`;
  const isNew = Boolean(row!.inserted);
  await log(ctx, "veille", "upsert_competitor",
    `${isNew ? "Concurrent ajouté" : "Concurrent mis à jour"} : ${input.name}${input.profile ? " (fiche)" : ""}`,
    { venture: input.venture_slug, name: input.name });
  return { ok: true, competitor_id: row!.id as string, new: isNew };
}

async function competitorOf(ctx: Ctx, ventureId: string, id: string) {
  const [c] = await ctx.sql`
    select id, name from competitors where id = ${id} and venture_id = ${ventureId} and org_id = ${ctx.claims.org_id}`;
  if (!c) throw new ToolError("Concurrent introuvable pour cette venture : enregistre-le d'abord avec upsert_competitor.");
  return c as { id: string; name: string };
}

/** Enregistre des pubs observées ; une pub déjà vue (même lien) est mise à jour. */
export async function addCompetitorAds(ctx: Ctx, input: z.infer<typeof AddCompetitorAdsInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const c = await competitorOf(ctx, v.id, input.competitor_id);
  let created = 0, updated = 0;
  await ctx.sql.begin(async (tx) => {
    for (const a of input.ads) {
      const [row] = await tx`
        insert into competitor_ads (org_id, competitor_id, platform, url, library_id, started_at, last_seen_at, active, format,
                                    headline, body, cta, landing_url, angle, hook, promise, audience, reach, notes, mission_id)
        values (${ctx.claims.org_id}, ${c.id}, ${a.platform}, ${a.url}, ${a.library_id ?? null}, ${a.started_at ?? null},
                ${a.last_seen_at ?? null}, ${a.active ?? null}, ${a.format ?? null}, ${a.headline ?? null}, ${a.body ?? null},
                ${a.cta ?? null}, ${a.landing_url ?? null}, ${a.angle ?? null}, ${a.hook ?? null}, ${a.promise ?? null},
                ${a.audience ?? null}, ${a.reach ?? null}, ${a.notes ?? null}, ${ctx.claims.mission_id})
        on conflict (competitor_id, url) do update set
          library_id = coalesce(excluded.library_id, competitor_ads.library_id),
          started_at = coalesce(excluded.started_at, competitor_ads.started_at),
          last_seen_at = coalesce(excluded.last_seen_at, competitor_ads.last_seen_at),
          active = coalesce(excluded.active, competitor_ads.active),
          format = coalesce(excluded.format, competitor_ads.format),
          headline = coalesce(excluded.headline, competitor_ads.headline),
          body = coalesce(excluded.body, competitor_ads.body),
          cta = coalesce(excluded.cta, competitor_ads.cta),
          landing_url = coalesce(excluded.landing_url, competitor_ads.landing_url),
          angle = coalesce(excluded.angle, competitor_ads.angle),
          hook = coalesce(excluded.hook, competitor_ads.hook),
          promise = coalesce(excluded.promise, competitor_ads.promise),
          audience = coalesce(excluded.audience, competitor_ads.audience),
          reach = coalesce(excluded.reach, competitor_ads.reach),
          notes = coalesce(excluded.notes, competitor_ads.notes),
          mission_id = excluded.mission_id
        returning (xmax = 0) as inserted`;
      if (row!.inserted) created++;
      else updated++;
    }
  });
  await log(ctx, "veille", "add_competitor_ads", `${c.name} : ${created} pub(s) ajoutée(s), ${updated} mise(s) à jour`,
    { venture: input.venture_slug, competitor_id: c.id, count: input.ads.length });
  return { ok: true, created, updated };
}

/** Pubs observées d'une venture, les plus anciennes encore actives d'abord (une longue diffusion suggère une pub qui marche). */
export async function getCompetitorAds(ctx: Ctx, input: z.infer<typeof GetCompetitorAdsInput>) {
  await mission(ctx, { forWrite: false });
  const v = await venture(ctx, input.venture_slug);
  const limit = input.limit ?? 100;
  const ads = await ctx.sql`
    select a.id, c.name as competitor, a.competitor_id, a.platform, a.url, a.started_at, a.last_seen_at, a.active, a.format,
           a.headline, a.body, a.cta, a.landing_url, a.angle, a.hook, a.promise, a.audience, a.reach, a.notes,
           (coalesce(a.last_seen_at, current_date) - a.started_at) as days_running
    from competitor_ads a join competitors c on c.id = a.competitor_id
    where a.org_id = ${ctx.claims.org_id} and c.venture_id = ${v.id}
      and (${input.competitor_id ?? null}::uuid is null or a.competitor_id = ${input.competitor_id ?? null})
      and (${input.platform ?? null}::text is null or a.platform = ${input.platform ?? null})
      and (${input.active_only ?? false} = false or a.active)
    order by a.active desc nulls last, days_running desc nulls last, a.created_at desc
    limit ${limit}`;
  return { venture: v.name, count: ads.length, ads };
}

/** Enregistre une nouvelle version de la synthèse de veille d'une venture. */
export async function saveWatchSummary(ctx: Ctx, input: z.infer<typeof SaveWatchSummaryInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const [row] = await ctx.sql`
    insert into watch_summaries (org_id, venture_id, content, mission_id)
    values (${ctx.claims.org_id}, ${v.id}, ${input.content}, ${ctx.claims.mission_id}) returning id`;
  await log(ctx, "veille", "save_watch_summary", `Synthèse de veille enregistrée pour ${v.name}`, { venture: input.venture_slug });
  return { ok: true, summary_id: row!.id as string };
}

/** Dernière synthèse de veille d'une venture, pour s'en servir avant de créer des pubs. */
export async function getWatchSummary(ctx: Ctx, input: { venture_slug: string }) {
  await mission(ctx, { forWrite: false });
  const v = await venture(ctx, input.venture_slug);
  const [s] = await ctx.sql`
    select content, created_at from watch_summaries where venture_id = ${v.id} order by created_at desc limit 1`;
  return { venture: v.name, summary: s?.content ?? null, created_at: s?.created_at ?? null };
}

/* ---------- Création de pubs ---------- */

/**
 * Soumet un lot de pubs à la validation des associés. Une pub qui dépasse une limite de la plateforme
 * fait refuser tout le lot, avec la liste des dépassements ; un texte seulement trop long pour l'affichage est signalé.
 */
export async function submitAds(ctx: Ctx, input: z.infer<typeof SubmitAdsInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const errors: string[] = [];
  const warnings: string[] = [];
  input.ads.forEach((ad, i) => {
    const r = checkAdLimits(input.platform, ad);
    if (input.platform === "google" && !ad.headline) r.errors.push("titre manquant");
    for (const e of r.errors) errors.push(`Pub ${i + 1} : ${e}`);
    for (const w of r.warnings) warnings.push(`Pub ${i + 1} : ${w}`);
  });
  if (errors.length) throw new ToolError(`Lot refusé, corrige puis soumets à nouveau. ${errors.join(" ; ")}.`);

  const batchId = await ctx.sql.begin(async (tx) => {
    const [b] = await tx`
      insert into ad_batches (org_id, venture_id, mission_id, title, platform, objective, audience, rationale)
      values (${ctx.claims.org_id}, ${v.id}, ${ctx.claims.mission_id}, ${input.title}, ${input.platform},
              ${input.objective ?? null}, ${input.audience ?? null}, ${input.rationale})
      returning id`;
    for (const [i, a] of input.ads.entries()) {
      await tx`
        insert into ads (org_id, batch_id, position, format, template, angle, awareness, headline, primary_text, description,
                         cta, landing_url, visual_brief, image_prompt, grounding, hypothesis)
        values (${ctx.claims.org_id}, ${b!.id}, ${i}, ${a.format ?? null}, ${a.template ?? null}, ${a.angle}, ${a.awareness ?? null},
                ${a.headline ?? null}, ${a.primary_text}, ${a.description ?? null}, ${a.cta ?? null}, ${a.landing_url ?? null},
                ${a.visual_brief ?? null}, ${a.image_prompt ?? null}, ${a.grounding}, ${a.hypothesis ?? null})`;
    }
    await tx`
      insert into approvals (org_id, kind, ref_id, summary)
      values (${ctx.claims.org_id}, 'ad_batch', ${b!.id},
              ${`${input.ads.length} pub${input.ads.length > 1 ? "s" : ""} à choisir pour ${v.name} : « ${input.title} »`})`;
    return b!.id as string;
  });
  await log(ctx, "ads", "submit_ads", `${input.ads.length} pub(s) soumise(s) à validation : ${input.title}`,
    { venture: input.venture_slug, platform: input.platform, count: input.ads.length });
  return { ok: true, batch_id: batchId, count: input.ads.length, warnings };
}

/**
 * Soumet un lot de posts pour un compte LinkedIn ou Instagram. Même validation que les pubs :
 * un associé approuve, corrige ou refuse chaque post, puis le publie lui-même.
 */
export async function submitPosts(ctx: Ctx, input: z.infer<typeof SubmitPostsInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const errors: string[] = [];
  const warnings: string[] = [];
  input.posts.forEach((p, i) => {
    const r = checkPostLimits(input.platform, p);
    for (const e of r.errors) errors.push(`Post ${i + 1} : ${e}`);
    for (const w of r.warnings) warnings.push(`Post ${i + 1} : ${w}`);
  });
  if (errors.length) throw new ToolError(`Lot refusé, corrige puis soumets à nouveau. ${errors.join(" ; ")}.`);

  const batchId = await ctx.sql.begin(async (tx) => {
    const [b] = await tx`
      insert into ad_batches (org_id, venture_id, mission_id, kind, title, platform, author, rationale)
      values (${ctx.claims.org_id}, ${v.id}, ${ctx.claims.mission_id}, 'post', ${input.title}, ${input.platform}, ${input.author}, ${input.rationale})
      returning id`;
    for (const [i, p] of input.posts.entries()) {
      await tx`
        insert into ads (org_id, batch_id, position, format, template, angle, headline, primary_text, description,
                         visual_brief, slides, scheduled_for, grounding)
        values (${ctx.claims.org_id}, ${b!.id}, ${i}, ${p.format}, ${p.template ?? null}, ${p.pillar}, ${p.headline ?? null},
                ${p.primary_text}, ${p.first_comment ?? null}, ${p.visual_brief ?? null},
                ${p.slides ? tx.json(p.slides as never) : null}, ${p.scheduled_for ?? null}, ${p.grounding})`;
    }
    await tx`
      insert into approvals (org_id, kind, ref_id, summary)
      values (${ctx.claims.org_id}, 'ad_batch', ${b!.id},
              ${`${input.posts.length} post${input.posts.length > 1 ? "s" : ""} à choisir pour ${v.name} : « ${input.title} »`})`;
    return b!.id as string;
  });
  await log(ctx, "ads", "submit_posts", `${input.posts.length} post(s) soumis à validation : ${input.title}`,
    { venture: input.venture_slug, platform: input.platform, count: input.posts.length });
  return { ok: true, batch_id: batchId, count: input.posts.length, warnings };
}

/**
 * Retours des associés sur les pubs : refus avec leur raison, corrections (texte proposé et texte final),
 * et les dernières pubs approuvées, pour s'appuyer sur ce qui a plu sans le répéter mot pour mot.
 */
export async function getAdFeedback(ctx: Ctx, input: z.infer<typeof GetAdFeedbackInput>) {
  await mission(ctx, { forWrite: false });
  const v = await venture(ctx, input.venture_slug);
  const limit = input.limit ?? 15;
  const rows = await ctx.sql`
    select a.status, b.platform, b.kind, a.template, a.angle, a.headline, a.primary_text, a.description, a.cta, a.visual_brief,
           a.original, a.rejection_reason, a.decided_at
    from ads a join ad_batches b on b.id = a.batch_id
    where a.org_id = ${ctx.claims.org_id} and b.venture_id = ${v.id} and a.decided_at is not null
      and (${input.kind ?? null}::text is null or b.kind = ${input.kind ?? null})
    order by a.decided_at desc limit ${limit * 3}`;
  const FIELDS = ["headline", "primary_text", "description", "cta", "visual_brief"] as const;
  const rejected: unknown[] = [];
  const edited: unknown[] = [];
  const approved: unknown[] = [];
  for (const r of rows) {
    const o = (r.original ?? {}) as Record<string, string | null>;
    const base = { kind: r.kind, platform: r.platform, template: r.template, angle: r.angle };
    if (r.status === "rejected") {
      if (rejected.length < limit) rejected.push({ ...base, headline: o.headline, primary_text: o.primary_text, reason: r.rejection_reason });
      continue;
    }
    const changes = FIELDS.filter((f) => (o[f] ?? null) !== (r[f] ?? null)).map((f) => ({ field: f, proposed: o[f] ?? null, final: r[f] ?? null }));
    if (changes.length && edited.length < limit) edited.push({ ...base, changes });
    if (approved.length < limit) approved.push({ ...base, headline: r.headline, primary_text: r.primary_text, unchanged: changes.length === 0 });
  }
  const [p] = await ctx.sql`
    select count(*)::int as n from ads a join ad_batches b on b.id = a.batch_id
    where a.org_id = ${ctx.claims.org_id} and b.venture_id = ${v.id} and a.status = 'pending'`;
  return { venture: v.name, pending: p!.n, rejected, edited, approved };
}

/** Bibliothèque de visuels d'une venture : logo, photos réelles, inspirations, avec la note de l'associé. */
export async function getAdReferences(ctx: Ctx, input: { venture_slug: string }) {
  await mission(ctx, { forWrite: false });
  const v = await venture(ctx, input.venture_slug);
  const references = await ctx.sql`
    select id, kind, url, note, description, created_at from venture_assets
    where org_id = ${ctx.claims.org_id} and venture_id = ${v.id} order by kind, created_at desc limit 40`;
  return { venture: v.name, count: references.length, references };
}

/** Enregistre ce que l'agent a vu sur une image de la bibliothèque ; sert ensuite à générer les visuels. */
export async function describeAdReference(ctx: Ctx, input: z.infer<typeof DescribeAdReferenceInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const res = await ctx.sql`
    update venture_assets set description = ${input.description}
    where id = ${input.asset_id} and venture_id = ${v.id} and org_id = ${ctx.claims.org_id} returning id`;
  if (!res.length) throw new ToolError("Image introuvable dans la bibliothèque de cette venture.");
  await log(ctx, "ads", "describe_ad_reference", "Image de la bibliothèque décrite", { asset_id: input.asset_id });
  return { ok: true };
}

/* ---------- Gestion de campagnes ---------- */

/** Dernière version de chaque document de campagne d'une venture, et les titres des trois bilans précédents. */
export async function getCampaignDocs(ctx: Ctx, input: { venture_slug: string }) {
  await mission(ctx, { forWrite: false });
  const v = await venture(ctx, input.venture_slug);
  const latest = await ctx.sql`
    select distinct on (kind) kind, title, content, created_at from campaign_docs
    where org_id = ${ctx.claims.org_id} and venture_id = ${v.id} order by kind, created_at desc`;
  const earlier = await ctx.sql`
    select title, created_at from campaign_docs
    where org_id = ${ctx.claims.org_id} and venture_id = ${v.id} and kind = 'bilan' order by created_at desc offset 1 limit 3`;
  return { venture: v.name, documents: latest, earlier_reviews: earlier };
}

export async function saveCampaignDoc(ctx: Ctx, input: z.infer<typeof SaveCampaignDocInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const [row] = await ctx.sql`
    insert into campaign_docs (org_id, venture_id, mission_id, kind, title, content)
    values (${ctx.claims.org_id}, ${v.id}, ${ctx.claims.mission_id}, ${input.kind}, ${input.title}, ${input.content}) returning id`;
  await log(ctx, "campagnes", "save_campaign_doc", `Document de campagne enregistré (${input.kind}) : ${input.title}`,
    { venture: input.venture_slug, kind: input.kind });
  return { ok: true, doc_id: row!.id as string };
}

/** Pubs approuvées par les associés : les seules à mettre en campagne. L'identifiant court sert aux liens balisés. */
export async function getApprovedAds(ctx: Ctx, input: { venture_slug: string }) {
  await mission(ctx, { forWrite: false });
  const v = await venture(ctx, input.venture_slug);
  const ads = await ctx.sql`
    select left(a.id::text, 8) as ref, b.platform, b.title as batch, a.template, a.angle, a.awareness, a.format,
           a.headline, left(a.primary_text, 400) as primary_text, a.cta, a.landing_url,
           exists (select 1 from ad_images i where i.ad_id = a.id) as has_image, a.decided_at
    from ads a join ad_batches b on b.id = a.batch_id
    where a.org_id = ${ctx.claims.org_id} and b.venture_id = ${v.id} and a.status = 'approved' and b.kind = 'ad'
    order by b.platform, a.decided_at desc limit 80`;
  return { venture: v.name, count: ads.length, ads };
}

/**
 * Enveloppe de pilotage d'une venture et pubs Meta approuvées, avec leur visuel et ce qu'elles sont devenues chez Meta.
 * `may_act` dit si l'agent a le droit de lancer ou de modifier quoi que ce soit aujourd'hui.
 */
export async function getAdPilot(ctx: Ctx, input: { venture_slug: string }) {
  await mission(ctx, { forWrite: false });
  const v = await venture(ctx, input.venture_slug);
  const [p] = await ctx.sql`
    select status, total_budget_eur::float as total_budget_eur, target_cost_eur::float as target_cost_eur,
           starts_on::text as starts_on, ends_on::text as ends_on,
           (current_date between starts_on and ends_on) as in_window,
           greatest(ends_on - current_date + 1, 0)::int as days_left
    from ad_pilots where org_id = ${ctx.claims.org_id} and venture_id = ${v.id}`;
  const ads = await ctx.sql`
    select left(a.id::text, 8) as ref, a.angle, a.format, a.headline, a.primary_text, a.description, a.cta, a.landing_url,
           (select i.url from ad_images i where i.ad_id = a.id and i.slide = 0 order by i.created_at desc limit 1) as image_url,
           (select i.meta_hash from ad_images i where i.ad_id = a.id and i.slide = 0 order by i.created_at desc limit 1) as image_hash,
           a.external_id, a.external_status, a.launched_at
    from ads a join ad_batches b on b.id = a.batch_id
    where a.org_id = ${ctx.claims.org_id} and b.venture_id = ${v.id} and a.status = 'approved' and b.kind = 'ad' and b.platform = 'meta'
    order by a.decided_at desc limit 60`;
  const mayAct = Boolean(p && p.status === "active" && p.in_window);
  return {
    venture: v.name,
    pilot: p ?? null,
    may_act: mayAct,
    rule: !p
      ? "Aucune enveloppe : ne lance rien et ne modifie rien chez Meta. Dis à l'associé de la fixer page Campagnes."
      : mayAct
        ? "Enveloppe active : tu peux lancer les pubs listées ici et piloter, sans jamais engager plus que total_budget_eur sur toute la période."
        : "Enveloppe en pause ou hors dates : ne lance rien. Mets en pause chez Meta tout ce qui diffuse encore pour cette venture, déclare-le, et rends compte.",
    ads,
  };
}

/** L'agent déclare ce qu'une pub approuvée est devenue chez Meta. Refusé pour une pub non approuvée ou hors enveloppe active. */
export async function recordAdLaunch(ctx: Ctx, input: z.infer<typeof RecordAdLaunchInput>) {
  await mission(ctx, { forWrite: true });
  const v = await venture(ctx, input.venture_slug);
  const ref = input.ad_ref.toLowerCase();
  const found = await ctx.sql`
    select a.id, a.headline, a.external_id from ads a join ad_batches b on b.id = a.batch_id
    where a.org_id = ${ctx.claims.org_id} and b.venture_id = ${v.id} and a.status = 'approved' and b.kind = 'ad' and b.platform = 'meta'
      and a.id::text like ${ref + "%"}`;
  if (found.length !== 1) throw new ToolError("Pub approuvée introuvable pour cette référence : seules les pubs rendues par get_ad_pilot peuvent être diffusées.");
  const ad = found[0]!;
  if (input.status !== "stopped" && input.status !== "paused") {
    const [p] = await ctx.sql`
      select 1 from ad_pilots where org_id = ${ctx.claims.org_id} and venture_id = ${v.id}
        and status = 'active' and current_date between starts_on and ends_on`;
    if (!p) throw new ToolError("Enveloppe en pause, absente ou hors dates : aucune pub ne doit être en diffusion. Mets-la en pause chez Meta.");
  }
  await ctx.sql`
    update ads set external_id = ${input.external_id}, external_status = ${input.status},
                   launched_at = coalesce(launched_at, case when ${input.status} = 'active' then now() end)
    where id = ${ad.id}`;
  const label = { paused: "en pause", active: "en diffusion", stopped: "arrêtée" }[input.status];
  await log(ctx, "campagnes", "record_ad_launch", `Pub Meta ${label} : ${ad.headline ?? ref}${input.note ? ` (${input.note})` : ""}`,
    { venture: input.venture_slug, ad_ref: ref, external_id: input.external_id, status: input.status });
  return { ok: true };
}

export async function reportCost(ctx: Ctx, input: z.infer<typeof ReportCostInput>) {
  const m = await mission(ctx, { forWrite: false });
  const [u] = await ctx.sql`
    update missions set cost_eur = cost_eur + ${input.amount_eur}
    where id = ${m.id} returning cost_eur::float as cost_eur, budget_cap_eur::float as cap, status`;
  await ctx.sql`
    insert into actions (org_id, mission_id, agent, tool, result_summary, cost_eur)
    values (${ctx.claims.org_id}, ${m.id}, ${input.agent ?? "gyna"}, 'report_cost', ${`Coût ${input.source} : ${input.amount_eur.toFixed(2)} €`}, ${input.amount_eur})`;
  const exceeded = u!.cost_eur > u!.cap;
  if (exceeded && u!.status === "running") {
    await ctx.sql`update missions set status = 'awaiting_approval' where id = ${m.id}`;
    await ctx.sql`
      insert into approvals (org_id, kind, ref_id, summary)
      values (${ctx.claims.org_id}, 'mission_budget', ${m.id},
              ${`Budget dépassé : ${u!.cost_eur.toFixed(2)} € sur ${u!.cap.toFixed(2)} €`})`;
  }
  return { cost_eur: u!.cost_eur, budget_cap_eur: u!.cap, budget_exceeded: exceeded };
}

export async function logAction(ctx: Ctx, input: z.infer<typeof LogActionInput>) {
  await mission(ctx, { forWrite: false });
  await log(ctx, input.agent, input.tool, input.summary, {}, input.status);
  return { ok: true };
}
