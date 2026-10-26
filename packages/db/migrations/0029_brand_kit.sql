-- Charte de marque par venture : logo, palette, polices, ton, interdits, formats, cible, positionnement
-- et mentions obligatoires, au même endroit. Les consignes de marque ne vivent plus dans des skills ni
-- dans le chat ; l'agent Ads les lit (get_brand_kit) et l'app les appliquera de façon déterministe.
-- Une ligne par version (ajout seul, comme le brief) ; la version courante est la plus haute.
-- Pas d'accès pour les rôles campaign_viewer et prospector : current_org_ids() les exclut.
create table if not exists brand_kits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  venture_id uuid not null references ventures(id) on delete cascade,
  version int not null,
  -- Image de la bibliothèque (venture_assets, kind « logo »). Sans clé étrangère : les lignes sont
  -- immuables, et retirer une image de la bibliothèque ne doit ni bloquer ni réécrire une version.
  logo_asset_id uuid,
  -- Emplacement, palette, polices, ton, interdits, formats, cible, positionnement, mentions
  -- (forme validée par BrandKitContent dans @gyna/schemas).
  content jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (venture_id, version)
);

create index if not exists brand_kits_venture on brand_kits (venture_id, version desc);

create trigger brand_kits_immutable before update on brand_kits for each row execute function forbid_change();

alter table brand_kits enable row level security;
create policy brand_kits_read on brand_kits for select using (org_id in (select current_org_ids()));
create policy brand_kits_insert on brand_kits for insert with check (org_id in (select current_org_ids()));

grant select on brand_kits to gyna_mcp;
