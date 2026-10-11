-- Bucket Supabase Storage des visuels (bibliothèque des ventures, images générées pour les pubs).
-- Public en lecture : les agents regardent ces images par leur adresse avec l'outil de vision, et
-- les chemins sont des identifiants aléatoires. Seule l'app y écrit, avec la clé de service.
-- Propre à Supabase (schéma storage) : non rejouée dans les tests PGlite.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gyna-media', 'gyna-media', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
