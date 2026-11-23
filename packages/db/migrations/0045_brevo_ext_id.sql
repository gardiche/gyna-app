-- Brevo : l'identifiant d'un contact sans e-mail est celui que Brevo affiche dans sa colonne « Contact ».
-- On retient l'identifiant (ext_id) sous lequel chaque ligne est partie, pour pouvoir le renommer (nom lisible) ou
-- rattacher l'e-mail quand on le trouve plus tard, au lieu de créer un second contact.
alter table prospect_ventures add column if not exists brevo_ext_id text;
alter table companies add column if not exists brevo_ext_id text;

-- Les envois faits jusqu'ici sans e-mail portaient un identifiant tiré de la ligne.
update prospect_ventures pv
   set brevo_ext_id = 'gyna-pv-' || pv.id::text
  from prospects p
 where p.id = pv.prospect_id and pv.brevo_synced_at is not null and pv.brevo_ext_id is null
   and coalesce(p.email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$';
update companies c
   set brevo_ext_id = 'gyna-co-' || c.id::text
 where c.brevo_synced_at is not null and c.brevo_ext_id is null
   and coalesce(c.email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$';
