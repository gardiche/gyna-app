-- Un post Instagram peut partir en même temps sur la Page Facebook de la venture, si l'associé le demande.
alter table ads add column if not exists also_facebook boolean not null default false;
alter table ads add column if not exists facebook_url text;
