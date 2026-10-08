---
name: sourcing-persona
agent: sourcing
description: Méthode de recherche de profils LinkedIn publics avec Apify à partir du persona et du territoire du brief. À utiliser pour toute tâche de sourcing, avant de lancer le moindre acteur Apify.
---

# Chercher des profils LinkedIn

## Objectif

Le nombre de profils demandé, tous dans le persona et sur le territoire du brief, au coût Apify le plus bas.

## Entrées

- Brief (`get_brief`) : persona, segments, territoire, interdits.
- Objectif chiffré et budget restant, donnés par Gyna.

Si le persona ou le territoire du brief est « À compléter », s'arrêter et le dire à Gyna.

## Méthode

```
Sourcing :
- [ ] 1. Grille de recherche écrite (intitulés × lieux)
- [ ] 2. Acteur Apify choisi, sans cookies
- [ ] 3. Recherche test sur une seule combinaison
- [ ] 4. Recherches complètes, au plus 2 fois l'objectif en résultats bruts
- [ ] 5. Tri avec le skill « Écarter les profils hors cible »
- [ ] 6. Doublons vérifiés, enregistrement, coût déclaré
```

**1. Grille de recherche.** Pour chaque segment du brief, écrire 3 à 6 intitulés de poste et leurs variantes françaises courantes : féminin et masculin, abréviations, anglicismes. Par exemple pour « commercial » : commercial, commerciale, chargé(e) d'affaires, business developer, account manager, technico-commercial. Traduire le territoire en lieux tels que LinkedIn les affiche : la ville principale et sa zone (« Chambéry et périphérie »), plus les communes moyennes du territoire.

**2. Acteur Apify.** Choisir un acteur de recherche de profils LinkedIn dont l'entrée ne demande AUCUN cookie, `li_at`, session ni identifiant. Si l'entrée en demande un, changer d'acteur. Préférer celui qui renvoie le titre, le lieu et l'entreprise dans le même résultat.

**3. Test.** Lancer une seule combinaison (un intitulé, un lieu, 10 résultats). Si plus de la moitié des profils sont hors persona, revoir la grille avant de dépenser plus.

**4. Recherches complètes.** Demander au plus 2 fois l'objectif en résultats bruts, car le tri en élimine environ la moitié. Après chaque lancement, déclarer le coût (`report_cost`, source `apify`) ; si `budget_exceeded`, s'arrêter.

**6. Enregistrement.** Pour un profil dont l'URL a déjà été vue dans la mission, `find_prospect` d'abord. Puis `upsert_prospects` par lots de 50 au plus, avec le `segment` du brief quand il est clair.

## Sortie

À Gyna : profils trouvés, enregistrés, déjà connus, alertes de contact antérieur (telles que renvoyées par `upsert_prospects`), coût total, et la grille utilisée en une ligne.

## Garde-fous

- JAMAIS de cookies, de session ou de compte LinkedIn personnel.
- Ne pas enregistrer un profil sans URL `/in/` valide.
- Ne pas dépasser 2 fois l'objectif en résultats bruts sans le dire à Gyna.
