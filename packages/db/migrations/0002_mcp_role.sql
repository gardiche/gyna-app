-- Rôle Postgres dédié au serveur MCP Gyna.
-- Il contourne la RLS (le MCP fixe lui-même org_id à partir du jeton de mission signé),
-- mais n'a accès qu'aux tables dont les agents ont besoin.
--
-- Après cette migration, donnez-lui un mot de passe depuis l'éditeur SQL de Supabase :
--   alter role gyna_mcp with password '<mot de passe long et aléatoire>';
-- puis utilisez dans DATABASE_URL l'utilisateur "gyna_mcp.<référence du projet>" du pooler.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gyna_mcp') then
    create role gyna_mcp login bypassrls;
  end if;
end $$;

grant usage on schema public to gyna_mcp;
grant usage on all sequences in schema public to gyna_mcp;

grant select on organizations, ventures, segments, current_briefs, briefs, skills, skill_versions to gyna_mcp;
grant select, insert, update on prospects, prospect_ventures, signals, accounts, drafts to gyna_mcp;
grant select, insert on approvals, actions to gyna_mcp;
grant select, update on missions to gyna_mcp;
