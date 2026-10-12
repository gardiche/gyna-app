---
name: piloter-google-et-linkedin
agent: campagnes
description: Règles de pilotage des campagnes Google (recherche) et LinkedIn : ordre des dépenses, mots-clés et exclusions, enchères selon le volume de conversions, taille et saturation des publics, repères et erreurs fréquentes. À utiliser pour tout bilan ou toute décision sur une campagne Google ou LinkedIn.
---

# Piloter Google et LinkedIn

Adapté de « google-search-playbook » et « linkedin-b2b-playbook » (ads, Corey Haines, licence MIT). Seuils à recalibrer sur les chiffres du compte.

## Objectif

Sur Google, payer pour l'intention et rien d'autre. Sur LinkedIn, payer pour le bon public sans le saturer.

## Google : la recherche

**L'ordre des dépenses.** Ne pas sauter d'échelon :

1. La marque (le nom de la venture) : toujours active, peu chère.
2. L'intention forte (« formation création d'entreprise Annecy », « programme entrepreneuriat ») : c'est là que va l'essentiel.
3. Les concurrents : seulement avec une page de comparaison, et après accord de l'associé.
4. Le problème (« comment tester une idée d'entreprise ») : seulement quand 1 et 2 tiennent leur coût.
5. Display et YouTube : en dernier, avec du budget en trop.

**Structure.** Groupes de 5 à 15 mots-clés proches, une seule intention par groupe, 2 à 3 annonces. Une campagne qui n'atteint pas 15 à 30 conversions par mois se fusionne avec une autre.

**Mots-clés.** Requêtes exactes et expressions au départ. Requêtes larges seulement quand les trois sont réunis : 30 conversions par mois dans la campagne, enchères automatiques actives, liste d'exclusions tenue.

**Exclusions.** Poser dès le départ les mots hors sujet évidents (gratuit, emploi, salaire, stage, avis, connexion). Pour le reste, **n'exclure qu'à partir du rapport des termes de recherche** : sans ce rapport, n'en proposer aucun. Avant d'exclure un mot, se demander s'il bloquerait une recherche qui convertit. Le rapport ne montre qu'une partie des clics : donner la part visible.

**Enchères, par campagne et par mois.**

| Conversions par mois | Stratégie |
|---|---|
| 0 à 15 | Coût par clic manuel, ou maximiser les conversions sans cible |
| 15 à 30 | Maximiser les conversions |
| 30 et plus, stables | Coût par conversion cible, au niveau réel des 30 derniers jours ou légèrement au-dessus |

Modifier une cible par pas de 10 à 15 %, puis attendre 1 à 2 semaines. Une campagne peut dépenser jusqu'à 2 fois son budget sur une journée : juger sur la semaine.

**Marque et hors marque se lisent séparément.** Quelqu'un qui tape le nom de la venture la connaissait déjà : un coût bas sur la marque n'est pas une performance. Fixer les cibles sur le hors marque.

**Performance Max** : jamais en première campagne, ni avec une mesure fragile, ni avec un petit budget.

## LinkedIn

**Enchères.** Première semaine en enchère automatique, sans y toucher : on achète de la donnée. Ensuite, coût par clic manuel environ 20 % sous le coût moyen observé.

**Taille du public.** 50 000 à 300 000 personnes pour un public froid, jamais sous 15 000. Trop étroit, le coût s'envole et la diffusion s'arrête. Un public de reciblage fonctionne à partir de 1 000 personnes environ, pas en dessous de 300.

**Saturation** (personnes touchées en 30 jours ÷ taille du public) :
- moins de 25 % : on peut augmenter le budget ;
- 25 à 35 % : tenir ;
- 35 % et plus : le public est saturé, en ouvrir un autre plutôt qu'augmenter.

Doubler le budget augmente la part touchée de 50 à 70 %, pas de 100 %.

**Ce qui marche le mieux.** Une publication d'une personne (fondateur, associé) promue telle quelle obtient en général 3 à 6 fois plus de clics qu'une pub de page, pour un coût par clic bien inférieur. Bonne candidate : une publication qui a bien marché sans pub ; la laisser vivre 3 jours, puis la promouvoir. Document à faire défiler : 5 à 7 pages au format vertical, chaque page ajoute quelque chose.

**Repères de praticiens** (comptes américains, à recalibrer) : taux de clic vers la page de 0,3 à 0,55 % sur un public froid ; un formulaire intégré doit être rempli par plus de 8 % de ceux qui l'ouvrent, sinon il est trop long ou l'offre trop faible. Juger sur les clics vers la page, pas sur le taux de clic global, qui compte aussi les réactions.

**Les erreurs les plus fréquentes**, dans l'ordre : extension d'audience laissée active, réseau d'audience laissé actif, public trop petit, moins de 4 pubs par campagne, campagnes sous 10 résultats par semaine, pubs de plus de 3 mois, aucun public de reciblage, enchère automatique gardée indéfiniment.

## Règles communes pour couper

- Pub ou mot-clé récent : couper quand la dépense atteint 2 à 3 fois le coût cible sans aucune conversion.
- Pub installée (plus de 7 à 14 jours) : couper quand le coût par conversion tient 1,5 à 2 fois au-dessus du coût cible.
- Jamais sans remplaçante prête.

## Garde-fous

- Petits nombres : avant de dire qu'un mot-clé gaspille, calculer le taux de conversion qu'il lui faudrait pour être rentable et vérifier qu'il a eu assez de clics pour le montrer.
- Ne jamais additionner les conversions de Google, de LinkedIn et de Meta.
- Ne pas recommander une fonction dont on ne sait pas si le compte y a accès : écrire « à vérifier ».
- Toute décision se présente au format du skill « Bilan et recommandations ».

## Exemples

- Bien : « "formation entrepreneur annecy" : 38 clics, 2 pré-inscriptions, 61 € dépensés, soit 30,50 € par pré-inscription pour un coût cible de 50 €. Garder. »
- Mal : « Exclure "accompagnement" » sans rapport des termes de recherche : le mot peut porter des recherches qui convertissent.
