---
name: constituer-une-liste
agent: tous
description: Méthode pour constituer et classer une liste de personnes à partir d'une source précise (événement, communauté, annuaire, liste fournie) selon les critères propres à la demande, avec des faits vérifiés et sourcés. À utiliser quand la demande a sa propre grille de classement ou une source à part, plutôt que la recherche par titre et lieu du brief.
---

# Constituer une liste depuis une source

## Objectif

Une liste de personnes reliées à une source précise, classées selon la grille de la demande, dont chaque ligne repose sur un fait vérifié, daté et sourcé. Ce qu'on ne sait pas reste « inconnu », ce qu'on ne peut pas vérifier reste « vérification impossible ».

## Entrées

- La fiche de tâche : la source visée, l'échelle de la liste et ses critères, les exclusions, le volume.
- Le brief de la venture, pour le contexte seulement : sa grille d'adéquation ne s'applique pas à la liste.

## Méthode

```
Liste :
- [ ] 1. La source, identifiée et vérifiée
- [ ] 2. Les personnes, trouvées par leurs traces publiques
- [ ] 3. Chaque personne reliée à la source par un fait daté
- [ ] 4. Enregistrement, puis rangement dans la liste
- [ ] 5. Compte rendu : faits, inconnus, limites
```

**1. La source.** La nommer exactement, la dater, et vérifier ce nom et ces dates sur une source officielle ou publique (site de l'organisateur, page de l'annuaire, annonce). Si plusieurs occurrences existent (plusieurs éditions, plusieurs promotions), retenir celle que la demande vise ou, à défaut, la plus récente effectivement tenue, et dire laquelle. Ne rien déduire d'un nom ou d'une date qu'on n'a pas vus.

**2. Les personnes.** Chercher leurs traces publiques : publications des participants et des organisateurs, pages de résultats ou de présentation, listes publiques, annonces de partenaires. Ne pas se limiter aux plus visibles (les gagnants, les profils qui se présentent d'une certaine façon) si la demande ne le dit pas. Un seul passage peut donner moins que le volume demandé : le dire, sans compléter artificiellement.

**3. Relier à la source.** Pour chaque personne, un fait précis et daté qui la relie à la source (« a publié le … qu'elle y a présenté tel projet »). Une mention vague ou indirecte ne suffit pas pour le meilleur niveau : elle donne « à vérifier ». Distinguer, quand la demande le veut, les rôles (porteur, membre, organisateur…) et ne retenir ceux que la demande exclut que s'ils ont aussi un autre rôle utile, en le précisant.

**4. Enregistrer et ranger.** `upsert_prospects` enregistre la personne une fois (elle est unique dans la venture), `create_list` crée la liste avec l'échelle de la demande si elle n'existe pas, `add_to_list` y range la personne : niveau de l'échelle, raison en une phrase, champs utiles à la demande (rôle, projet, stade, ce qui reste à clarifier), sources avec leur date exacte (`decode_linkedin_dates` pour une publication LinkedIn). Une personne déjà connue (note du brief, écartée, contactée) est rangée quand la demande la vise : on note son état existant dans les champs de la liste, on ne le modifie pas. Relire la liste une fois après l'avoir remplie suffit (`get_list`) : pas de seconde vérification, ni de compte rendu rendu plusieurs fois.

**5. Faits, inconnus, hypothèses.** Avant d'écrire « inconnu » ou « non vérifié » sur une personne déjà enregistrée, relire ce que l'app en sait (`get_prospects`, gratuit : titre, lieu, faits du profil lu et sa date) et citer sa provenance ; ne garder « non vérifié » que pour ce qui manque encore. Si une information utile manque et que le profil n'a jamais été lu, proposer à Gyna la lecture complète avec son coût plutôt que de la lancer. Séparer ensuite ce qui est vérifié, ce qui est inconnu et ce qui n'est qu'une hypothèse. Une source inaccessible (profil qui refuse l'accès, page en erreur) donne « vérification impossible » : son contenu n'est pas tenu pour vérifié. Une déduplication avec une liste qu'on ne peut pas lire se dit « non effectuée ».

## Sortie

Pour Gyna : la source vérifiée (nom, dates, adresse), le nombre de personnes par niveau de l'échelle, les limites de la recherche et de la vérification, ce qui reste à faire. Les lignes elles-mêmes sont dans la liste (`get_list`).

## Garde-fous

- Aucun nom, rôle, projet, lien, date ni propos inventé ; aucune adresse e-mail devinée.
- Rien ne se déduit d'une appartenance à la source (ni lieu de résidence, ni intention, ni besoin).
- Sources et canaux publics seulement, sans cookies ni compte personnel ; aucune donnée sensible.
- Le classement de la demande n'écrase jamais la note du brief ni le statut d'un prospect.

## Exemples

- **Événement.** Source : une édition datée d'un événement. Traces : publications de participants, page de résultats de l'organisateur. Échelle fournie par la demande : A (lien établi et intention exprimée), B (lien établi, intention à confirmer), C (lien à vérifier).
- **Communauté en ligne.** Source : le groupe ou le canal nommé par l'associé. Traces : publications et réponses publiques dans le groupe. Échelle : actif récemment, présent, à vérifier.
- **Annuaire ou liste fournie.** Source : la liste donnée. Traces : les profils publics correspondant à chaque ligne. Échelle : identifié sans doute, identifié avec doute, introuvable.
