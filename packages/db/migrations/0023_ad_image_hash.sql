-- Visuel d'une pub déposé dans la bibliothèque d'images du compte publicitaire Meta : son empreinte,
-- que l'agent Campagnes donne telle quelle en créant la pub (il n'a pas d'outil de dépôt fiable).
alter table ad_images add column if not exists meta_hash text;
