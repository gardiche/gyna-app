-- Motif d'un refus de pub ou de post : un clic, pour que l'agent Ads apprenne de chaque refus (121 refus sur 169 pubs,
-- 4 raisons seulement avant ce motif). « nettoyage » marque un refus qui ne dit rien sur la qualité (lot remplacé, ménage).
alter table ads add column if not exists rejection_kind text
  check (rejection_kind in ('angle', 'texte', 'ton', 'visuel', 'charte', 'doublon', 'autre', 'nettoyage'));
