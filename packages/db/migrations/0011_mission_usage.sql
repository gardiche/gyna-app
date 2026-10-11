-- Consommation de tokens d'une mission, relevée par le pont pendant qu'elle tourne :
-- { input, output, reasoning, total, calls, cache_hit_pct, model, subagent_tokens, subagent_runs }.
alter table missions add column if not exists usage jsonb not null default '{}'::jsonb;
