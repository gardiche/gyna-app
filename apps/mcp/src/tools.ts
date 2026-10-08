import type { Sql } from "postgres";
import {
  AddSignalsInput,
  DiscardProspectInput,
  LogActionInput,
  normalizeLinkedinUrl,
  ProposeSkillUpdateInput,
  QualifyProspectInput,
  ReportCostInput,
  SubmitDraftInput,
  UpsertProspectsInput,
  type MissionClaims,
} from "@gyna/schemas";
import type { z } from "zod";

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
