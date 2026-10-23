-- Accès « prospection » (rôle prospector) : le chat avec Gyna (ses propres conversations seulement),
-- les prospects et la validation des messages de prospection. Rien sur les pubs, les posts, la veille,
-- les campagnes ni les skills. Ses missions sont marquées « prospection » : le serveur MCP et le plugin
-- Hermes y refusent tout outil hors prospection.

create or replace function current_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from members where user_id = auth.uid() and role not in ('campaign_viewer', 'prospector')
$$;

create or replace function current_prospector_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from members where user_id = auth.uid() and role = 'prospector'
$$;
revoke execute on function current_prospector_org_ids() from public, anon;
grant execute on function current_prospector_org_ids() to authenticated;

-- Périmètre d'une mission : « full » (associés, pilotage) ou « prospection ».
alter table missions add column if not exists scope text not null default 'full'
  check (scope in ('full', 'prospection'));

-- Une mission créée par une personne en prospection est toujours « prospection », quoi qu'envoie le client.
create or replace function missions_set_scope() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from members where user_id = auth.uid() and org_id = new.org_id and role = 'prospector') then
    new.scope := 'prospection';
  end if;
  return new;
end $$;
revoke execute on function missions_set_scope() from public, anon, authenticated;
drop trigger if exists missions_set_scope on missions;
create trigger missions_set_scope before insert on missions for each row execute function missions_set_scope();

-- Lecture du contexte de la venture.
create policy org_read_prospector on organizations for select using (id in (select current_prospector_org_ids()));
create policy ventures_read_prospector on ventures for select using (org_id in (select current_prospector_org_ids()));
create policy segments_read_prospector on segments for select using (org_id in (select current_prospector_org_ids()));
create policy briefs_read_prospector on briefs for select using (org_id in (select current_prospector_org_ids()));

-- Ses conversations, leurs messages et leurs missions, et rien de celles des autres.
create policy conversations_prospector on conversations for all
  using (org_id in (select current_prospector_org_ids()) and created_by = auth.uid())
  with check (org_id in (select current_prospector_org_ids()) and created_by = auth.uid());
create policy messages_prospector on messages for all
  using (org_id in (select current_prospector_org_ids())
         and conversation_id in (select id from conversations where created_by = auth.uid()))
  with check (org_id in (select current_prospector_org_ids())
              and conversation_id in (select id from conversations where created_by = auth.uid()));
create policy missions_prospector on missions for all
  using (org_id in (select current_prospector_org_ids())
         and conversation_id in (select id from conversations where created_by = auth.uid()))
  with check (org_id in (select current_prospector_org_ids())
              and conversation_id in (select id from conversations where created_by = auth.uid()));

-- Les prospects, leurs signaux et les messages de prospection.
create policy prospects_prospector on prospects for all
  using (org_id in (select current_prospector_org_ids())) with check (org_id in (select current_prospector_org_ids()));
create policy prospect_ventures_prospector on prospect_ventures for all
  using (org_id in (select current_prospector_org_ids())) with check (org_id in (select current_prospector_org_ids()));
create policy signals_prospector on signals for all
  using (org_id in (select current_prospector_org_ids())) with check (org_id in (select current_prospector_org_ids()));
create policy drafts_prospector on drafts for all
  using (org_id in (select current_prospector_org_ids())) with check (org_id in (select current_prospector_org_ids()));
create policy approvals_prospector on approvals for all
  using (org_id in (select current_prospector_org_ids()) and kind = 'draft')
  with check (org_id in (select current_prospector_org_ids()) and kind = 'draft');

-- Le journal de ses propres missions ; elle peut y ajouter ses décisions sur les brouillons.
create policy actions_read_prospector on actions for select
  using (org_id in (select current_prospector_org_ids())
         and mission_id in (select m.id from missions m join conversations c on c.id = m.conversation_id where c.created_by = auth.uid()));
create policy actions_insert_prospector on actions for insert
  with check (org_id in (select current_prospector_org_ids()));
