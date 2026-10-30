-- Source de l'e-mail d'une entreprise lu sur son site par l'outil find_company_emails : page où l'adresse est publiée,
-- date de la lecture, et date du dernier passage (même sans résultat, pour ne pas relire le même site en boucle).
-- Un e-mail saisi à la main n'a ni source ni date : l'outil ne l'écrase jamais.
alter table companies add column if not exists email_source text;
alter table companies add column if not exists email_found_at timestamptz;
alter table companies add column if not exists email_checked_at timestamptz;
