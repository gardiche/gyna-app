-- Veille concurrentielle : concurrents d'une venture, leurs pubs observées dans les bibliothèques
-- publicitaires publiques, et la synthèse de la veille. Écrits par l'agent Veille via le MCP.
alter type agent_name add value if not exists 'veille';

create table if not exists competitors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  venture_id uuid not null references ventures(id) on delete cascade,
  name text not null,
  -- direct : même offre pour le même public ; indirect : autre réponse au même besoin.
  kind text not null default 'direct' check (kind in ('direct', 'indirect')),
  website text,
  linkedin_url text,
  facebook_url text,
  instagram_url text,
  -- Positionnement en une phrase, affiché sur la carte.
  summary text,
  -- Fiche complète en markdown : observé (avec source et date), déduit, implications.
  profile text,
  profiled_at timestamptz,
  mission_id uuid references missions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists competitors_venture_name on competitors (venture_id, lower(name));

create table if not exists competitor_ads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  platform text not null check (platform in ('meta', 'linkedin', 'google', 'tiktok', 'other')),
  -- Lien vers la pub dans la bibliothèque publicitaire ; sert de clé de dédoublonnage.
  url text not null,
  library_id text,
  started_at date,
  last_seen_at date,
  active boolean,
  format text check (format in ('image', 'video', 'carousel', 'text', 'document', 'other')),
  headline text,
  body text check (char_length(body) <= 3000),
  cta text,
  landing_url text,
  -- Analyse de la Veille.
  angle text,
  hook text,
  promise text,
  audience text,
  -- Portée publiée par la bibliothèque (fourchette), si elle existe.
  reach text,
  notes text,
  mission_id uuid references missions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competitor_id, url)
);

create index if not exists competitor_ads_competitor on competitor_ads (competitor_id, started_at desc);

-- Synthèse de la veille d'une venture : une ligne par version, la plus récente fait foi.
create table if not exists watch_summaries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  venture_id uuid not null references ventures(id) on delete cascade,
  content text not null,
  mission_id uuid references missions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists watch_summaries_venture on watch_summaries (venture_id, created_at desc);

create trigger competitors_updated_at before update on competitors for each row execute function set_updated_at();
create trigger competitor_ads_updated_at before update on competitor_ads for each row execute function set_updated_at();
create trigger watch_summaries_immutable before update on watch_summaries for each row execute function forbid_change();

alter table competitors enable row level security;
alter table competitor_ads enable row level security;
alter table watch_summaries enable row level security;
create policy competitors_all on competitors for all
  using (org_id in (select current_org_ids())) with check (org_id in (select current_org_ids()));
create policy competitor_ads_all on competitor_ads for all
  using (org_id in (select current_org_ids())) with check (org_id in (select current_org_ids()));
create policy watch_summaries_read on watch_summaries for select using (org_id in (select current_org_ids()));
create policy watch_summaries_insert on watch_summaries for insert with check (org_id in (select current_org_ids()));

grant select, insert, update on competitors, competitor_ads to gyna_mcp;
grant select, insert on watch_summaries to gyna_mcp;
