-- Mode essai : tester les agents sur de vraies données sans polluer le CRM ni dépenser.
--
-- Une venture d'essai est une copie de travail d'une vraie venture : même brief, mêmes segments, et un échantillon de ses
-- prospects rattachés à elle (tout ce qui est propre à une venture, note, état, chaleur, signaux, brouillons, listes,
-- vit dans prospect_ventures et reste donc isolé). Les missions lancées sur une venture d'essai sont des missions d'essai :
-- elles ne touchent qu'à elle, jamais à une vraie venture, et inversement (garde du serveur MCP).
alter table ventures add column if not exists is_sandbox boolean not null default false;
alter table missions add column if not exists sandbox boolean not null default false;
-- Prospects créés par une mission d'essai : supprimés à la réinitialisation s'ils ne servent à aucune autre venture.
alter table prospects add column if not exists sandbox_origin boolean not null default false;

-- Vide et remplit une venture d'essai : sans contrôle d'accès, réservée au code SQL de confiance.
create or replace function sandbox_reseed(p_venture uuid, p_count int default 40) returns int
language plpgsql security definer set search_path = public as $$
declare
  v ventures;
  src uuid;
  n int;
begin
  select * into v from ventures where id = p_venture and is_sandbox;
  if not found then raise exception 'Venture d''essai introuvable'; end if;
  -- La vraie venture dont elle est la copie : même nom de code, sans le suffixe « -essai ».
  select id into src from ventures where org_id = v.org_id and not is_sandbox and slug = regexp_replace(v.slug, '-essai$', '');

  delete from prospect_lists where venture_id = v.id;
  delete from signals where venture_id = v.id;
  delete from companies where venture_id = v.id;
  delete from prospect_ventures where venture_id = v.id;
  delete from prospects p where p.org_id = v.org_id and p.sandbox_origin
    and not exists (select 1 from prospect_ventures pv where pv.prospect_id = p.id);
  delete from briefs where venture_id = v.id;
  delete from segments where venture_id = v.id;
  -- Les missions d'essai déjà lancées restent dans l'historique, détachées de leurs lignes supprimées.

  if src is null then return 0; end if;

  insert into briefs (org_id, venture_id, version, content, recency_days)
    select v.org_id, v.id, 1, b.content, b.recency_days from current_briefs b where b.venture_id = src;
  insert into segments (org_id, venture_id, name, criteria)
    select v.org_id, v.id, s.name, s.criteria from segments s where s.venture_id = src;

  -- Un échantillon varié, à trier à neuf : on préfère les profils déjà lus récemment (leur relecture est gratuite).
  insert into prospect_ventures (org_id, prospect_id, venture_id, status)
    select v.org_id, p.id, v.id, 'to_review'
    from prospect_ventures pv join prospects p on p.id = pv.prospect_id
    where pv.venture_id = src
    order by (p.profile_fetched_at is not null) desc, random()
    limit p_count;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function sandbox_reseed(uuid, int) from public, anon, authenticated;

-- Création d'une venture d'essai à partir d'une vraie venture, et réinitialisation : réservées aux associés.
create or replace function sandbox_reset(p_venture uuid, p_count int default 40) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ventures where id = p_venture and is_sandbox and org_id in (select current_org_ids())) then
    raise exception 'Venture d''essai introuvable ou accès refusé';
  end if;
  return sandbox_reseed(p_venture, p_count);
end $$;
revoke execute on function sandbox_reset(uuid, int) from public, anon;
grant execute on function sandbox_reset(uuid, int) to authenticated;

create or replace function sandbox_create(p_source uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s ventures;
  new_id uuid;
begin
  select * into s from ventures where id = p_source and not is_sandbox and org_id in (select current_org_ids());
  if not found then raise exception 'Venture introuvable ou accès refusé'; end if;
  insert into ventures (org_id, name, slug, color, enrollment_goal, is_sandbox)
    values (s.org_id, s.name || ' · essai', s.slug || '-essai', s.color, s.enrollment_goal, true)
    on conflict (org_id, slug) do update set updated_at = now()
    returning id into new_id;
  perform sandbox_reseed(new_id);
  return new_id;
end $$;
revoke execute on function sandbox_create(uuid) from public, anon;
grant execute on function sandbox_create(uuid) to authenticated;
