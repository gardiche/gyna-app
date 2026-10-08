---
name: piloter-l-objectif
agent: gyna
description: Part de l'objectif d'inscrits d'une venture, remonte l'entonnoir avec les taux réels (get_venture_stats) et dit si le rythme tient, ce qu'il manque par semaine et quelle action lancer, avec son indicateur et son critère d'arrêt. À utiliser quand un associé demande de faire le point, si l'objectif est tenable, ou quoi faire en priorité.
---

# Piloter l'objectif d'une venture

Idées reprises de « marketing-plan » de Corey Haines (dépôt marketingskills, licence MIT) : budget calculé à rebours depuis l'objectif, et « l'espoir n'est pas une stratégie ».

## Objectif

En une réponse, un associé sait : où en est la venture par rapport à son objectif, si le rythme actuel suffit, ce qu'il faut produire chaque semaine pour le tenir, et la prochaine action à lancer.

## Entrées

- `get_venture_stats` : objectif, entonnoir, chaleur, brouillons, taux réels, rythme récent, dépense.
- `get_brief` : l'échéance (date de démarrage, clôture des inscriptions…) se trouve dans l'offre.

Sans objectif chiffré ni échéance, le dire et demander les deux : c'est indispensable au calcul.

## Méthode

```
Point :
- [ ] 1. Objectif et échéance relevés, semaines restantes calculées
- [ ] 2. Taux choisis : réels si assez de données, sinon hypothèses annoncées
- [ ] 3. Entonnoir remonté depuis l'objectif
- [ ] 4. Besoin par semaine comparé au rythme des 7 derniers jours
- [ ] 5. Goulot identifié
- [ ] 6. Une action proposée, avec mécanisme, indicateur et critère d'arrêt
```

**1. Objectif.** Viser le bas de la fourchette (`goal.min`) pour le calcul, et le dire. Restant = objectif − inscrits.

**2. Taux.** Utiliser les taux réels de `get_venture_stats` seulement à partir de 20 contactés pour le taux de réponse et de 5 réponses pour le taux d'inscription. En dessous, prendre ces hypothèses et l'écrire noir sur blanc :

| Étape | Hypothèse par défaut |
|---|---|
| Contacté → a répondu | 20 % |
| A répondu → inscrit | 20 % |
| Chaud qualifié → contacté | 80 % (brouillons approuvés puis envoyés) |

**3. Remonter.** Contacts nécessaires = restant ÷ (taux de réponse × taux d'inscription). Chauds nécessaires = contacts ÷ 0,8. Retirer ce qui est déjà en cours : réponses en attente, chauds sans brouillon, brouillons à valider ou approuvés non envoyés.

**4. Rythme.** Besoin par semaine = contacts restants ÷ semaines restantes. Comparer à `recent.contacted_7d`. Écart de plus de 30 % : le rythme ne tient pas.

**5. Goulot.** La première étape qui bloque, dans cet ordre :

| Constat | Goulot | Action type |
|---|---|---|
| Brouillons à valider ou approuvés non envoyés | Validation ou envoi | Rappeler aux associés de valider ou d'envoyer |
| Chauds sans brouillon | Rédaction | Mission « Écris aux chauds » |
| Beaucoup à examiner, peu qualifiés | Qualification | Mission « Qualifie les prospects en attente » |
| Peu de chauds parmi les qualifiés | Ciblage | Revoir le persona ou les segments, étude du public |
| Taux de réponse réel sous 10 % | Message | Revoir le skill de première approche avec les associés |
| Rien de tout ça | Volume | Mission de sourcing |

**6. Action.** Chaque action proposée nomme son **mécanisme** (pourquoi elle devrait marcher), son **indicateur** (ce qu'on mesure et quand) et son **critère d'arrêt**. « Envoyer plus de messages et voir » n'est pas une action.

## Sortie

```markdown
**[L'objectif tient / est en retard / est hors d'atteinte au rythme actuel] : [une phrase]**

- Objectif : N inscrits d'ici [échéance], N semaines ; inscrits : N
- Entonnoir : N prospects → N qualifiés (N chauds) → N contactés → N réponses → N inscrits
- Taux : réponse N % [réel | hypothèse], inscription N % [réel | hypothèse]
- Il faut : N contacts de plus, soit N par semaine ; rythme actuel : N par semaine
- En cours : N brouillons à valider, N chauds sans brouillon, N réponses à suivre

**Goulot** : [étape], parce que [constat chiffré]

**Action proposée** : [action]
- Mécanisme : [pourquoi]
- Indicateur : [quoi, mesuré quand]
- Critère d'arrêt : [seuil et délai]
```

## Garde-fous

- Ne jamais présenter une hypothèse comme un taux réel.
- Ne pas promettre l'objectif : dire « tient au rythme actuel » ou « ne tient pas », avec les chiffres.
- Une seule action proposée ; les autres pistes vont en une ligne à la fin, si besoin.

## Exemple

Objectif « 10 à 15 », échéance dans 8 semaines, 1 inscrit. 12 contactés, 2 réponses : trop peu de données, hypothèses à 20 % et 20 %. Restant 9 → 9 ÷ 0,04 = 225 contacts, soit 28 par semaine ; rythme actuel 4 par semaine. 6 chauds sans brouillon.

```markdown
**L'objectif est en retard : il faut 28 contacts par semaine, on en fait 4.**

- Objectif : 10 inscrits d'ici 8 semaines ; inscrits : 1
- Entonnoir : 64 prospects → 30 qualifiés (9 chauds) → 12 contactés → 2 réponses → 1 inscrit
- Taux : réponse 20 % [hypothèse], inscription 20 % [hypothèse]
- Il faut : 225 contacts de plus, soit 28 par semaine ; rythme actuel : 4 par semaine
- En cours : 0 brouillon à valider, 6 chauds sans brouillon, 1 réponse à suivre

**Goulot** : rédaction, 6 chauds attendent un brouillon.

**Action proposée** : écrire aux 6 chauds cette semaine.
- Mécanisme : ce sont les prospects les plus susceptibles de répondre, déjà qualifiés.
- Indicateur : brouillons approuvés et envoyés d'ici vendredi, réponses à J+7.
- Critère d'arrêt : moins d'une réponse sur 6 après 10 jours, on revoit le message avant d'en écrire d'autres.

Ensuite : sourcing pour atteindre 28 contacts par semaine.
```
