-- Données de départ : l'organisation Alpact, ses associés autorisés et la venture L'Amorce.
-- Remplacez les emails des associés avant de lancer ce script dans l'éditeur SQL de Supabase.

with org as (
  insert into organizations (name, slug, default_mission_budget_eur)
  values ('Alpact', 'alpact', 5)
  on conflict (slug) do update set name = excluded.name
  returning id
),
emails as (
  insert into allowed_emails (org_id, email, role, display_name)
  select org.id, e.email, e.role::member_role, e.name
  from org, (values
    ('gardet.thomas@gmail.com', 'owner', 'Thomas'),
    ('associe2@exemple.fr', 'owner', 'Associé 2'),
    ('associe3@exemple.fr', 'owner', 'Associé 3')
  ) as e(email, role, name)
  on conflict do nothing
  returning org_id
),
venture as (
  insert into ventures (org_id, name, slug, color, enrollment_goal)
  select id, 'L''Amorce', 'l-amorce', 'lime', '10 à 15 apprenants pour le prochain bootcamp' from org
  on conflict (org_id, slug) do update set name = excluded.name
  returning id, org_id
)
insert into briefs (org_id, venture_id, version, content, recency_days)
select org_id, id, 1, jsonb_build_object(
  'persona', '[À compléter : qui sont les futurs apprenants ?]',
  'offre', '[À compléter : le bootcamp, son format, ses dates]',
  'promesse', '[À compléter : ce que l''apprenant y gagne]',
  'objections', '[À compléter]',
  'ton', 'Direct, chaleureux, local. Vouvoiement.',
  'signaux_chauds', 'Exprime publiquement une envie de reconversion ou de montée en compétences, cherche une formation.',
  'interdits', 'Pas de promesse d''emploi garanti. Pas de relance plus de deux fois.'
), 60
from venture
on conflict do nothing;

-- Skills de départ, à réécrire par les associés depuis l'app.
with org as (select id from organizations where slug = 'alpact'),
s as (
  insert into skills (org_id, slug, name, agent)
  select org.id, v.slug, v.name, v.agent::agent_name
  from org, (values
    ('sourcing-persona', 'Trouver des profils conformes au persona', 'sourcing'),
    ('qualification-chaleur', 'Qualifier la chaleur d''un prospect', 'qualification'),
    ('premiere-approche', 'Écrire une première approche LinkedIn', 'redaction')
  ) as v(slug, name, agent)
  on conflict (org_id, slug) do nothing
  returning id, org_id, slug
),
sv as (
  insert into skill_versions (org_id, skill_id, version, content)
  select s.org_id, s.id, 1, c.content
  from s join (values
    ('sourcing-persona', E'# Trouver des profils conformes au persona\n\n1. Lire le brief (get_brief) : persona, segments, interdits.\n2. Traduire le persona en critères de recherche : intitulés de poste, lieux, mots-clés. Rester sur le territoire indiqué.\n3. Ne garder que les profils dont le titre ou le lieu correspond clairement. Dans le doute, ne pas ajouter.\n4. Avant d''ajouter, vérifier les doublons (find_prospect) pour les profils déjà vus.\n5. Ajouter par lots de 50 au plus (upsert_prospects), puis déclarer le coût Apify (report_cost).\n6. Signaler dans le compte rendu toute alerte de contact antérieur.'),
    ('qualification-chaleur', E'# Qualifier la chaleur d''un prospect\n\nTous les prospects retenus sont dans le persona. La chaleur dépend des signaux publics récents (fenêtre du brief).\n\n- **Froid** : aucun signal récent lié au besoin.\n- **Tiède** : signaux indirects (s''intéresse publiquement à des sujets proches, interagit avec des contenus liés).\n- **Chaud** : signal explicite et récent (exprime le besoin, cherche une solution, annonce un changement qui y mène). Toujours citer le ou les signaux (signal_ids).\n\nÉtapes : lire les posts et commentaires récents, enregistrer les signaux utiles (add_signals, extraits courts, avec URL et date), puis qualifier (qualify_prospect) avec une justification d''une ou deux phrases qu''un associé comprend sans ouvrir LinkedIn. Écarter (discard_prospect) un profil manifestement hors persona.'),
    ('premiere-approche', E'# Écrire une première approche LinkedIn\n\n- Vouvoiement, ton du brief. 4 à 6 lignes au plus.\n- Ouvrir sur le signal du prospect, précisément et sans flatterie.\n- Une phrase sur l''offre, reliée à ce signal.\n- Une seule demande, simple et peu engageante (un échange de 15 minutes, une question).\n- Jamais de promesse interdite par le brief, jamais de faux sentiment d''urgence.\n- Laisser entre crochets ce qu''on ne sait pas, plutôt que l''inventer.\n- Soumettre avec submit_draft : rien n''est envoyé sans validation.')
  ) as c(slug, content) on c.slug = s.slug
  returning id
)
select count(*) from sv;

-- Version courante = la plus haute (instruction séparée : les lignes insérées ci-dessus sont alors visibles).
update skills set current_version_id = latest.id
from (select distinct on (skill_id) skill_id, id from skill_versions order by skill_id, version desc) latest
where skills.id = latest.skill_id and skills.current_version_id is null;
