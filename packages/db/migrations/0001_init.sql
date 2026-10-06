-- Gyna : schéma initial
-- Toutes les tables métier portent org_id et sont cloisonnées par RLS.

-- ---------------------------------------------------------------------------
-- Énumérations
-- ---------------------------------------------------------------------------
create type heat as enum ('cold', 'warm', 'hot');
create type prospect_status as enum ('to_review', 'qualified', 'contacted', 'replied', 'enrolled', 'discarded');
create type agent_name as enum ('gyna', 'sourcing', 'qualification', 'redaction');
create type member_role as enum ('owner', 'member');
create type venture_status as enum ('active', 'paused', 'archived');
create type signal_kind as enum ('post', 'comment', 'event');
create type draft_status as enum ('pending', 'approved', 'rejected', 'sent');
create type approval_kind as enum ('draft', 'mission_budget');
create type approval_status as enum ('pending', 'approved', 'rejected');
create type approval_channel as enum ('web', 'telegram');
create type mission_status as enum ('running', 'awaiting_approval', 'done', 'failed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- "https://www.LinkedIn.com/in/Claire/?x" -> "linkedin.com/in/claire"
create or replace function normalize_linkedin_url(url text) returns text
language plpgsql immutable as $$
declare
  s text := lower(trim(url));
  m text[];
begin
  s := regexp_replace(s, '^https?://', '');
  s := regexp_replace(s, '^([a-z]{2,3}\.)?www\.', '');
  s := regexp_replace(s, '^[a-z]{2}\.', '');
  s := split_part(split_part(s, '?', 1), '#', 1);
  s := regexp_replace(s, '/+$', '');
  m := regexp_match(s, '^linkedin\.com/in/([^/]+)');
  if m is null then
    return null;
  end if;
  return 'linkedin.com/in/' || m[1];
end $$;

-- ---------------------------------------------------------------------------
-- Organisations et membres
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  default_mission_budget_eur numeric(10,2) not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Emails autorisés à se connecter : la connexion est fermée à tout autre email.
create table allowed_emails (
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role member_role not null default 'member',
  display_name text,
  primary key (org_id, email)
);

create table members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role member_role not null default 'member',
  telegram_chat_id text,
  telegram_link_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create or replace function current_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from members where user_id = auth.uid()
$$;

-- À la création d'un compte, rattache l'utilisateur aux organisations qui l'autorisent.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into members (org_id, user_id, display_name, role)
  select a.org_id, new.id, coalesce(a.display_name, split_part(new.email, '@', 1)), a.role
  from allowed_emails a
  where lower(a.email) = lower(new.email)
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Ventures, briefs, segments
-- ---------------------------------------------------------------------------
create table ventures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  status venture_status not null default 'active',
  color text not null default 'lime',
  enrollment_goal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

-- Une ligne par version ; la version courante est la plus haute. Lignes immuables.
create table briefs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  venture_id uuid not null references ventures(id) on delete cascade,
  version int not null,
  content jsonb not null default '{}'::jsonb,
  recency_days int not null default 60 check (recency_days between 1 and 365),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (venture_id, version)
);

create view current_briefs as
select distinct on (venture_id) * from briefs order by venture_id, version desc;

create table segments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  venture_id uuid not null references ventures(id) on delete cascade,
  name text not null,
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venture_id, name)
);

-- ---------------------------------------------------------------------------
-- Skills
-- ---------------------------------------------------------------------------
create table skills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  agent agent_name not null,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create table skill_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  version int not null,
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (skill_id, version)
);

alter table skills
  add constraint skills_current_version_fk foreign key (current_version_id) references skill_versions(id);

-- ---------------------------------------------------------------------------
-- Comptes, prospects, signaux
-- ---------------------------------------------------------------------------
create table accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  domain text,
  linkedin_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create table prospects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  linkedin_url text not null,
  linkedin_key text not null,
  full_name text not null,
  headline text,
  location text,
  account_id uuid references accounts(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  source text not null default 'apify',
  last_interaction_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '12 months',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, linkedin_key)
);

create or replace function prospects_set_key() returns trigger
language plpgsql as $$
begin
  new.linkedin_key := normalize_linkedin_url(new.linkedin_url);
  if new.linkedin_key is null then
    raise exception 'URL LinkedIn invalide : %', new.linkedin_url;
  end if;
  new.purge_after := new.last_interaction_at + interval '12 months';
  return new;
end $$;

create trigger prospects_key before insert or update of linkedin_url, last_interaction_at on prospects
for each row execute function prospects_set_key();

create table missions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null,
  venture_id uuid references ventures(id) on delete set null,
  objective text not null,
  status mission_status not null default 'running',
  budget_cap_eur numeric(10,2) not null,
  cost_eur numeric(10,4) not null default 0,
  created_by uuid references auth.users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table prospect_ventures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  venture_id uuid not null references ventures(id) on delete cascade,
  segment_id uuid references segments(id) on delete set null,
  mission_id uuid references missions(id) on delete set null,
  status prospect_status not null default 'to_review',
  heat heat,
  heat_reason text,
  qualified_at timestamptz,
  contacted_at timestamptz,
  contacted_by uuid references auth.users(id),
  replied_at timestamptz,
  enrolled_at timestamptz,
  discarded_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prospect_id, venture_id)
);

create table signals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  venture_id uuid references ventures(id) on delete set null,
  kind signal_kind not null,
  url text not null,
  excerpt text not null check (char_length(excerpt) <= 500),
  published_at timestamptz not null,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prospect_id, url)
);

-- ---------------------------------------------------------------------------
-- Brouillons et validations
-- ---------------------------------------------------------------------------
create table drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  prospect_venture_id uuid not null references prospect_ventures(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  body text not null,
  status draft_status not null default 'pending',
  skill_version_id uuid references skill_versions(id) on delete set null,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un seul brouillon en attente par prospect et venture.
create unique index drafts_one_pending on drafts (prospect_venture_id) where status = 'pending';

create table approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind approval_kind not null,
  ref_id uuid not null,
  status approval_status not null default 'pending',
  summary text not null,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  channel approval_channel,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index approvals_pending on approvals (org_id, created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Conversations, messages, journal
-- ---------------------------------------------------------------------------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null default 'Nouvelle conversation',
  created_by uuid references auth.users(id),
  venture_id uuid references ventures(id) on delete set null,
  model text not null,
  provider text,
  reasoning_effort text,
  hermes_session_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table missions
  add constraint missions_conversation_fk foreign key (conversation_id) references conversations(id) on delete cascade;

create table messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tool_events jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index messages_conversation on messages (conversation_id, created_at);

-- Journal : ajout seul. Ni modification ni suppression, pour personne.
create table actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  agent text not null,
  tool text not null,
  input jsonb not null default '{}'::jsonb,
  result_summary text,
  status text not null default 'ok',
  cost_eur numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);

create index actions_org_created on actions (org_id, created_at desc);

create or replace function forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception 'Table % : ajout seul, modification et suppression interdites', tg_table_name;
end $$;

-- Seule exception : la mise à null de mission_id quand une mission est supprimée.
create or replace function forbid_action_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.mission_id is null and old.mission_id is not null
     and (new.id, new.org_id, new.agent, new.tool, new.input, new.result_summary, new.status, new.cost_eur, new.created_at)
       is not distinct from
         (old.id, old.org_id, old.agent, old.tool, old.input, old.result_summary, old.status, old.cost_eur, old.created_at) then
    return new;
  end if;
  raise exception 'Le journal est en ajout seul';
end $$;

create trigger actions_append_only before update or delete on actions
for each row execute function forbid_action_change();
create trigger skill_versions_immutable before update on skill_versions
for each row execute function forbid_change();
create trigger briefs_immutable before update on briefs
for each row execute function forbid_change();

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['organizations','members','ventures','segments','skills','accounts','prospects',
                           'prospect_ventures','signals','drafts','approvals','conversations','missions']
  loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table organizations enable row level security;
alter table allowed_emails enable row level security;
alter table members enable row level security;

create policy org_read on organizations for select using (id in (select current_org_ids()));
create policy org_update on organizations for update using (id in (select current_org_ids()));
create policy allowed_read on allowed_emails for select using (org_id in (select current_org_ids()));
create policy members_read on members for select using (org_id in (select current_org_ids()));
create policy members_update_self on members for update using (user_id = auth.uid());

do $$
declare t text;
begin
  -- Lecture et écriture complètes pour les membres de l'organisation.
  foreach t in array array['ventures','segments','skills','accounts','prospects','prospect_ventures',
                           'signals','drafts','approvals','conversations','missions','messages']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_all on %I for all using (org_id in (select current_org_ids())) with check (org_id in (select current_org_ids()))', t, t);
  end loop;
  -- Ajout seul (versions et journal).
  foreach t in array array['briefs','skill_versions','actions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_read on %I for select using (org_id in (select current_org_ids()))', t, t);
    execute format('create policy %I_insert on %I for insert with check (org_id in (select current_org_ids()))', t, t);
  end loop;
end $$;

-- La vue des briefs courants respecte la RLS de briefs.
alter view current_briefs set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Purge RGPD : prospects sans interaction depuis 12 mois
-- ---------------------------------------------------------------------------
-- Supprimer un brouillon supprime aussi sa validation (son résumé contient le nom du prospect).
create or replace function drafts_cleanup_approvals() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from approvals where kind = 'draft' and ref_id = old.id;
  return old;
end $$;

create trigger drafts_cleanup after delete on drafts
for each row execute function drafts_cleanup_approvals();

create or replace function purge_expired_prospects() returns int
language plpgsql security definer set search_path = public as $$
declare
  total int := 0;
  r record;
begin
  for r in
    with deleted as (delete from prospects where purge_after < now() returning org_id)
    select org_id, count(*)::int as n from deleted group by org_id
  loop
    insert into actions (org_id, agent, tool, result_summary)
    values (r.org_id, 'system', 'purge', r.n || ' prospect(s) supprimé(s) après 12 mois sans interaction');
    total := total + r.n;
  end loop;
  return total;
end $$;

-- Suppression manuelle d'un prospect (bouton de la fiche), sans données personnelles dans le journal.
create or replace function delete_prospect(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select org_id into o from prospects where id = p_id;
  if o is null or o not in (select current_org_ids()) then
    raise exception 'Prospect introuvable';
  end if;
  delete from prospects where id = p_id;
  insert into actions (org_id, agent, tool, result_summary)
  values (o, 'system', 'delete_prospect', 'Prospect supprimé à la demande');
end $$;

-- ---------------------------------------------------------------------------
-- Temps réel
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table prospect_ventures, drafts, approvals, missions;

-- ---------------------------------------------------------------------------
-- Durcissement Supabase : fonctions non appelables par l'API publique
-- ---------------------------------------------------------------------------
alter function set_updated_at() set search_path = public;
alter function normalize_linkedin_url(text) set search_path = public;
alter function prospects_set_key() set search_path = public;
alter function forbid_change() set search_path = public;
alter function forbid_action_change() set search_path = public;

revoke execute on function purge_expired_prospects() from public, anon, authenticated;
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function drafts_cleanup_approvals() from public, anon, authenticated;
revoke execute on function delete_prospect(uuid) from public, anon;
grant execute on function delete_prospect(uuid) to authenticated;
revoke execute on function current_org_ids() from public, anon;
grant execute on function current_org_ids() to authenticated;
