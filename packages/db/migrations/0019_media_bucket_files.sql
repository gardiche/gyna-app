-- Le bucket des visuels accepte aussi les documents joints aux conversations (PDF, texte, tableur CSV).
-- Propre à Supabase (schéma storage) : non rejouée dans les tests PGlite.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json']
where id = 'gyna-media';
