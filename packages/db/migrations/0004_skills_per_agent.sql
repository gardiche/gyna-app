-- Skills attribués par agent : agent nul = skill partagé par tous les agents ;
-- un skill désactivé n'est plus chargé par les agents.
alter table skills alter column agent drop not null;
alter table skills add column if not exists active boolean not null default true;
create index if not exists skills_org_agent_idx on skills (org_id, agent) where active;
