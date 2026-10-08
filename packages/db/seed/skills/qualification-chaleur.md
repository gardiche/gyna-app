---
name: qualification-chaleur
agent: qualification
description: Grille pour attribuer la chaleur (froid, tiède, chaud) d'un prospect et rédiger sa justification. À utiliser au moment d'appeler qualify_prospect ou discard_prospect.
---

# Qualifier la chaleur d'un prospect

## Objectif

Une chaleur que deux associés attribueraient de la même façon, avec une justification qu'ils comprennent sans ouvrir LinkedIn.

## Entrées

- Les signaux enregistrés pour le prospect (skill « Lire un signal »).
- Les signaux chauds définis dans le brief.
- Les retours des associés (`get_feedback`) : un brouillon refusé avec « pas vraiment intéressé » veut dire que la chaleur était surestimée.

## Principe

Être dans le persona dit seulement que le prospect **est dans la cible** ; la chaleur répond à une autre question : **pourquoi maintenant ?** Un profil parfait sans signal récent est froid ; un profil moyen qui vient d'écrire chercher une formation est chaud.

## Grille

| Chaleur | Critère | Exemples |
|---|---|---|
| **Chaud** | Au moins un signal dans la fenêtre où le prospect exprime **lui-même** le besoin ou cherche activement une solution du type de l'offre | « Je cherche une formation en… » ; « Je quitte mon poste en juin pour me reconvertir » ; question concrète sur un bootcamp (prix, prérequis) |
| **Tiède** | Intérêt réel mais indirect : sujet proche, situation qui y mène, sans intention exprimée | Commente des posts sur la reconversion ; annonce une fin de contrat ; badge « Open to work » ; titre « En transition » |
| **Froid** | Dans le persona, mais aucun signal dans la fenêtre | Profil conforme, aucune activité récente liée |
| **Écarté** | Hors persona à la lecture complète | Le profil montre en fait un recruteur, un formateur, une autre région |

**Dans le doute entre deux niveaux, choisir le plus bas.** Un chaud surestimé coûte un brouillon inutile et la confiance des associés.

## Méthode

1. Lire les signaux du prospect et choisir le niveau avec la grille.
2. Pour **chaud**, citer dans `signal_ids` le ou les signaux qui le justifient. `qualify_prospect` refuse un chaud sans signal récent.
3. Rédiger `heat_reason` (format ci-dessous) puis appeler `qualify_prospect`.
4. Pour un profil hors persona, `discard_prospect` avec le motif en quelques mots.

## Format de la justification

Une ou deux phrases : **le fait**, **sa date**, **ce qu'il signifie pour l'offre**, puis le niveau de confiance entre crochets :

- **[confiance élevée]** : deux signaux indépendants ou plus vont dans le même sens.
- **[confiance moyenne]** : un seul signal, clair.
- **[confiance faible]** : signal ambigu ou date incertaine ; à vérifier par un associé.

- Bien : « A écrit il y a 3 semaines chercher une formation pour passer au développement web : correspond exactement au bootcamp. [confiance moyenne] »
- Bien : « Commente régulièrement des posts sur la reconversion, sans projet exprimé. [confiance élevée] »
- Mal : « Profil intéressant avec un bon potentiel. » (aucun fait)
- Mal : « Chaud car il est motivé. » (interprétation sans source)
