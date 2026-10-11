---
name: creer-des-pubs
agent: ads
description: Méthode pour créer un lot de publicités (Meta, LinkedIn, Google) à partir du brief, de la veille et des retours des associés : matière sourcée, angles distincts, variantes, limites de chaque plateforme, brief du visuel. À utiliser pour toute demande de création ou de déclinaison de pubs, avant d'appeler submit_ads.
---

# Créer un lot de pubs

Adapté de « ad-creative » et « ads » de Corey Haines (dépôt marketingskills, licence MIT), recentré sur une offre de formation ou d'accompagnement et sur les règles d'Alpact.

## Objectif

Un lot qu'un associé peut lancer après l'avoir relu : des angles réellement différents, des textes dans les limites de la plateforme, et pour chaque pub ce sur quoi elle s'appuie. On cherche à apprendre quel angle marche, pas à écrire douze fois la même pub.

## Entrées

- La demande de Gyna : plateforme, public visé, objectif, nombre de pubs (12 par défaut).
- Le brief (`get_brief`) : offre, promesse, persona, objections, ton, interdits.
- La veille (`get_watch_summary`, `get_competitor_ads`) : ce que tous disent, ce que personne ne dit, les pubs qui durent.
- Les retours (`get_ad_feedback`) : pubs refusées, corrigées, approuvées.
- La bibliothèque de visuels (`get_ad_references`) : logo, photos réelles, charte, inspirations.

Si l'offre ou la promesse du brief est « À compléter », s'arrêter et le dire à Gyna. Sans veille, continuer sur le brief seul et l'écrire dans `rationale`.

## Méthode

```
Lot de pubs :
- [ ] 1. Matière : faits utilisables et mots du public, avec leur source
- [ ] 2. Public et niveau de conscience (hypothèse écrite)
- [ ] 3. 3 à 5 angles distincts
- [ ] 4. Un modèle par angle (skill « Modèles de pubs »)
- [ ] 5. Écriture : accroche, texte, titre, bouton, brief du visuel
- [ ] 6. Contrôle : limites, interdits, tics, doublons
- [ ] 7. submit_ads, un lot par plateforme
```

**1. Matière.** Avant d'écrire, lister 8 à 12 éléments avec leur source, en deux colonnes qu'on ne mélange pas :
- **Faits** : ce que le brief affirme (durée, dates, lieu, prix, certification, format, accompagnement).
- **Mots du public** : objections et formulations du brief, thèmes des avis relevés par la veille.

Une plainte du public justifie un angle « douleur » ; elle ne prouve aucun chiffre. S'il manque une preuve (nombre d'anciens, taux de réussite, témoignage), elle reste entre crochets et se signale à Gyna.

**2. Public.** Écrire qui lit la pub et ce qu'il sait déjà : ne connaît pas le problème, connaît le problème, compare les solutions, connaît l'offre. C'est une hypothèse : si rien ne tranche, faire le lot sur deux niveaux et le dire.

**3. Angles.** Un angle est une raison de cliquer. En choisir 3 à 5 qui ne se ressemblent pas :

| Angle | Ce qu'il dit |
|---|---|
| Douleur | La situation qui coince, dans les mots du public |
| Résultat | Ce qui aura changé à la fin |
| Identité | « Pour celles et ceux qui… » : le lecteur se reconnaît |
| Preuve | Un fait vérifiable du brief |
| Objection | La réponse à ce qui retient (prix, temps, légitimité) |
| Contre-pied | Une idée reçue du public, corrigée par un fait |
| Échéance | Une date réelle du brief |

Au moins un angle vient de « Ce que personne ne dit » dans la veille, et un d'une objection du brief. Un angle refusé par un associé ne revient pas ; un angle approuvé se prolonge avec d'autres mots.

**4. Modèles.** Un modèle par angle, en variant : voir le skill « Modèles de pubs ».

**5. Écriture.** Par défaut 12 pubs : 4 angles, 3 variantes chacun. Entre deux variantes d'un même angle, changer **une seule chose** (l'accroche, la preuve ou le modèle), sinon on ne saura pas ce qui a fait la différence. Accroches et titres : skill « Accroches et titres ».

**6. Contrôle.** Compter les caractères, relire contre les interdits du brief et la liste des tics, comparer aux pubs déjà approuvées.

**7. Soumission.** `submit_ads` avec `rationale` : d'où viennent les angles, ce qui manquait, l'hypothèse de public. Si le lot est refusé pour un texte trop long, raccourcir et soumettre à nouveau.

## Limites par plateforme

| Plateforme | Texte principal | Titre | Description |
|---|---|---|---|
| Meta | 125 caractères visibles avant « voir plus » : l'accroche tient dedans | 40 recommandés | 30 recommandés |
| LinkedIn | 150 visibles, 600 au plus | 70 recommandés, 200 au plus | 100 recommandés |
| Google (recherche) | 90 au plus : c'est la description | 30 au plus | sans objet |

**Google** : chaque ligne du lot est un titre et une description d'une même annonce, que Google combine librement. Chaque titre doit tenir seul. Prévoir au moins un titre avec le mot recherché, un avec le bénéfice, un avec l'action.

**Où mettre la connaissance du public.** Sur Meta, le ciblage est large et c'est la pub qui trie : nommer le public dans l'accroche ou le visuel. Sur LinkedIn, le ciblage par poste est précis : la pub peut aller droit à l'offre. Sur Google, le lecteur vient de taper sa question : reprendre ses mots.

## Brief du visuel

`visual_brief` doit suffire à un graphiste : la scène, qui est à l'image, le texte incrusté **exact**, le style, le format (carré ou 4:5 pour le fil, 9:16 pour les stories). Une seule idée par visuel, lisible sur un téléphone. Préférer une vraie photo ou un rendu simple à un visuel léché : ce qui ressemble à une pub se fait ignorer. Le titre et le visuel ne répètent pas la même chose.

**Bibliothèque.** Partir des images déposées par les associés (`get_ad_references`) : reprendre les couleurs et la typographie de la charte, utiliser les vraies photos quand elles conviennent (« photo réelle n° 2, recadrée »), suivre le style d'une inspiration en tenant compte de la note de l'associé. Le visuel est généré ensuite par un associé, à partir de ce brief seul : il doit se comprendre sans voir les images. Ne pas décrire de logo à dessiner : écrire « coin bas droit dégagé pour le logo ».

## Bouton et page d'arrivée

Le bouton est un de ceux de la plateforme (« En savoir plus », « S'inscrire », « Nous contacter », « Télécharger »), choisi selon l'action demandée par le brief. La page d'arrivée doit reprendre la promesse de la pub mot pour mot : si elle ne le fait pas, l'écrire dans `hypothesis` pour l'associé.

## Garde-fous

- **Rien d'inventé** : ni chiffre, ni témoignage, ni nombre d'inscrits, ni places restantes. Ce qui manque reste entre crochets.
- **Financement** : seulement dans les termes exacts du brief. Jamais « gratuit », « 100 % financé », « sans reste à charge », ni de montant pris en charge.
- **Aucune promesse de résultat** : pas de revenus, de clients ni de réussite garantis.
- **Certification** : l'intitulé et le niveau tels qu'écrits dans le brief.
- **Pas d'attribut personnel affirmé** sur l'âge, la santé ou la situation financière du lecteur (« Vous êtes au chômage ? ») : les plateformes le refusent. Une situation professionnelle se décrit sans l'affirmer : « Pour les salariés qui… ».
- **Aucun concurrent nommé**, aucun texte ni visuel de concurrent repris : la veille sert à comprendre, pas à copier.
- **Échéance** : une date réelle du brief peut être citée ; jamais d'urgence fabriquée.
- Vouvoiement, sauf si le ton du brief dit autre chose.

## Exemples

- Bien (`grounding`) : « Brief, objections : "7 000 €, c'est cher" ; veille : aucun concurrent ne montre de plan de financement. »
- Mal : « Inspiré des bonnes pratiques. » (rien de vérifiable)
- Bien (variantes) : même angle « Identité », même texte, deux accroches différentes.
- Mal : trois pubs qui changent à la fois l'angle, le modèle et la longueur.
- Mal : « Rejoignez les 200 entrepreneurs déjà formés » alors que le brief ne donne aucun nombre.
