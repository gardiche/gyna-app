-- Rôle d'un invité qui ne voit que le suivi des campagnes (expert publicitaire accompagnant une venture).
-- Valeur d'énumération seule : elle doit être validée avant d'être utilisée, d'où une migration à part.
alter type member_role add value if not exists 'campaign_viewer';
