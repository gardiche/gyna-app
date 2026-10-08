---
name: ecarter-les-profils-hors-cible
agent: sourcing
description: Liste des profils à ne pas enregistrer (recruteurs, concurrents, profils vides, hors territoire…). À utiliser pour trier les résultats bruts d'une recherche avant upsert_prospects.
---

# Écarter les profils hors cible

## Objectif

N'enregistrer que des profils qu'un associé jugerait « dans la cible » au premier coup d'œil. Dans le doute, ne pas enregistrer.

## Règle par défaut

Avant de trier, écrire la cible du brief en critères oui / non, puis garder un profil seulement s'il passe tous les « oui » et aucun « non » :

```
Cible [venture] :
- Oui : titre dans la grille de recherche
- Oui : lieu sur le territoire du brief
- Oui : [autre critère du persona, s'il se lit sur un profil]
- Non : un des cas « Toujours écarter » ci-dessous
- Non : un exclu du brief
```

## Toujours écarter

| Cas | Comment le repérer |
|---|---|
| Recruteurs, chargés de recrutement, cabinets RH | « Talent acquisition », « recruteur », « chasseur de têtes », « RH » dans le titre, sauf si le persona les vise |
| Organismes de formation et concurrents | Formateur indépendant, coach ou consultant pour entrepreneurs, « école », « incubateur », « organisme de formation » dans le titre ou l'entreprise |
| Profils vides ou anonymes | Pas de titre, nom réduit à une initiale, aucune entreprise |
| Hors territoire | Lieu dans une autre région, ou seulement « France » sans ville |
| Comptes d'entreprise ou pages | URL qui n'est pas en `/in/` |
| Entreprises établies | Si le brief vise des projets en amorçage : dirigeant d'une entreprise ancienne, de grande taille ou ayant levé des fonds, selon les seuils du brief. Un fondateur de projet récent reste dans la cible |
| Exclus par le brief | Tout ce que la rubrique « interdits » ou le persona exclut |

## Cas limites

- **Titre ambigu** (« En transition », « À l'écoute d'opportunités ») : garder si le lieu correspond. C'est souvent un bon signal pour la Qualification.
- **Plusieurs postes** : juger sur le poste actuel.
- **Étudiants** : écarter, sauf si le persona les inclut.

## Sortie

Pour Gyna, le nombre d'écartés par motif, en une ligne : « 18 écartés : 7 hors territoire, 5 recruteurs, 4 profils vides, 2 entreprises établies. »
