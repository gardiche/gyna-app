# Skills d'Alpact

Source de relecture des skills chargés par les agents (`get_agent_skills`). Un fichier par skill ; l'app garde les versions en base (`skills`, `skill_versions`).

Format, inspiré des bonnes pratiques des Agent Skills :

```markdown
---
name: identifiant-en-kebab-case        # = skills.slug
agent: redaction                       # gyna, sourcing, qualification, redaction, ou tous
description: Ce que fait le skill et quand l'utiliser, à la troisième personne.
---

# Titre

## Objectif        ce qui doit être atteint, mesurable
## Entrées         ce dont l'agent a besoin ; s'il manque, il le dit au lieu de deviner
## Méthode         étapes numérotées, liste à cocher pour les tâches longues
## Sortie          format attendu
## Garde-fous      interdits absolus
## Exemples        cas concrets, bons et mauvais
```

Règles d'écriture :

- N'écrire que ce que le modèle ne sait pas : l'expertise d'Alpact, pas des généralités.
- Un skill, un sujet. Ce qui dépend d'une venture (offre, persona, territoire) va dans le brief, pas dans un skill.
- Mêmes mots partout : prospect, signal, chaleur (froid, tiède, chaud), brouillon, brief, venture, mission.
- Une option par défaut, et l'exception explicitement.
- Pas de dates ni de chiffres qui vieillissent.

`evaluations.md` décrit trois scénarios par skill, à rejouer après chaque modification importante.

Charger les fichiers dans l'app (nouvelle version de chaque skill, l'ancienne reste restaurable) :

```bash
node packages/db/scripts/skills-to-sql.mjs > /tmp/skills.sql   # puis exécuter le SQL dans Supabase
```
