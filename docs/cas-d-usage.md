# Cas d'usage détectés

Chaque mission réelle qui ne se passe pas comme on l'avait imaginé est un cas d'usage à apprendre. On ne corrige pas « pour cette demande » : on note ce que le cas montre de général, et on ajoute la capacité qui manquait, pour toutes les demandes du même genre. Une entrée garde le fil : ce qui était demandé, ce qu'on avait imaginé, ce qui s'est passé, et comment on le fait désormais.

Format d'une entrée : **Type de demande** (sans nom propre) · **Ce qu'on avait imaginé** · **Ce qui s'est passé** · **Ce qu'on fait désormais** (la capacité générale, où elle vit) · **Reste ouvert**.

---

## 04/11/2026 · Constituer un ensemble nommé de personnes depuis une source externe, avec la grille de l'associé

**Type de demande.** L'associé veut un ensemble de personnes tirées d'une source précise (un événement, une communauté, un annuaire, une liste fournie), classées selon **ses propres critères**, avec des faits vérifiés et sourcés, et un livrable précis (résumé, tableau, fiches).

**Ce qu'on avait imaginé.** Que toute demande de prospection passe par la recherche par intitulé de poste et par lieu, puis par le tri du brief (A, B, C selon l'adéquation de la venture).

**Ce qui s'est passé.** Le système a bien tenu : confirmation avant de lancer, fiche de tâche fidèle, recherche gratuite par le web, honnêteté sur les limites, rien d'inventé, 8 minutes. Quatre défauts généraux sont apparus :
1. Les personnes existaient déjà dans le CRM avec une note de la grille du brief. La grille de la demande, avec les mêmes lettres A, B, C, disait autre chose : deux classements se contredisaient et seul le premier était enregistré.
2. Un profil déjà écarté par la grille du brief a été exclu de la demande, alors que celle-ci disait que le métier et le statut ne comptaient pas : un jugement ancien, posé avec d'autres critères, a décidé pour la demande en cours.
3. Les dates des sources restaient « il y a 3 semaines », alors que la demande voulait la date des signaux.
4. Le fil de la demande se perdait : après un « ok » de confirmation, la mission suivante ne contenait que « ok ».

**Ce qu'on fait désormais.**
1. **Listes** (`prospect_lists`, `prospect_list_members`, outils `create_list`, `add_to_list`, `get_list`, migration 0039) : un classement propre à une demande vit dans une liste, avec son échelle, la raison, des champs libres et les sources, à côté de la note du brief qu'il ne touche pas. La page Prospects filtre par liste et montre les deux classements séparés.
2. **Règle générale du prompt de Gyna** : un jugement posé ailleurs (note du brief, écarté, chaleur, statut) répond à une autre question et n'exclut personne d'une demande qui a d'autres critères ; il se signale à côté. Skill `constituer-une-liste` pour la méthode (source vérifiée, traces publiques, fait daté qui relie, faits et inconnus séparés).
3. **Dates exactes** : `decode_linkedin_dates` et lecture automatique par `add_signals` (l'identifiant d'une publication LinkedIn contient son heure de création). Vaut pour tout signal LinkedIn, pas seulement pour cet événement.
4. **La fiche de tâche relit les messages de l'associé dans toute la conversation** (`get_task`), pas seulement ceux de la mission en cours.

**Deuxième passage, après ces changements (même jour).** Les trois capacités ont tenu : une liste avec l'échelle de l'associé, la note du brief intacte, un profil déjà écarté conservé dans la liste avec son état, des dates exactes, et la précision « dépense le moins possible » relue après le « ok ». Trois défauts généraux restaient :
- Un sous-agent a rendu son compte rendu trois fois et vérifié deux fois ce qu'il avait déjà enregistré (4 minutes et des jetons pour rien) : `complete_task` ne se rend plus qu'une fois (l'outil refuse une tâche déjà en `done`), et les fiches le disent.
- Des métiers et statuts restaient « non vérifiés » alors que l'app avait déjà lu ces profils : nouvel outil gratuit `get_prospects` (titre, lieu, faits du profil lu et sa date, note du brief, état, listes) ; les fiches et le skill demandent de le relire avant de dire « inconnu », et de proposer la lecture complète (0,004 $ par profil) au lieu de la lancer.
- Les gestes `add_to_list` du journal étaient attribués à « Gyna » même quand un sous-agent les faisait : l'étiquette se déduit désormais de l'unique tâche ouverte de la mission (une déduction pour le journal, pas une identité).

**Reste ouvert.** Déduplication avec des sources que Gyna ne peut pas lire (un espace de notes interne, la liste d'un autre associé) : demande d'accès en lecture seule à décider. Mode d'essai pour tester sans polluer le CRM ni dépenser (voir la discussion du 04/11/2026).
