-- Publication des posts approuvés, tout de suite ou à une heure choisie par un associé.
-- scheduled_for reste la date proposée par l'agent ; scheduled_at est l'heure de publication décidée.
alter table ads add column if not exists scheduled_at timestamptz;
alter table ads add column if not exists publish_status text check (publish_status in ('scheduled', 'publishing', 'published', 'failed'));
alter table ads add column if not exists publish_error text;
alter table ads add column if not exists published_url text;

create index if not exists ads_due on ads (scheduled_at) where publish_status = 'scheduled';
