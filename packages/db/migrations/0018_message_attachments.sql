-- Fichiers joints à un message par un associé : [{ name, url, path, type, size }].
-- Les fichiers sont dans le bucket « gyna-media » ; Gyna les lit par leur adresse.
alter table messages add column if not exists attachments jsonb not null default '[]'::jsonb;
