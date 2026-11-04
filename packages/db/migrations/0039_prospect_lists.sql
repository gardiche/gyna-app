-- Listes de prospects : un ensemble nommé de prospects, avec sa propre échelle de classement.
-- Une demande qui constitue un ensemble à part (les participants d'un événement, les membres d'une communauté, une
-- liste fournie par un associé) et qui le classe selon ses propres critères le range ici, à côté de la note du brief
-- (prospect_ventures.fit), au lieu de l'écraser ou de s'y mélanger. Le classement, sa raison, des attributs libres
-- (rôle, projet, stade…) et les sources appartiennent à la liste ; le prospect, lui, reste unique.
create table if not exists prospect_lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  venture_id uuid not null references ventures(id) on delete cascade,
  -- Référence courte (L1, L2…) que les agents recopient sans se tromper ; unique dans la venture.
  seq int not null,
  name text not null,
  purpose text,
  -- Échelle de classement propre à la liste : [{ "label": "A", "meaning": "Prioritaire : …" }, …].
  scale jsonb not null default '[]'::jsonb,
  mission_id uuid references missions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venture_id, seq)
);
create unique index if not exists prospect_lists_name on prospect_lists (venture_id, lower(name));

create table if not exists prospect_list_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  list_id uuid not null references prospect_lists(id) on delete cascade,
  prospect_venture_id uuid not null references prospect_ventures(id) on delete cascade,
  grade text,
  reason text,
  -- Champs propres à la liste, libres : { "rôle": "porteur", "projet": "…", "stade": "…" }.
  attributes jsonb not null default '{}'::jsonb,
  -- Sources directes : [{ "url": "…", "date": "2026-10-12T13:14:34Z", "note": "…" }].
  sources jsonb not null default '[]'::jsonb,
  mission_id uuid references missions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_id, prospect_venture_id)
);
create index if not exists prospect_list_members_pv on prospect_list_members (prospect_venture_id);

create trigger prospect_lists_updated_at before update on prospect_lists for each row execute function set_updated_at();
create trigger prospect_list_members_updated_at before update on prospect_list_members for each row execute function set_updated_at();

alter table prospect_lists enable row level security;
alter table prospect_list_members enable row level security;

create policy prospect_lists_all on prospect_lists for all
  using (org_id in (select current_org_ids())) with check (org_id in (select current_org_ids()));
create policy prospect_list_members_all on prospect_list_members for all
  using (org_id in (select current_org_ids())) with check (org_id in (select current_org_ids()));

-- Une personne en prospection ne voit que les listes des ventures qui lui sont ouvertes.
create policy prospect_lists_prospector on prospect_lists for all
  using (org_id in (select current_prospector_org_ids()) and venture_id in (select current_prospector_venture_ids()))
  with check (org_id in (select current_prospector_org_ids()) and venture_id in (select current_prospector_venture_ids()));
create policy prospect_list_members_prospector on prospect_list_members for all
  using (org_id in (select current_prospector_org_ids())
         and list_id in (select id from prospect_lists where venture_id in (select current_prospector_venture_ids())))
  with check (org_id in (select current_prospector_org_ids()));

grant select, insert, update on prospect_lists, prospect_list_members to gyna_mcp;
