-- Propositions de skills par les agents (outil MCP propose_skill_update).
-- Une proposition crée ou modifie un skill seulement après l'accord d'un associé (validation « skill_update »).
alter type approval_kind add value if not exists 'skill_update';

create table if not exists skill_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  -- Skill modifié ; nul pour un nouveau skill.
  skill_id uuid references skills(id) on delete cascade,
  -- Version courante au moment de la proposition, pour montrer l'avant et l'après.
  base_version_id uuid references skill_versions(id) on delete set null,
  slug text not null,
  name text not null,
  agent agent_name,
  content text not null,
  rationale text not null,
  status approval_status not null default 'pending',
  rejection_reason text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Une seule proposition en attente par skill.
create unique index if not exists skill_proposals_one_pending on skill_proposals (org_id, slug) where status = 'pending';

create trigger skill_proposals_updated_at before update on skill_proposals
for each row execute function set_updated_at();

alter table skill_proposals enable row level security;
create policy skill_proposals_all on skill_proposals for all
  using (org_id in (select current_org_ids())) with check (org_id in (select current_org_ids()));

grant select, insert on skill_proposals to gyna_mcp;

-- Supprimer une proposition supprime aussi sa validation.
create or replace function skill_proposals_cleanup_approvals() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from approvals where kind = 'skill_update' and ref_id = old.id;
  return old;
end $$;

create trigger skill_proposals_cleanup after delete on skill_proposals
for each row execute function skill_proposals_cleanup_approvals();

revoke execute on function skill_proposals_cleanup_approvals() from public, anon, authenticated;
