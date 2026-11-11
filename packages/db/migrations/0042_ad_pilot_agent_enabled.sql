-- Surveillance seule : quand agent_enabled est faux, l'app garde l'enveloppe (pause automatique à la fin de la période
-- ou quand le budget est dépensé) mais ne lance pas le passage quotidien de l'agent Campagnes, qui pourrait créer ou
-- lancer des pubs. Utile quand les associés tiennent eux-mêmes la campagne.
alter table ad_pilots add column if not exists agent_enabled boolean not null default true;
