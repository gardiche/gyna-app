-- Page Prospects : la photo de la personne et le logo de son entreprise, tels que les données LinkedIn venues d'Apify
-- les donnent (rien n'est deviné). Le serveur MCP les remplit au sourcing et à la lecture d'un profil ; l'app affiche
-- une initiale quand ils manquent ou que l'image ne se charge plus (les adresses d'images LinkedIn expirent).
alter table prospects add column if not exists photo_url text;
alter table accounts add column if not exists logo_url text;

-- Une personne en prospection lit le nom et le logo de l'entreprise des seuls prospects qu'elle a le droit de voir
-- (la RLS de prospects s'applique dans la sous-requête). Rien en écriture.
drop policy if exists accounts_read_prospector on accounts;
create policy accounts_read_prospector on accounts for select
  using (org_id in (select current_prospector_org_ids()) and exists (select 1 from prospects p where p.account_id = accounts.id));
