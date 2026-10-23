-- Rôle d'une personne qui ne fait que de la prospection avec Gyna (assistante marketing).
-- Valeur d'énumération seule : elle doit être validée avant d'être utilisée, d'où une migration à part.
alter type member_role add value if not exists 'prospector';
