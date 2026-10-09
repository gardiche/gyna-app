---
name: synthese-de-la-veille
agent: veille
description: Rédige la synthèse de la veille d'une venture à partir de toutes les fiches et pubs enregistrées : angles qui reviennent, preuves, offres d'entrée, ce que personne ne dit, et pistes pour la venture. À utiliser quand Gyna demande la synthèse, à la fin d'une mission de veille.
---

# Synthèse de la veille

## Objectif

Une page qu'un associé lit en cinq minutes et qui répond à : que mettent en avant les concurrents, qu'est-ce qui semble marcher pour eux, et où la venture peut se démarquer. Chaque constat s'appuie sur des pubs ou des fiches enregistrées.

## Entrées

- `list_competitors` et `get_competitor_ads` (toutes les pubs, pas seulement les actives).
- Le brief : offre, promesse et persona de la venture, pour la comparaison.

S'il y a moins de deux concurrents profilés, le dire à Gyna au lieu d'écrire une synthèse.

## Méthode

1. Compter avant d'interpréter : pubs par concurrent et par plateforme, angles, offres d'entrée, preuves. Les chiffres de la synthèse sont ces comptes.
2. Repérer les pubs durables (actives depuis 30 jours ou plus, ou déclinées en plusieurs versions) : ce sont elles qui disent ce qui marche.
3. Comparer à l'offre de la venture : ce qu'elle a et que personne ne dit, ce que tous disent et qu'elle ne peut pas promettre.
4. Écrire au gabarit, puis `save_watch_summary`.

## Sortie

```markdown
## En bref
Trois phrases : le paysage, ce qui domine, l'ouverture principale pour [venture].

## Comparatif
| Concurrent | Type | Offre | Prix | Financement | Promesse |

## Ce qu'ils mettent en avant
Angles par fréquence (« Identité : 14 pubs sur 31, 4 concurrents »), avec une accroche réelle citée par angle et son auteur.

## Ce qui semble marcher
Les pubs les plus durables : concurrent, accroche, depuis combien de temps, pourquoi elle tient (déduit).

## Preuves et offres d'entrée
Preuves utilisées (chiffres, témoignages, labels, financement) ; offres d'entrée (réunion d'information, webinaire, appel…).

## Ce que personne ne dit
Les angles ou preuves absents de toutes les pubs observées, et ceux que [venture] peut porter d'après son brief.

## Pistes pour [venture]
3 à 5 hypothèses à tester, chacune avec le constat qui la fonde. Ce sont des pistes, pas des décisions.

## Limites
Bibliothèques sans résultat, concurrents non profilés, période couverte.
```

## Garde-fous

- Pas de chiffre qui ne vienne d'un compte sur les données enregistrées.
- « Absent des pubs observées », jamais « personne ne le fait ».
- Les pistes restent des hypothèses ; aucune promesse que la venture ne peut pas tenir d'après son brief.
- Citer une pub, c'est citer son texte exact et son concurrent.

## Exemples

- Bien : « Le financement CPF apparaît dans 9 pubs sur 31, chez 3 concurrents sur 5 ; aucune ne parle de certification RNCP. Piste : tester la certification comme preuve principale. »
- Mal : « Les concurrents misent tous sur le prix. » (aucun compte, « tous » non vérifié)
