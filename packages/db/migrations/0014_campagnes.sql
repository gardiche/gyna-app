-- Gestion de campagnes : l'agent Campagnes rédige le plan de mesure, le plan de campagne et les bilans
-- d'une venture. Une ligne par version, la plus récente de chaque type fait foi. Rien n'est dépensé par les agents.
alter type agent_name add value if not exists 'campagnes';

create table if not exists campaign_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  venture_id uuid not null references ventures(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  -- mesure : ce qu'on mesure et comment ; plan : structure, budget, règles de décision ; bilan : lecture des résultats et recommandations.
  kind text not null check (kind in ('mesure', 'plan', 'bilan')),
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists campaign_docs_venture on campaign_docs (venture_id, kind, created_at desc);

create trigger campaign_docs_immutable before update on campaign_docs for each row execute function forbid_change();

alter table campaign_docs enable row level security;
create policy campaign_docs_read on campaign_docs for select using (org_id in (select current_org_ids()));
create policy campaign_docs_insert on campaign_docs for insert with check (org_id in (select current_org_ids()));

grant select, insert on campaign_docs to gyna_mcp;
