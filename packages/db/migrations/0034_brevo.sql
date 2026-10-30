-- Connecteur Brevo : une liste de contacts par venture, et l'e-mail des prospects et des entreprises.
-- L'e-mail se saisit à la main (ou viendra d'un enrichissement) ; brevo_synced_at dit quand la ligne est partie dans la liste.
alter table ventures add column if not exists brevo_list_id bigint;
alter table prospects add column if not exists email text;
alter table prospect_ventures add column if not exists brevo_synced_at timestamptz;
alter table companies add column if not exists email text;
alter table companies add column if not exists brevo_synced_at timestamptz;
