-- Le serveur MCP lit members.venture_ids pour limiter une mission de prospection aux ventures de la personne
-- qui l'a lancée (venture() dans apps/mcp/src/tools.ts, migration 0033). Sans ce droit, tout outil appelé dans
-- une mission de prospection échouait avec « permission denied for table members » et Hermes suspendait le serveur.
-- Lecture de ces trois colonnes seulement (gyna_mcp ignore déjà la RLS).
grant select (user_id, org_id, venture_ids) on members to gyna_mcp;
