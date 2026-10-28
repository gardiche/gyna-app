-- Accès « prospection » limité à certaines ventures : members.venture_ids (null = toutes les ventures).
-- Une personne limitée ne voit, de bout en bout, que ces ventures : la venture, son brief et ses segments, ses
-- prospects, signaux, brouillons et entreprises, et les conversations et missions qui la concernent.
-- Le serveur MCP applique la même limite aux outils (voir venture() dans apps/mcp/src/tools.ts).
alter table members add column if not exists venture_ids uuid[];
alter table allowed_emails add column if not exists venture_ids uuid[];

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into members (org_id, user_id, display_name, role, venture_ids)
  select a.org_id, new.id, coalesce(a.display_name, split_part(new.email, '@', 1)), a.role, a.venture_ids
  from allowed_emails a
  where lower(a.email) = lower(new.email)
  on conflict do nothing;
  return new;
end $$;

create or replace function current_prospector_venture_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select v.id from ventures v join members m on m.org_id = v.org_id
  where m.user_id = auth.uid() and m.role = 'prospector' and (m.venture_ids is null or v.id = any(m.venture_ids))
$$;
revoke execute on function current_prospector_venture_ids() from public, anon;
grant execute on function current_prospector_venture_ids() to authenticated;

drop policy if exists ventures_read_prospector on ventures;
create policy ventures_read_prospector on ventures for select using (id in (select current_prospector_venture_ids()));
drop policy if exists segments_read_prospector on segments;
create policy segments_read_prospector on segments for select using (venture_id in (select current_prospector_venture_ids()));
drop policy if exists briefs_read_prospector on briefs;
create policy briefs_read_prospector on briefs for select using (venture_id in (select current_prospector_venture_ids()));

drop policy if exists conversations_prospector on conversations;
create policy conversations_prospector on conversations for all
  using (org_id in (select current_prospector_org_ids()) and created_by = auth.uid()
         and (venture_id is null or venture_id in (select current_prospector_venture_ids())))
  with check (org_id in (select current_prospector_org_ids()) and created_by = auth.uid()
              and (venture_id is null or venture_id in (select current_prospector_venture_ids())));
drop policy if exists missions_prospector on missions;
create policy missions_prospector on missions for all
  using (org_id in (select current_prospector_org_ids())
         and (venture_id is null or venture_id in (select current_prospector_venture_ids()))
         and conversation_id in (select id from conversations where created_by = auth.uid()))
  with check (org_id in (select current_prospector_org_ids())
              and (venture_id is null or venture_id in (select current_prospector_venture_ids()))
              and conversation_id in (select id from conversations where created_by = auth.uid()));

drop policy if exists prospect_ventures_prospector on prospect_ventures;
create policy prospect_ventures_prospector on prospect_ventures for all
  using (org_id in (select current_prospector_org_ids()) and venture_id in (select current_prospector_venture_ids()))
  with check (org_id in (select current_prospector_org_ids()) and venture_id in (select current_prospector_venture_ids()));
drop policy if exists prospects_prospector on prospects;
create policy prospects_prospector on prospects for all
  using (org_id in (select current_prospector_org_ids())
         and id in (select prospect_id from prospect_ventures where venture_id in (select current_prospector_venture_ids())))
  with check (org_id in (select current_prospector_org_ids()));
drop policy if exists signals_prospector on signals;
create policy signals_prospector on signals for all
  using (org_id in (select current_prospector_org_ids()) and (venture_id is null or venture_id in (select current_prospector_venture_ids())))
  with check (org_id in (select current_prospector_org_ids()) and (venture_id is null or venture_id in (select current_prospector_venture_ids())));
drop policy if exists drafts_prospector on drafts;
create policy drafts_prospector on drafts for all
  using (org_id in (select current_prospector_org_ids())
         and prospect_venture_id in (select id from prospect_ventures where venture_id in (select current_prospector_venture_ids())))
  with check (org_id in (select current_prospector_org_ids()));

-- Les entreprises (sourcing par lieu) : mêmes ventures seulement.
create policy companies_prospector on companies for all
  using (org_id in (select current_prospector_org_ids()) and venture_id in (select current_prospector_venture_ids()))
  with check (org_id in (select current_prospector_org_ids()) and venture_id in (select current_prospector_venture_ids()));

-- Les validations de messages : seulement celles des brouillons qu'elle peut voir (la règle de drafts s'applique dans la sous-requête).
drop policy if exists approvals_prospector on approvals;
create policy approvals_prospector on approvals for all
  using (org_id in (select current_prospector_org_ids()) and kind = 'draft' and ref_id in (select id from drafts))
  with check (org_id in (select current_prospector_org_ids()) and kind = 'draft');
