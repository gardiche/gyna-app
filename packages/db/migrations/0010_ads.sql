-- Création de pubs : l'agent Ads propose des lots de pubs (texte et brief visuel) qu'un associé
-- valide, corrige ou refuse une à une. Rien n'est publié par les agents.
alter type agent_name add value if not exists 'ads';
alter type approval_kind add value if not exists 'ad_batch';

create table if not exists ad_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  venture_id uuid not null references ventures(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  title text not null,
  platform text not null check (platform in ('meta', 'linkedin', 'google', 'tiktok', 'other')),
  -- Ce que le lot cherche à obtenir, pour quel public, et sur quoi les angles s'appuient.
  objective text,
  audience text,
  rationale text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ad_batches_venture on ad_batches (venture_id, created_at desc);

create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  batch_id uuid not null references ad_batches(id) on delete cascade,
  position int not null default 0,
  format text check (format in ('image', 'video', 'carousel', 'text', 'document', 'other')),
  template text,
  angle text not null,
  awareness text check (awareness in ('unaware', 'problem', 'solution', 'product')),
  headline text,
  primary_text text not null check (char_length(primary_text) <= 2200),
  description text,
  cta text,
  landing_url text,
  visual_brief text,
  image_prompt text,
  -- Sur quoi la pub s'appuie : champ du brief, pub concurrente, constat de la veille, retour d'associé.
  grounding text not null,
  hypothesis text,
  -- Texte proposé par l'agent, figé à l'insertion ; les colonnes ci-dessus portent la version corrigée.
  original jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ads_batch on ads (batch_id, position);
create index if not exists ads_decided on ads (org_id, decided_at desc) where decided_at is not null;

create or replace function ads_keep_original() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.original := jsonb_build_object(
      'headline', new.headline, 'primary_text', new.primary_text, 'description', new.description,
      'cta', new.cta, 'visual_brief', new.visual_brief);
  else
    new.original := old.original;
  end if;
  return new;
end $$;

create trigger ads_keep_original before insert or update on ads
for each row execute function ads_keep_original();
create trigger ad_batches_updated_at before update on ad_batches for each row execute function set_updated_at();
create trigger ads_updated_at before update on ads for each row execute function set_updated_at();

alter table ad_batches enable row level security;
alter table ads enable row level security;
create policy ad_batches_all on ad_batches for all
  using (org_id in (select current_org_ids())) with check (org_id in (select current_org_ids()));
create policy ads_all on ads for all
  using (org_id in (select current_org_ids())) with check (org_id in (select current_org_ids()));

grant select, insert on ad_batches, ads to gyna_mcp;

-- Supprimer un lot supprime aussi sa validation.
create or replace function ad_batches_cleanup_approvals() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from approvals where kind = 'ad_batch' and ref_id = old.id;
  return old;
end $$;

create trigger ad_batches_cleanup after delete on ad_batches
for each row execute function ad_batches_cleanup_approvals();

revoke execute on function ads_keep_original() from public, anon, authenticated;
revoke execute on function ad_batches_cleanup_approvals() from public, anon, authenticated;
