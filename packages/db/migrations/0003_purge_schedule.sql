-- Purge nocturne des prospects échus (pg_cron doit être activé : Database > Extensions > pg_cron).
create extension if not exists pg_cron;

select cron.schedule('gyna-purge-prospects', '15 3 * * *', $$select public.purge_expired_prospects()$$);
