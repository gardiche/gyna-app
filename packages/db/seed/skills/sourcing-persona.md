---
name: sourcing-persona
agent: sourcing
description: Méthode de recherche de profils LinkedIn publics avec Apify à partir du persona et du territoire du brief. À utiliser pour toute tâche de sourcing, avant de lancer le moindre acteur Apify.
---

# Chercher des profils LinkedIn

## Objectif

Le nombre de profils demandé, tous sur le territoire du brief et compatibles avec son persona, au coût Apify le plus bas. Le sourcing apporte du volume ; c'est la Qualification qui juge l'intention et la chaleur. Un segment défini par une intention (« en phase d'idée », « veut entreprendre ») se cherche par des titres et mots-clés proches, sans exiger de preuve de l'intention.

## Entrées

- Brief (`get_brief`) : persona, segments, territoire, interdits.
- Objectif chiffré et budget restant, donnés par Gyna.

Si le persona ou le territoire du brief est « À compléter », s'arrêter et le dire à Gyna.

## Méthode

```
Sourcing :
- [ ] 1. Grille écrite : intitulés × lieux
- [ ] 2. Recherches avec search_linkedin_profiles, combinaison par combinaison
- [ ] 3. Relances sur d'autres intitulés ou d'autres lieux jusqu'à l'objectif ou au budget
- [ ] 4. Compte rendu additionné
```

**1. Grille.** Quand un segment du brief dit « À trouver par », partir de ces traces visibles : ce sont elles qu'on cherche, pas la situation décrite. Sinon, 3 à 6 intitulés par segment, avec leurs variantes : féminin et masculin, anglicismes (fondateur, fondatrice, cofondateur, founder, co-founder, CEO, gérant, président, créateur d'entreprise, entrepreneur). Lieux tels que LinkedIn les comprend : la ville principale (« Annecy », « Genève »), le département ou la région (« Haute-Savoie », « Savoie »), puis les communes moyennes du territoire, dans l'ordre de priorité du brief.

**2. Rechercher.** Avec `search_linkedin_profiles` : `titles`, `locations`, `max_profiles` (le nombre voulu ; 0,10 $ par tranche de 25), `segment` (nom exact du segment du brief), et les filtres que l'associé ou le brief demandent : `recent_only` (moins d'un an dans l'entreprise actuelle), `company_sizes` (taille de l'entreprise actuelle : `independant`, `1-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1001+`). Un public décrit par une taille (« PME », « TPE », « grandes entreprises ») se traduit dans ce filtre, pas dans un tri après coup. `industries` (secteur de l'entreprise actuelle) : traduire le secteur demandé en anglais, trouver son nom exact avec `find_linkedin_industries` (« restaurant » → `Restaurants` ; « hôtellerie-restauration » → `Food and Beverage Services`, qui inclut ses sous-secteurs), puis le passer tel quel. L'outil fait tout le reste : recherche sans cookies en mode court, enregistrement de **tous** les profils exploitables, dédoublonnage, déclaration du coût. Ne rien trier, ne rien vérifier après lui : l'ancienneté, l'activité et la taille de l'entreprise se jugent à la Qualification.

**3. Relancer.** Un appel qui rapporte peu n'est pas un échec de la méthode : essayer d'autres intitulés, d'autres lieux, ou retirer un filtre si l'associé l'autorise. Ne pas relancer deux fois la même combinaison. S'arrêter à l'objectif, au budget (`budget_exceeded` ou refus de l'outil), ou quand trois combinaisons de suite n'apportent plus de profil nouveau.

**Hors outil.** Pour ce que l'outil ne sait pas faire (chercher par publications, par exemple), Apify directement, avec un acteur dont l'entrée ne demande AUCUN cookie ni identifiant, en mode court ; enregistrer avec `upsert_prospects` par lots de 50 et déclarer le coût avec `report_cost`. Si l'acteur demande un plafond de dépense par lancement, le fixer au moins à son coût minimum.

## Sortie

À Gyna, en additionnant tous les appels : profils trouvés, enregistrés, créés, déjà connus, inexploitables (sans adresse ou sans nom), répartition par lieu, intitulés et lieux utilisés, coût total, alertes de contact antérieur.

## Garde-fous

- JAMAIS de cookies, de session ou de compte LinkedIn personnel.
- Ne pas enregistrer un profil sans URL `/in/` valide.
- Ne pas rendre 0 profil quand des résultats sont sur le territoire et sans motif d'exclusion : les enregistrer et laisser la Qualification trancher.
