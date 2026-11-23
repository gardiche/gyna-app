-- Listes d'entreprises et sources lisibles par une personne en prospection.
--
-- 1. Une liste (un « segment » pour l'associé) peut maintenant contenir des entreprises, pas seulement des personnes :
--    une venture dont la cible est un établissement n'avait aucun moyen de se ranger en ensembles. Un membre de liste est
--    donc soit une personne (prospect_venture_id), soit une entreprise (company_id), jamais les deux.
-- 2. La page Prospects filtre par « source » (la mission qui a trouvé la ligne). Une personne en prospection ne lit que
--    ses propres missions : les sources trouvées par les associés lui restaient fermées. Cette fonction ne rend que
--    l'identifiant, la demande et la date des missions qui ont trouvé des lignes d'une venture qu'elle a le droit de voir.
alter table prospect_list_members add column if not exists company_id uuid references companies(id) on delete cascade;
alter table prospect_list_members alter column prospect_venture_id drop not null;
alter table prospect_list_members drop constraint if exists prospect_list_members_one_target;
alter table prospect_list_members add constraint prospect_list_members_one_target
  check ((prospect_venture_id is not null) <> (company_id is not null));
create unique index if not exists prospect_list_members_company_unique on prospect_list_members (list_id, company_id) where company_id is not null;
create index if not exists prospect_list_members_company on prospect_list_members (company_id) where company_id is not null;

create or replace function prospect_sources(p_venture uuid) returns table (id uuid, objective text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.objective, m.created_at
  from missions m
  where (
    p_venture in (select v.id from ventures v where v.org_id in (select current_org_ids()))
    or p_venture in (select current_prospector_venture_ids())
  ) and (
    m.id in (select pv.mission_id from prospect_ventures pv where pv.venture_id = p_venture and pv.mission_id is not null)
    or m.id in (select c.mission_id from companies c where c.venture_id = p_venture and c.mission_id is not null)
  )
$$;
revoke execute on function prospect_sources(uuid) from public, anon;
grant execute on function prospect_sources(uuid) to authenticated;
