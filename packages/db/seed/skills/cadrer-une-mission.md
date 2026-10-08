---
name: cadrer-une-mission
agent: gyna
description: Transforme la demande d'un associé en mission chiffrée, découpée et budgétée avant toute délégation. À utiliser au début de chaque demande qui implique de trouver, qualifier ou écrire à des prospects.
---

# Cadrer une mission

## Objectif

Avant le premier `delegate_task`, savoir exactement : pour quelle venture, combien de prospects, quels segments, quelle chaleur visée, avec quel budget.

## Entrées

- La demande de l'associé et le bloc de mission (venture, budget restant).
- Le brief (`get_brief`) et les retours récents (`get_feedback`).

Si la venture manque, la demander : c'est la seule question bloquante. Pour le reste, poser des hypothèses explicites plutôt que des questions.

## Méthode

```
Cadrage :
- [ ] 1. Venture identifiée, brief lu
- [ ] 2. Brief suffisant pour la demande ? (persona pour chercher, offre pour écrire)
- [ ] 3. Objectif chiffré
- [ ] 4. Découpage en lots
- [ ] 5. Budget réparti
- [ ] 6. Hypothèses annoncées à l'associé si la demande était floue
```

**2. Brief suffisant ?** Chercher demande un persona et un territoire. Écrire demande une offre et une promesse. Si la partie nécessaire est « À compléter », le dire en une phrase et proposer de continuer avec des hypothèses explicites, ou de compléter le brief d'abord.

**3. Objectif chiffré.** Valeurs par défaut quand l'associé n'en donne pas :

| Demande | Par défaut |
|---|---|
| « Trouve des profils » | 50 profils, répartis entre les segments du brief, puis qualification |
| « Qualifie » | tous les prospects « à examiner » de la venture, 50 au plus |
| « Écris » | un brouillon par prospect chaud ou tiède sans brouillon, les chauds d'abord |

Le volume prime : viser le haut de la demande, et enchaîner sourcing, qualification et rédaction dans la même mission tant que le budget le permet.

**4. Découpage.** Une délégation de sourcing par segment du brief, en parallèle. Qualification par lots de 10 prospects, en parallèle. Rédaction pour les chauds et les tièdes, après qualification ; jamais pour les froids.

**5. Budget.** Garder 20 % du budget restant en réserve. Si l'objectif semble dépasser le budget, réduire l'objectif et le dire, plutôt que de s'arrêter en cours de route.

## Sortie

Avant de déléguer, une phrase à l'associé seulement si des hypothèses ont été prises : « Je pars sur 50 profils, répartis sur les 4 segments du brief, budget 5 €. »

## Garde-fous

- Ne jamais lancer la Rédaction sur des prospects non qualifiés ou froids.
- Ne jamais relancer une mission arrêtée pour budget sans l'accord d'un associé.

## Exemples

**Demande :** « Trouve-moi du monde pour la prochaine promo. »
**Cadrage :** venture L'Amorce, 50 profils répartis sur les segments du brief, qualification en 5 lots de 10, brouillons pour les chauds et les tièdes. Annonce : « Je pars sur 50 profils pour L'Amorce, qualifiés puis brouillons pour les chauds et les tièdes. »

**Demande :** « Écris aux chauds. » avec un brief dont l'offre est « À compléter ».
**Cadrage :** ne pas déléguer la Rédaction. Répondre : « L'offre du brief n'est pas remplie : les messages seraient vagues. Je peux écrire avec [offre] entre crochets, ou attendre que le brief soit complété. »
