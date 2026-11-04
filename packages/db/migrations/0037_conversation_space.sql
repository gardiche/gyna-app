-- Deux espaces dans l'app : la prospection (trouver et approcher des personnes ou des établissements) et la création
-- (veille, pubs, posts, campagnes). Une conversation est rattachée à l'espace où elle a été ouverte ; vide pour les
-- conversations d'avant, dont l'espace se déduit des sous-agents lancés ou du titre.
alter table conversations add column if not exists space text check (space in ('prospection', 'creation'));
