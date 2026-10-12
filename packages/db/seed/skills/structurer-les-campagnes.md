---
name: structurer-les-campagnes
agent: campagnes
description: Construit le plan de campagne d'une venture : choix et ordre des plateformes, coût cible par pré-inscription, budget, nombre de pubs que ce budget peut juger, structure des campagnes, noms, et liste de contrôle avant lancement. À utiliser pour préparer un lancement ou revoir la répartition du budget.
---

# Structurer les campagnes

Adapté de « ads » et de ses références « b2b-paid-playbook », « meta-decision-system », « google-search-playbook » et « linkedin-b2b-playbook » (Corey Haines, licence MIT).

## Objectif

Un plan qu'un associé peut reproduire dans les gestionnaires de publicités sans rien décider de plus : quoi créer, avec quel budget, quelles pubs, et selon quelles règles on jugera.

## Entrées

- Le brief (offre, prix, objectif, échéance), les pubs approuvées (`get_approved_ads`), le plan de mesure.
- Donnés par l'associé : le budget total ou journalier, et si possible ce qu'il accepte de payer pour une pré-inscription.

Sans plan de mesure vérifié, le plan de campagne commence par « rien ne se lance avant le plan de mesure ». Sans pub approuvée pour une plateforme, le dire et renvoyer vers l'agent Ads.

## Méthode

**1. Le coût cible.** Tout le reste en dépend. Dans cet ordre de préférence :
- par le calcul : ce que vaut un inscrit pour la venture × part des pré-inscrits qui s'inscrivent vraiment × part de cette valeur qu'on accepte de dépenser en pub ;
- par l'historique : coût réel des 30 derniers jours × 0,8 ;
- à défaut, la valeur donnée par l'associé, notée « provisoire, à revoir après 30 jours ».

Coût par clic supportable = coût cible × taux de conversion de la page d'arrivée. S'il n'est pas connu, l'écrire : on le mesurera la première semaine.

**2. Les plateformes, dans l'ordre.** Ne pas tout ouvrir à la fois : un budget coupé en trois n'apprend rien nulle part.

| Plateforme | Pour quoi | Quand |
|---|---|---|
| Meta | Créer la demande auprès d'un public qui ne cherche pas encore | En premier quand il faut du volume vite et qu'on a des pubs variées |
| Google (recherche) | Capter ceux qui cherchent déjà | Dès qu'il existe des recherches sur l'offre ; petit budget, forte intention |
| LinkedIn | Cibler par poste ou entreprise | En dernier : le clic y est nettement plus cher, à réserver aux offres à prix élevé et aux publics définis par un métier |

**3. Combien de pubs le budget peut juger.** Une pub a besoin d'environ 2 fois le coût cible, en 14 jours, pour être jugée.

```
Nombre maximal de pubs actives = (budget par jour × 14) / (2 × coût cible)
```

Avec 60 € par jour et un coût cible de 50 € : 8 pubs au plus. Si l'agent Ads en a fourni plus, choisir celles qui couvrent le plus d'angles différents et garder les autres en réserve.

**4. La structure.**

- **Meta** : deux campagnes à budget au niveau campagne, sur le même public large. « Test » (environ 20 % du budget) reçoit les nouvelles pubs ; « Diffusion » (environ 80 %) ne reçoit que celles qui ont fait leurs preuves. Au lancement, tout est en test : un seul ensemble, ciblage large (pays ou région, âge), c'est la pub qui trie. Images d'abord ; la vidéo vient pour les concepts validés.
- **Google** : une campagne « marque » (le nom de la venture), une campagne « intention forte » avec des groupes de 5 à 15 mots-clés proches et 2 à 3 annonces chacun. Requêtes exactes et expressions seulement ; partenaires de recherche et réseau Display désactivés ; ciblage « présence » dans la zone. Requêtes larges seulement après 30 conversions par mois.
- **LinkedIn** : public de 50 000 à 300 000 personnes (jamais sous 15 000), extension d'audience et réseau d'audience désactivés, au moins 4 pubs par campagne.

**5. L'optimisation.** Viser la pré-inscription si la campagne peut en obtenir une dizaine par semaine ; sinon viser une conversion secondaire plus fréquente du plan de mesure, et le dire.

**6. Les noms.** `[PLATEFORME]_[Objectif]_[Public]_[Offre]_[AAAA-MM]`, par exemple `META_Preinscription_Salaries_Amorce_2026-10`. Chaque pub porte sa référence courte.

**7. Le calendrier de décision** et les règles (skills de pilotage) : quand on regarde, ce qu'on coupe, ce qu'on pousse.

## Sortie

```markdown
## En bref
Plateformes retenues, budget, coût cible, date de lancement possible, ce qui bloque.

## Coût cible et budget
Le calcul, ses hypothèses, la répartition par plateforme et par jour.

## Structure
Par plateforme : campagnes, ensembles, pubs (référence, angle, lien balisé), ciblage, objectif d'optimisation.

## Règles de décision
Quand on regarde, ce qui fait couper, garder ou pousser, avec les montants calculés pour ce budget.

## Avant de lancer
Liste à cocher.

## Décisions à prendre par l'associé
```

## Avant de lancer

- [ ] Plan de mesure vérifié par une vraie conversion de test.
- [ ] Budget saisi au bon niveau (jour ou durée totale), dates de début et de fin justes.
- [ ] Lieu, langue et âge conformes au persona.
- [ ] Chaque pub a son lien balisé et son visuel au bon format (carré pour le fil, vertical pour les stories).
- [ ] La page d'arrivée reprend la promesse de la pub.
- [ ] Campagnes créées en pause, relues par un associé avant activation.

## Garde-fous

- Augmenter un budget par paliers de 20 % au plus, tous les 5 jours ; jamais doubler.
- Ne rien modifier pendant la phase d'apprentissage d'une campagne sans raison grave.
- Les repères chiffrés du métier viennent de comptes américains de logiciels : les donner comme ordre de grandeur, jamais comme prévision.
- Formation et financement : signaler à l'associé que la publicité pour des formations finançables est encadrée, et qu'il doit le faire vérifier.

## Exemples

- Bien : « Coût cible provisoire : 50 € (donné par l'associé, à revoir après 30 jours). Budget Meta 60 € par jour : 8 pubs actives au plus ; 12 approuvées, j'en retiens 8 sur 4 angles. »
- Mal : « Lancer les 12 pubs sur Meta, Google et LinkedIn avec 20 € par jour chacun. » (aucune pub ne pourra être jugée)
