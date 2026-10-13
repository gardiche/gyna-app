-- Pilotage autonome des pubs Meta : un associé fixe une enveloppe par venture (budget total, dates, coût visé
-- par pré-inscription) ; l'agent Campagnes lance les pubs approuvées et pilote dans cette enveloppe.
-- La vraie limite de dépense reste le plafond du compte publicitaire, posé par un associé chez Meta.
create table if not exists ad_pilots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  venture_id uuid not null unique references ventures(id) on delete cascade,
  platform text not null default 'meta' check (platform in ('meta')),
  -- paused : l'agent ne lance ni ne modifie rien, et met en pause ce qui tourne.
  status text not null default 'paused' check (status in ('active', 'paused')),
  total_budget_eur numeric(10,2) not null check (total_budget_eur > 0),
  target_cost_eur numeric(10,2) check (target_cost_eur > 0),
  starts_on date not null,
  ends_on date not null,
  -- Conversation où l'agent rend compte de ses passages quotidiens.
  conversation_id uuid references conversations(id) on delete set null,
  last_run_on date,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create trigger ad_pilots_updated_at before update on ad_pilots for each row execute function set_updated_at();

alter table ad_pilots enable row level security;
create policy ad_pilots_all on ad_pilots for all
  using (org_id in (select current_org_ids())) with check (org_id in (select current_org_ids()));

grant select on ad_pilots to gyna_mcp;

-- Ce qu'une pub approuvée est devenue chez Meta : son identifiant là-bas et son état, déclarés par l'agent.
alter table ads add column if not exists external_id text;
alter table ads add column if not exists external_status text check (external_status in ('paused', 'active', 'stopped'));
alter table ads add column if not exists launched_at timestamptz;

grant update (external_id, external_status, launched_at) on ads to gyna_mcp;
