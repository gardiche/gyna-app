---
name: carrousels
agent: ads
description: Trames de carrousels Instagram et de documents LinkedIn (liste de valeur, problème et preuve, techniques nommées, coup de gueule, démonstration), règles de la couverture, d'une idée par diapositive, de la légende et de la dernière diapositive. À utiliser pour tout post au format carrousel ou document.
---

# Carrousels

Adapté de « carousel-frameworks » (social, Corey Haines, licence MIT).

## Objectif

Un carrousel qu'on fait défiler jusqu'au bout et qu'on enregistre : chaque diapositive apporte quelque chose que la précédente n'avait pas.

## Choisir la trame avant d'écrire

| Ce qu'on a à dire | Trame | Diapositives |
|---|---|---|
| Une liste de ressources, d'outils ou de conseils | **Liste de valeur** | 4 à 14 |
| Un résultat obtenu, avec une méthode derrière | **Problème et preuve** | 6 à 10 |
| Plusieurs techniques sur un même thème | **Techniques nommées** | 6 à 10 |
| Une opinion forte sur une pratique courante | **Coup de gueule** | 4 à 8 |
| Un déroulé qu'on peut montrer | **Démonstration** | 5 à 11 |

## Les cinq trames

**Liste de valeur.** Couverture : un nombre exact et ce qu'on obtient (« 7 questions à poser avant de quitter son poste »). Ensuite un élément par diapositive, avec 3 à 6 précisions concrètes. Dernière : une seule action. Écueil : gonfler le nombre ; 8 diapositives tenues valent mieux que 14 délayées.

**Problème et preuve.** Couverture : un résultat précis, énoncé comme un fait. 2 : le vrai problème, où le lecteur se reconnaît. 3 et 4 : la méthode, avec des outils et des étapes nommés. Suivantes : le détail réutilisable (le modèle, les étapes) : c'est la partie qu'on enregistre. Dernière : la preuve réelle, pas sa description. Écueil : une méthode vague, et la preuve ressemble à de la chance.

**Techniques nommées.** Couverture : un fait ou une affirmation qui laisse entendre que la plupart s'y prennent mal. 2 : pourquoi la façon courante échoue. Ensuite une technique par diapositive, chacune avec un nom et un contraste « à éviter / à faire ». Dernière : la phrase qui les relie, et une action. Écueil : des techniques qui se recoupent ; les fusionner.

**Coup de gueule.** Couverture : l'opinion ou le reproche. Ensuite des détails précis, chaque diapositive monte d'un cran. Avant-dernière : **ce qu'on n'attaque pas** (la pratique, jamais les personnes). Dernière : une conclusion nette, signée. Écueils : sauter l'avant-dernière, ou dénoncer ce que la venture fait elle-même.

**Démonstration.** Couverture : le résultat fini. 2 : le problème que ça remplace. 3 : toutes les étapes en une liste, avec leur nombre et la durée. Ensuite une étape par diapositive, avec une vraie image de l'étape. Dernière : le résultat en grand et une phrase de principe. Écueil : des images chargées ; recadrer sur l'action.

## Règles communes

- **La couverture doit tenir seule** : c'est elle qu'on voit dans le fil et dans la grille du profil.
- **Une idée par diapositive.** S'il faut deux phrases pour l'amener, la couper en deux.
- **Le même gabarit** sur toutes les diapositives intérieures : mise en page, tailles, couleurs.
- **Lisible en petit** : gros caractères, peu de mots.
- **Le nombre promis est tenu**, exactement.
- **La légende est un second post**, avec sa propre première ligne : elle ne répète pas la couverture.
- **Une seule action** sur la dernière diapositive.

## Formats

- Instagram : vertical 4:5 (1080 × 1350), 20 diapositives au plus.
- LinkedIn : un document PDF, carré ou 4:5. Le nombre de pages s'affiche, ce qui va bien avec une couverture chiffrée. Le texte peut être un peu plus dense, mais toujours une idée par page.

## Sortie

Dans `submit_posts` : `format` vaut `carousel` (Instagram) ou `document` (LinkedIn), `template` porte le nom de la trame, `slides` contient le texte exact de chaque diapositive, la couverture en premier, `headline` reprend la couverture, `primary_text` est la légende. `visual_brief` décrit le gabarit commun (fond, typographie, place du logo), à partir de la charte de la bibliothèque.

## Juger un carrousel

Aux enregistrements et à la part de lecteurs qui vont au bout, pas aux mentions « j'aime ». Quand un carrousel déçoit, c'est presque toujours la couverture ou le choix de la trame, rarement le milieu.

## Garde-fous

- Chiffres, exemples et images réels, et à la venture.
- Un coup de gueule ne vise ni une personne ni un concurrent nommé.
- Pas de diapositive de remplissage pour atteindre un nombre.

## Exemples

- Bien : trame « Liste de valeur », couverture « 5 questions à se poser avant de quitter son poste », cinq diapositives d'une question chacune avec deux précisions, dernière « Le programme démarre le 25 janvier. Lien dans le profil. »
- Mal : couverture « Nos conseils pour entreprendre », puis dix diapositives d'une phrase générale chacune.
