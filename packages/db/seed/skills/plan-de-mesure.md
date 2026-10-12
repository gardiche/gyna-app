---
name: plan-de-mesure
agent: campagnes
description: Rédige le plan de mesure d'une venture avant toute dépense publicitaire : l'événement qui compte, ce qu'il faut installer sur le site et dans chaque plateforme, la convention des liens balisés, le consentement et les vérifications. À utiliser quand un associé demande de préparer le tracking, ou avant tout plan de campagne si aucun plan de mesure n'existe.
---

# Plan de mesure

Adapté de « conversion-tracking » et « platform-setup-checklists » (ads, Corey Haines, licence MIT), avec les obligations françaises de consentement.

## Objectif

Qu'au premier euro dépensé, on sache quelle pub a amené quelle pré-inscription. Une campagne lancée sans mesure ne peut être ni jugée ni corrigée.

## Entrées

- Le brief : ce qu'est une conversion pour la venture (pour L'Amorce, une pré-inscription envoyée) et l'adresse du site.
- Ce que l'associé dit du site : outil de construction, qui a la main, ce qui est déjà installé.
- Les plateformes prévues.

Si l'on ne sait pas ce qui se passe après l'envoi du formulaire (page de remerciement ou non), le demander : tout le plan en dépend.

## Méthode

1. **Nommer la conversion principale** : une seule, celle qui vaut de l'argent. Elle se déclenche **après** l'envoi confirmé (page de remerciement ou événement de succès), jamais au clic sur le bouton.
2. **Nommer une ou deux conversions secondaires** en amont (page de l'offre vue, formulaire commencé, simulateur utilisé) : elles servent de repli quand la principale est trop rare pour que la plateforme apprenne.
3. **Un seul point d'installation** : Google Tag Manager sur toutes les pages, puis chaque outil dedans (Google Analytics, pixel Meta, balise Google Ads, Insight Tag LinkedIn). Le site n'est modifié qu'une fois.
4. **Consentement** : en France, aucun pixel publicitaire ne se déclenche avant l'accord du visiteur. Prévoir un bandeau de consentement relié à Tag Manager (mode consentement de Google compris), avec un refus aussi simple que l'acceptation.
5. **Liens balisés** : un lien par pub, selon la convention ci-dessous.
6. **Vérifications** avant lancement, puis enregistrer le plan (`save_campaign_doc`, type `mesure`).

## Convention des liens balisés

```
utm_source   = meta | google | linkedin
utm_medium   = paid
utm_campaign = [venture]_[objectif]_[public]_[mois]      ex. amorce_preinscription_salaries_oct
utm_content  = [référence courte de la pub]              celle de get_approved_ads
utm_term     = mot-clé (Google seulement)
```

Tout en minuscules, sans accent ni espace. La référence de la pub dans `utm_content` est ce qui relie un résultat à une pub de l'app.

## Par plateforme

| Plateforme | À créer | À vérifier |
|---|---|---|
| Meta | Compte Business, compte publicitaire, pixel, domaine vérifié, événement « Lead » sur la pré-inscription, événements classés par importance | Événement visible dans le Gestionnaire d'événements ; qualité de correspondance au-dessus de 6 |
| Google | Compte Google Ads relié à Google Analytics, marquage automatique activé, conversion « pré-inscription » importée | Conversion de test comptée une seule fois |
| LinkedIn | Page entreprise reliée à Campaign Manager, Insight Tag, conversion par adresse de la page de remerciement | Balise active dans Campaign Manager |

L'envoi côté serveur (API de conversions) améliore la mesure sur Meta. Le recommander dès que le site le permet ; ce n'est pas un préalable au lancement d'un test.

## Sortie

```markdown
## En bref
La conversion principale, l'état actuel (ce qui est installé ou non), ce qui bloque le lancement.

## Ce qu'on mesure
| Événement | Rôle | Quand il se déclenche | Où |

## À installer, dans l'ordre
Liste numérotée, chaque étape avec qui la fait (associé, personne qui gère le site) et comment vérifier qu'elle est faite.

## Liens balisés
La convention, puis un lien complet par pub approuvée.

## Vérifications avant lancement
Liste à cocher.

## Ce qui reste inconnu
```

## Vérifications avant lancement

- [ ] Une vraie pré-inscription de test apparaît dans chaque plateforme, une seule fois.
- [ ] L'événement se déclenche après l'envoi, pas au clic.
- [ ] Testé sur ordinateur et sur téléphone, y compris depuis le navigateur intégré d'Instagram ou de LinkedIn.
- [ ] Visiteur qui refuse les cookies : aucun pixel ne part.
- [ ] Le trafic de l'équipe est exclu.
- [ ] Chaque lien balisé arrive sur la bonne page, qui se charge en moins de 3 secondes sur téléphone.

## Garde-fous

- Ne jamais écrire qu'un outil est installé sans l'avoir vu ou sans que l'associé l'ait confirmé : « non vérifié ».
- Ne jamais additionner les conversions de deux plateformes : elles ne comptent pas sur la même fenêtre. Les comparer côte à côte, et arbitrer avec Google Analytics ou le nombre réel de pré-inscriptions reçues.
- Aucune donnée personnelle d'un visiteur dans un lien.
- Tu n'installes rien toi-même : tu écris quoi poser, où, et comment vérifier.

## Exemples

- Bien : « Conversion principale : pré-inscription envoyée, déclenchée sur la page /merci. État : non vérifié, l'associé indique que rien n'est installé. »
- Mal : « Le pixel est en place. » (jamais vu)
- Mal : conversion déclenchée au clic sur « Envoyer » : un formulaire en erreur compterait comme une pré-inscription.
