-- Image brute (avant la pose du logo) d'un visuel généré : c'est elle qu'on renvoie au générateur pour une retouche,
-- pour ne pas lui rendre un logo déjà posé.
alter table ad_images add column if not exists raw_url text;
