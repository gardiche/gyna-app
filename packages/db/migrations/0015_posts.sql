-- Posts pour les comptes LinkedIn et Instagram : mêmes lots et même validation que les pubs,
-- avec un auteur (page ou personne), des diapositives pour les carrousels et une date prévue.
alter table ad_batches add column if not exists kind text not null default 'ad' check (kind in ('ad', 'post'));
-- Qui publie : « Page L'Amorce », ou le prénom d'un associé pour un profil personnel.
alter table ad_batches add column if not exists author text;
alter table ad_batches drop constraint if exists ad_batches_platform_check;
alter table ad_batches add constraint ad_batches_platform_check
  check (platform in ('meta', 'linkedin', 'google', 'tiktok', 'instagram', 'other'));

-- Diapositives d'un carrousel ou d'un document : [{ "text": "…" }, …], la première est la couverture.
alter table ads add column if not exists slides jsonb;
alter table ads add column if not exists scheduled_for date;
alter table ads add column if not exists published_at timestamptz;

-- Un post LinkedIn peut aller jusqu'à 3 000 caractères.
alter table ads drop constraint if exists ads_primary_text_check;
alter table ads add constraint ads_primary_text_check check (char_length(primary_text) <= 3000);

create index if not exists ads_scheduled on ads (org_id, scheduled_for) where scheduled_for is not null;

create or replace function ads_keep_original() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.original := jsonb_build_object(
      'headline', new.headline, 'primary_text', new.primary_text, 'description', new.description,
      'cta', new.cta, 'visual_brief', new.visual_brief, 'slides', new.slides);
  else
    new.original := old.original;
  end if;
  return new;
end $$;
