-- Accès « suivi des campagnes » en lecture seule (rôle campaign_viewer).
-- current_org_ids() ne rend plus que les organisations dont l'utilisateur est membre à part entière :
-- toutes les règles existantes (prospects, conversations, posts, skills…) se ferment d'elles-mêmes
-- pour un invité. Des règles de lecture dédiées lui ouvrent seulement ce que montre la page Campagnes.

create or replace function current_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from members where user_id = auth.uid() and role <> 'campaign_viewer'
$$;

create or replace function current_viewer_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from members where user_id = auth.uid() and role = 'campaign_viewer'
$$;
revoke execute on function current_viewer_org_ids() from public, anon;
grant execute on function current_viewer_org_ids() to authenticated;

-- Chacun lit sa propre fiche de membre (l'app en a besoin pour ouvrir la session).
create policy members_read_self on members for select using (user_id = auth.uid());

create policy org_read_viewer on organizations for select using (id in (select current_viewer_org_ids()));
create policy ventures_read_viewer on ventures for select using (org_id in (select current_viewer_org_ids()));
create policy ad_pilots_read_viewer on ad_pilots for select using (org_id in (select current_viewer_org_ids()));
create policy campaign_docs_read_viewer on campaign_docs for select using (org_id in (select current_viewer_org_ids()));

-- Les pubs seulement (pas les posts), et leurs visuels.
create policy ad_batches_read_viewer on ad_batches for select
  using (org_id in (select current_viewer_org_ids()) and kind = 'ad');
create policy ads_read_viewer on ads for select
  using (org_id in (select current_viewer_org_ids())
         and exists (select 1 from ad_batches b where b.id = ads.batch_id and b.kind = 'ad'));
create policy ad_images_read_viewer on ad_images for select
  using (org_id in (select current_viewer_org_ids())
         and exists (select 1 from ads a join ad_batches b on b.id = a.batch_id where a.id = ad_images.ad_id and b.kind = 'ad'));

-- Le journal de l'agent Campagnes et des associés sur le pilotage, rien d'autre.
create policy actions_read_viewer on actions for select
  using (org_id in (select current_viewer_org_ids())
         and agent in ('campagnes', 'associe')
         and tool in ('record_ad_launch', 'log_action', 'save_campaign_doc', 'subagent_complete', 'pilot_start', 'pilot_stop'));
