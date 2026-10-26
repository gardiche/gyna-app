-- Finition des visuels générés : l'app recadre au format de la charte, pose le vrai logo et vérifie le résultat
-- (format, couleurs de la palette, zone du logo, textes). Le relevé est gardé avec l'image.
alter table ad_images add column if not exists checks jsonb;
