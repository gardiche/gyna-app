-- Entreprises trouvées autour d'un lieu (Google Maps via Apify) : données brutes, sans personne derrière.
-- Pour les ventures dont la cible est un établissement (Pressy Services) plutôt qu'un profil LinkedIn.
-- Le potentiel de linge se juge après coup, avec Gyna, sans toucher aux données brutes.
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  venture_id uuid not null references ventures(id) on delete cascade,
  -- Identifiant du lieu chez Google Maps : clé de dédoublonnage par venture.
  place_id text not null,
  name text not null,
  category text,
  categories text[] not null default '{}',
  address text,
  city text,
  postal_code text,
  phone text,
  website text,
  rating numeric(2, 1),
  reviews_count int,
  lat double precision,
  lng double precision,
  maps_url text,
  segment_id uuid references segments(id) on delete set null,
  -- Recherche qui l'a fait remonter (« hôtel »), et lieu cherché.
  search_term text,
  search_location text,
  -- Jugement du potentiel de linge, posé ensuite : fort, possible, faible ou écarté (hors sujet).
  linen_potential text check (linen_potential in ('fort', 'possible', 'faible', 'ecarte')),
  linen_reason text,
  rated_at timestamptz,
  mission_id uuid references missions(id) on delete set null,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venture_id, place_id)
);

create index if not exists companies_venture on companies (venture_id, linen_potential, created_at desc);

create trigger companies_updated_at before update on companies for each row execute function set_updated_at();

alter table companies enable row level security;
create policy companies_all on companies for all
  using (org_id in (select current_org_ids())) with check (org_id in (select current_org_ids()));

grant select, insert, update on companies to gyna_mcp;
