-- Connecteur Brevo : la liste de destination se choisit à l'envoi (la liste de la venture n'est plus que le choix par défaut).
-- On retient dans quelle liste chaque ligne est partie : une ligne déjà envoyée dans une liste peut partir dans une autre.
alter table prospect_ventures add column if not exists brevo_synced_list_id bigint;
alter table companies add column if not exists brevo_synced_list_id bigint;

-- Avant ce choix, tout partait dans la liste de la venture.
update prospect_ventures pv
   set brevo_synced_list_id = v.brevo_list_id
  from ventures v
 where v.id = pv.venture_id and pv.brevo_synced_at is not null and pv.brevo_synced_list_id is null;
update companies c
   set brevo_synced_list_id = v.brevo_list_id
  from ventures v
 where v.id = c.venture_id and c.brevo_synced_at is not null and c.brevo_synced_list_id is null;
