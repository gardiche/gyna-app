---
name: piloter-meta
agent: campagnes
description: Règles pour juger les pubs Meta (Facebook, Instagram) à partir du coût cible : quand attendre, couper, remplacer, faire passer une pub en diffusion, augmenter le budget, et comment repérer l'usure. À utiliser pour tout bilan ou toute décision sur une campagne Meta en cours.
---

# Piloter une campagne Meta

Adapté de « meta-decision-system » et « meta-andromeda-playbook » (ads, Corey Haines, licence MIT). Tous les seuils sont des points de départ, à recalibrer sur les chiffres du compte.

## Objectif

Des décisions qu'on peut justifier par un chiffre et un seuil, prises au bon moment : ni trop tôt sur du bruit, ni trop tard sur de l'argent perdu.

## Entrées

- Le coût cible du plan de campagne. Toutes les règles en sont des multiples.
- Par pub, sur 14 jours glissants : dépense, impressions, répétition (fréquence), clics, pré-inscriptions, et si possible combien de pré-inscriptions étaient dans la cible.
- La date de mise en ligne de chaque pub.

Sans ces chiffres, ne rien décider : dire lesquels manquent.

## Étape 1 : la pub est-elle diffusée ? (jour 7)

- Dépense attendue au minimum = (budget par jour de la campagne ÷ nombre de pubs actives) × 7 × 0,5.
- En dessous, ou à zéro : la plateforme ne la montre pas. La couper et retravailler seulement l'accroche, le visuel ou le format.

## Étape 2 : la pub vaut-elle son coût ? (chaque semaine, 14 jours glissants)

Dans l'ordre, s'arrêter à la première règle qui s'applique :

1. Dépense inférieure à 3 fois le coût cible : **attendre**. Il n'y a pas assez de données.
2. Dépense de 3 fois le coût cible ou plus et aucune pré-inscription : **remplacer et abandonner le concept**.
3. Qualité, quand l'associé a dit qui était dans la cible :
   - des pré-inscriptions mais aucune dans la cible : remplacer, garder la forme, changer l'angle ;
   - moins de 40 % dans la cible : remplacer et nommer plus clairement le public dans la pub ;
   - 40 à 60 % : surveiller une semaine de plus ;
   - 60 % ou plus : passer au coût.
4. Coût par pré-inscription dans la cible :
   - au coût cible ou en dessous : **candidate à la diffusion** ;
   - entre 1 et 1,5 fois : surveiller ;
   - au-delà de 1,5 fois : remplacer.

## Passer une pub de « Test » à « Diffusion »

Toutes ces conditions à la fois : au moins 5 pré-inscriptions dans la cible, 60 % ou plus dans la cible, coût au niveau du coût cible ou en dessous, en ligne depuis 14 jours, au moins une pré-inscription dans les 7 derniers jours.

## L'usure

| Répétition moyenne | Public froid | Reciblage |
|---|---|---|
| Sain | 1 à 2,5 | 2 à 4 |
| À surveiller | 2,5 à 4 | 4 à 6 |
| Critique | plus de 4 | plus de 6 |

Autres signes, du plus urgent au moins urgent : taux de clic en baisse de 20 % sur 7 jours ; coût pour mille impressions en hausse de 30 % sur 2 semaines ; coût par pré-inscription qui monte à ciblage constant.

Durée de vie habituelle : 2 à 4 semaines pour une image, 3 à 5 pour une vidéo courte ou un carrousel. Quand le taux de clic a perdu 30 % depuis son sommet ou que la répétition est critique, le concept est épuisé : le retirer, ne pas le retoucher.

## Remplacer

- Ne jamais couper sans remplaçante prête. S'il n'y en a pas, reporter le budget sur les pubs qui marchent et demander un lot à l'agent Ads.
- Ne jamais modifier une pub qui marche : la modification efface ce que la plateforme a appris. Mettre en pause n'efface rien. Ajouter la nouvelle à côté.
- Ce qu'on change dépend de la cause : pas diffusée → accroche ou visuel ; mauvaise cible → angle et public nommé ; trop chère → offre ou page d'arrivée ; usée → nouvelle exécution du même concept.
- Compter environ 6 tests pour une gagnante : 1 variante d'une gagnante sur 4 réussit, 1 concept nouveau sur 10.

## Augmenter le budget

Seulement si tout est vrai : coût au niveau du coût cible depuis 2 semaines, répétition du compte sous 3, au moins 3 remplaçantes prêtes.

- Palier de 20 % tous les 5 jours. Jamais 30 % ou plus d'un coup.
- Si le coût dépasse 1,5 fois le coût cible après une hausse : baisser de 20 à 30 % tout de suite, stabiliser 2 semaines, reprendre à 10 % par semaine.
- Ne jamais augmenter le budget plus vite que le stock de pubs qui marchent.

## Trop peu de conversions

La plateforme apprend bien autour de 50 conversions par semaine sur l'événement visé. Si la pré-inscription n'y arrive pas, optimiser sur une conversion plus fréquente en amont et le dire dans le bilan. Formulaire intégré à Meta ou page du site : page si elle convertit à 5 % ou plus, formulaire intégré si elle est sous 2 %.

## Rythme de la semaine

Lundi : juger les pubs en test et vérifier l'usure. Mercredi : mettre en ligne les remplaçantes, contrôle de diffusion des pubs à 7 jours. Vendredi : paliers de budget ou retours en arrière. Chaque mois : revoir le coût cible.

## Garde-fous

- Un coût qui double sur 6 pré-inscriptions est du bruit : vérifier le nombre de conversions et le délai entre le clic et la pré-inscription avant toute décision.
- Repères de praticiens (comptes américains de logiciels, à recalibrer) : taux de clic de 1 à 1,5 %, coût pour mille de 10 à 20 dollars. Ils situent, ils ne jugent pas.
- Toute décision se présente à l'associé au format du skill « Bilan et recommandations ».

## Exemples

- Bien : « Pub a1b2c3d4 : 162 € dépensés, soit 3,2 fois le coût cible de 50 €, 0 pré-inscription en 12 jours. Règle 2 : remplacer et abandonner l'angle "Échéance". Remplaçante prête : e5f6a7b8. »
- Mal : « La pub a1b2c3d4 ne marche pas, je la couperais. » (ni chiffre, ni seuil, ni remplaçante)
- Mal : couper une pub à 40 € dépensés pour un coût cible de 50 € : elle n'a pas encore eu sa chance.
