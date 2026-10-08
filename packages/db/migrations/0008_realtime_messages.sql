-- Les réponses de Gyna et l'activité des sous-agents arrivent après le premier tour (délégations en
-- arrière-plan) : l'app les affiche en direct, sans rechargement.
alter publication supabase_realtime add table messages, actions;
