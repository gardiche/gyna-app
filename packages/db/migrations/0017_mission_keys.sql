-- Jeton de mission court. Le jeton signé (JWT, plusieurs centaines de caractères) était parfois mal
-- recopié par les agents d'une délégation à l'autre, et le serveur MCP le refusait. L'app donne
-- désormais à chaque mission une clé courte ; seule son empreinte est gardée ici, et le MCP retrouve
-- la mission par cette empreinte.
alter table missions add column if not exists token_hash text unique;
alter table missions add column if not exists token_expires_at timestamptz;
