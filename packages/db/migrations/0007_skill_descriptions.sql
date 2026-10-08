-- Description des skills : ce que fait le skill et quand l'utiliser, à la troisième personne.
-- Renvoyée par get_agent_skills pour que l'agent sache à quel moment appliquer chaque skill.
alter table skills add column if not exists description text;
alter table skill_proposals add column if not exists description text;
