-- Visuels des pubs : bibliothèque d'images d'une venture (logo, photos, inspirations) et images
-- générées pour une pub à la demande d'un associé. Les fichiers sont dans le bucket « gyna-media ».
create table if not exists venture_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  venture_id uuid not null references ventures(id) on delete cascade,
  kind text not null check (kind in ('logo', 'photo', 'inspiration', 'charte')),
  url text not null,
  path text not null,
  -- Ce que l'associé en dit : « j'aime la typo, pas les couleurs ».
  note text,
  -- Ce que l'agent Ads y a vu avec l'outil de vision ; repris dans la consigne de génération.
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venture_assets_venture on venture_assets (venture_id, created_at desc);

create table if not exists ad_images (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  ad_id uuid not null references ads(id) on delete cascade,
  url text not null,
  path text not null,
  prompt text not null,
  aspect text not null default 'square' check (aspect in ('square', 'portrait', 'landscape')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists ad_images_ad on ad_images (ad_id, created_at desc);

create trigger venture_assets_updated_at before update on venture_assets for each row execute function set_updated_at();

alter table venture_assets enable row level security;
alter table ad_images enable row level security;
create policy venture_assets_all on venture_assets for all
  using (org_id in (select current_org_ids())) with check (org_id in (select current_org_ids()));
create policy ad_images_all on ad_images for all
  using (org_id in (select current_org_ids())) with check (org_id in (select current_org_ids()));

grant select on venture_assets, ad_images to gyna_mcp;
grant update (description) on venture_assets to gyna_mcp;
