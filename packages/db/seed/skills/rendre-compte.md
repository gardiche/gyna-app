---
name: rendre-compte
agent: gyna
description: Donne le format du compte rendu de fin de mission adressé aux associés. À utiliser pour la dernière réponse de chaque mission, réussie, partielle ou arrêtée.
---

# Rendre compte

## Objectif

Un associé comprend en 20 secondes ce qui a été fait, ce qui attend sa décision, et quoi faire ensuite.

## Méthode

1. Reprendre les chiffres des réponses d'outils, pas de mémoire.
2. Vérifier : chaque prospect « chaud » cité a un signal ; chaque brouillon annoncé a bien été soumis (`submit_draft` a répondu `ok`).
3. Remplir le gabarit ci-dessous.

## Sortie

Toujours ce gabarit, en Markdown, sans phrase d'introduction :

```markdown
**[Résultat en une phrase : objectif atteint, partiel ou non atteint]**

- Trouvés : N (dont N déjà connus)
- Qualifiés : N chauds, N tièdes, N froids, N écartés
- Brouillons à valider : N → « À valider »
- Dépensé : N,NN € sur N,NN €

**À contacter en premier**
1. [Nom] : [pourquoi maintenant, en une ligne] [confiance]
2. …

**Points d'attention**
- [Ce qui a posé problème, ce qui manque au brief, alertes de contact antérieur, contenus suspects ignorés]

**Questions ouvertes**
- [Ce que la mission n'a pas pu trancher et qui demande un associé]

**Prochaine étape proposée** : [une seule action concrète]
```

Omettre les lignes et sections sans objet (pas de « Brouillons : 0 » si la mission ne demandait pas d'écrire). « À contacter en premier » : les 3 à 5 prospects les plus chauds, par confiance décroissante, seulement s'il y en a. « Points d'attention » et « Questions ouvertes » disparaissent s'ils sont vides.

## Garde-fous

- Ne jamais annoncer un brouillon « envoyé » : il est « à valider ».
- Ne pas recopier les brouillons dans le compte rendu : ils s'affichent déjà dans la conversation.
- Pas de « J'ai le plaisir de… », pas d'autosatisfaction.

## Exemple

```markdown
**Objectif atteint en partie : 14 profils sur 20, la recherche Apify s'est arrêtée au plafond de résultats.**

- Trouvés : 14 (dont 2 déjà connus)
- Qualifiés : 3 chauds, 5 tièdes, 4 froids, 2 écartés
- Brouillons à valider : 3 → « À valider »
- Dépensé : 2,40 € sur 5,00 €

**À contacter en premier**
1. Claire Martin : cherche une formation en développement web depuis 3 semaines [confiance élevée]
2. Sophie Laurent : fin de contrat annoncée, commente des posts sur les bootcamps [confiance moyenne]

**Points d'attention**
- Julien Roux a déjà été contacté pour une autre venture en mars.

**Prochaine étape proposée** : lancer une seconde recherche sur le segment « commerciaux » pour atteindre 20.
```
