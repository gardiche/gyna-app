-- Deux niveaux après le sourcing : le tri (adéquation au persona, sur le profil complet) puis la qualification fine
-- (chaleur, sur les publications). Le tri range chaque prospect en A (cœur de cible), B, C, ou l'écarte.
alter table prospect_ventures add column if not exists fit text check (fit in ('A', 'B', 'C'));
alter table prospect_ventures add column if not exists fit_reason text;
alter table prospect_ventures add column if not exists triaged_at timestamptz;

create index if not exists prospect_ventures_fit on prospect_ventures (venture_id, fit) where fit is not null;

-- Profil complet lu par l'outil de tri : faits calculés par le code (ancienneté de fondateur, poste salarié en cours…)
-- et dates de lecture, pour ne pas payer deux fois la même lecture.
alter table prospects add column if not exists facts jsonb;
alter table prospects add column if not exists profile_fetched_at timestamptz;
alter table prospects add column if not exists posts_fetched_at timestamptz;
