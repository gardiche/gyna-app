-- Fiche de tâche : ce que Gyna confie à un sous-agent, écrit une fois et lu par lui, au lieu d'un texte libre recopié
-- dans la délégation. Chaque tâche a un objectif, le contexte retenu pour toute la mission, les critères de l'associé
-- dans ses mots, ce qu'elle couvre (et ce que couvrent les autres), ce qu'elle doit rendre, et à la fin le compte rendu
-- structuré du sous-agent. La demande de l'associé vient des messages, jamais d'une reformulation.
create table if not exists agent_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  venture_id uuid references ventures(id) on delete set null,
  -- Référence courte (T1, T2…) que le sous-agent recopie sans se tromper ; unique dans la mission.
  seq int not null,
  agent agent_name not null,
  objective text not null,
  background text not null,
  criteria text[] not null default '{}',
  exclusions text[] not null default '{}',
  scope text not null,
  deliverable text not null,
  budget_eur numeric(8, 2),
  inputs jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'done', 'partial', 'failed')),
  understood text,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (mission_id, seq)
);

create index if not exists agent_tasks_mission on agent_tasks (mission_id, seq);

alter table agent_tasks enable row level security;
create policy agent_tasks_select on agent_tasks for select using (org_id in (select current_org_ids()));

grant select, insert, update on agent_tasks to gyna_mcp;
-- Le serveur MCP relit la demande de l'associé pour la mission (messages.role = 'user'), qu'il ne reformule pas.
grant select on messages to gyna_mcp;
