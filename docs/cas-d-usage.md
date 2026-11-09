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

## 04/11/2026 · Trier les prospects d'une venture d'essai (premier essai du mode essai)

**Type de demande.** « Trie les prospects de la venture » : donner une adéquation (A, B, C ou écarté) à des prospects dont les profils sont déjà lus.

**Ce qu'on avait imaginé.** Que le tri se fait en une passe, que chaque profil lu reçoit un verdict, et qu'une note posée est définitive.

**Ce qui s'est passé.** Fiche de tâche fidèle, 0 € d'Apify, compte rendu honnête (statut `partial`, chiffres, meilleurs profils). Trois défauts généraux :
1. L'agent a repéré trois exclusions douteuses (un seul indice : objet matériel, conseil hôtelier) mais n'a pas pu les corriger : `triage_prospects` ignore les prospects déjà triés, et l'outil ne le disait que par un compteur.
2. 11 profils lus sont restés sans verdict (« salarié sans projet »), alors que la grille a un C et un « écarté ».
3. Deux fiches pour une même personne n'avaient aucun endroit où être signalées.

**Ce qu'on fait désormais.**
1. `triage_prospects` a un mode `revise: true` : change une note, rouvre un écarté, garde l'ancienne note au journal (`anciennes_notes`), ne touche jamais un prospect déjà contacté. Sans lui, les prospects ignorés sont rendus (`skipped_ids`) avec la marche à suivre.
2. Skill `trier-les-prospects` v2 : un verdict pour chaque profil lu (un profil sans projet visible reçoit un C motivé, un profil illisible est nommé), écarter est plus lourd que noter bas (une exclusion sur un seul indice se note C avec son doute), révision par `revise`, doublons signalés avec leurs deux identifiants, jamais fusionnés d'office.
3. Les fiches Qualification et Gyna demandent au compte rendu les prospects sans verdict, les exclusions incertaines et les doublons.

**Reste ouvert.** Fusion de doublons (aucun outil : décision avec l'associé). Les recherches web des agents ne sont pas journalisées.

**Deuxième passage (même jour).** `revise` a tenu : les trois exclusions douteuses ont été rouvertes en C avec leur raison, l'ancienne note au journal, un décompte final vérifié, 0 €. Mais les 11 profils sans projet sont restés sans note, parce que Gyna avait écrit dans la fiche « conserver sans note les salariés sans projet établi » : une restriction qu'elle avait reprise de son premier tour, pas une demande de l'associé. Deux choses faites :
- **Règle du prompt de Gyna** : `exclusions` d'une fiche ne contient que ce que l'associé ou le brief exclut ; une restriction ajoutée de son chef se dit dans le plan et se fait confirmer ; en refaisant une mission déjà menée, elle reprend la demande de l'associé, pas les restrictions de sa fiche précédente.
- **Brief de L'Amorce** (décision de Thomas) : un salarié, y compris du numérique, sans projet entrepreneurial visible est un C ; un profil lu reçoit toujours une note (briefs v7, essai v2).

## 04/11/2026 · Qualification fine (publications, signaux, chaleur) sur la venture d'essai

**Type de demande.** « Fais la qualification fine des prospects A et B : lis leurs publications récentes, enregistre les signaux qui comptent et juge leur chaleur. »

**Ce qui s'est passé.** Fiche fidèle, 3 minutes, 0,03 € d'Apify, environ 520 000 tokens. 2 prospects chauds sur 8, avec 4 signaux datés et sourcés (les dates lues dans les adresses des publications étaient exactes), 6 laissés sans verdict parce que la lecture n'avait rendu aucune publication. Compte rendu honnête, y compris un doute sur l'adéquation d'un des deux chauds (elle coache aussi au Startup Weekend). Deux défauts généraux :
1. Le plafond de l'essai (5 lectures) s'appliquait appel par appel : l'agent a lu 5 puis 3 profils, 8 au total.
2. Une lecture vide ne se distinguait pas d'une lecture ratée : l'agent a refusé de classer six profils, alors que le lot avait répondu pour d'autres (une absence observée, pas un échec).

**Ce qu'on fait désormais.**
1. Le plafond de l'essai est par mission (`readsDone`, somme des lectures journalisées), pour les profils et pour les publications ; au-delà, l'outil le dit sans le présenter comme un échec.
2. `fetch_posts` rend pour chaque prospect `reading` : `posts`, `none_in_window` (la lecture a réussi, aucune publication originale dans la fenêtre) ou `unconfirmed` (personne n'a répondu dans le lot : à relire). Skill `qualification-chaleur` v8 : une absence observée se juge (froid, ou le niveau par défaut de maturité du brief), seul `unconfirmed` reste non qualifié.

**Reste ouvert.** « Chaud » pour un prospect qui construit déjà son projet sans chercher de retours explicites : la limite entre tiède et chaud reste à trancher avec les associés. Le brief dit 120 jours de fenêtre, CLAUDE.md parle encore de 60.

**Reprise des six sans verdict (même jour).** Gyna a repris la proposition de son tour précédent (sources publiques alternatives, recherche web) au lieu de relire les publications : 2 qualifiés sur 6 (un chaud avec une publication datée du 20/08, un tiède dont le signal vient d'un tiers et est dit tel quel), 4 laissés sans verdict avec la raison. L'agent a surtout trouvé une erreur de tri : une fiche notée B comme « fondatrice depuis 7 mois » était en réalité associée d'une agence créée en 1997 de 14 personnes (exclue par le brief). Le tri lisait la date du poste, pas l'âge ni la taille de l'entreprise. Skill `trier-les-prospects` v3 : avant d'accepter un A ou un B, si le brief exclut les entreprises établies et que le profil ne montre ni l'âge ni la taille, vérifier en une recherche web et citer ce qu'on a trouvé ; sans réponse, ne pas noter A et le dire. Reste ouvert : lire la taille de l'entreprise dans les données du profil si l'acteur la fournit.

## 04/11/2026 · Première approche pour deux prospects chauds (Rédaction, venture d'essai)

**Type de demande.** « Rédige une première approche pour deux prospects chauds, un brouillon par personne. »

**Ce qui s'est passé.** Fiche fidèle (les interdits du brief repris dans `exclusions`), 3 minutes, 0,0001 €, deux brouillons dans « À valider », rien d'envoyé. Le brouillon de l'un part d'un fait daté de ses publications (la recherche de retours pour son projet, en octobre), sans promesse, sans lien, au vouvoiement, avec une demande simple de 15 minutes. Défaut général : pour l'autre prospect, noté chaud avec un signal enregistré par la Qualification (une publication du 20/08), la Rédaction a relu ses publications chez LinkedIn, n'a rien trouvé, et l'a dit : « chaud mais aucune publication récente ». Elle n'avait aucun moyen de voir le signal déjà enregistré ni la raison de la chaleur : `get_prospects` ne rendait ni l'un ni l'autre. Le brouillon s'est replié sur le poste actuel de la personne (son employeur), moins pertinent et plus intrusif qu'une accroche sur son lancement.

**Ce qu'on fait désormais.** `get_prospects` rend `heat_reason` et les 8 signaux les plus récents (type, adresse, extrait, date). La fiche de la Rédaction demande de les relire avant d'écrire, et de ne relire les publications chez LinkedIn (payant) que si aucun signal n'est enregistré.

**Reste ouvert.** Les brouillons se terminent par « [Prénom] » : la signature d'un associé n'est pas encore dans le brief. L'action « lecture de publications » du journal s'étiquette « qualification » même quand c'est la Rédaction qui la lance.

## 04/11/2026 · Sourcing de porteurs de projet numérique récents (venture d'essai)

**Type de demande.** « Trouve-moi des porteurs de projet numérique à Annecy et en Haute-Savoie qui ont créé leur entreprise ou leur projet depuis moins d'un an. »

**Ce qui s'est passé.** Confirmation, fiche fidèle, intitulés larges (fondateur, cofondateur, founder, porteur de projet…), filtres « moins d'un an » et petite taille, plafond de l'essai respecté, 0,008 €, compte rendu honnête (« 2 profils correspondent clairement, pas 10 »). Sur 5 profils vérifiés, 2 étaient dans la cible : le filtre « moins d'un an » trouve des créateurs récents de tous les métiers (connecteurs industriels, pressings, marque de baskets). Le filtre par secteur existe et n'a pas été utilisé. Aucun moyen de savoir, d'une recherche à l'autre, quels réglages rapportent. Autre défaut : une fiche de tâche rendue avant une révision de notes garde l'ancien chiffre (`complete_task` ne se rend qu'une fois).

**Ce qu'on fait désormais.** Chaque recherche journalise les personnes trouvées (`prospect_ids`). L'outil gratuit `get_sourcing_yield` rend, par recherche passée de la venture, les réglages (intitulés, lieux, filtres, segment), les personnes trouvées, celles déjà notées au tri et la part de A et B. Le skill `sourcing-persona` (v12) demande de le relire avant de choisir les réglages, de citer dans le compte rendu ce qui a rapporté, et signale le filtre secteur pour une cible numérique avec son compromis (un secteur trop étroit écarte aussi de bons projets). Aucune règle imposée : l'agent décide.

**Reste ouvert.** Une fiche rendue avant une révision de notes n'est pas mise à jour. Le rendement n'est pas encore affiché dans l'app (page « Voir le travail » ou Prospects). Le jugement de la cible (qui est vraiment « numérique ») reste à mesurer avec un jeu de profils notés à la main.

## 04/11/2026 · Audit de la partie Création (Veille, Ads, Campagnes)

**Ce que l'audit a trouvé.** Boucle d'apprentissage d'Ads vide : 121 pubs refusées sur environ 169, 4 seulement avec une raison (champ facultatif), dont une centaine de refus en bloc le 26/10 qui ressemblent à un nettoyage. Pilotage quotidien de Campagnes : 0,8 à 2,3 millions de tokens par passage pour lire une liste d'entités et écrire un bilan, avec 90 000 tokens de contexte par appel. Hypothèse : le serveur MCP de Meta expose plus de quatre-vingts outils dont les descriptions sont chargées à chaque appel, de Gyna comme des sous-agents, y compris en prospection.

**Ce qu'on fait.**
1. `infra/hermes/mcp-tools.sh limit` : ne garde de `meta-ads` que les 28 outils que le pilotage utilise (`tools.include` de Hermes), avec `status` et `all` pour mesurer et revenir en arrière. À comparer sur les tokens d'un même passage avant et après.
2. Refus de pub ou de post avec **motif** (migration 0041, `ads.rejection_kind`) : un clic parmi angle, texte, ton, visuel, charte, doublon, autre, nettoyage, ou une raison écrite ; un refus sans motif est refusé par l'app. `get_ad_feedback` rend `motif`, `rejected_by_motif` et `cleanup_rejections` (les refus de nettoyage ne sont pas des retours).

**Reste ouvert.** Fiches Veille, Ads et Campagnes à reprendre dans le style de la prospection ; spécificités de L'Amorce (style d'affiche, Audience Network) à sortir des fiches vers la charte ; tests d'Ads en essai ; lien entre leads Meta et vraies pré-inscriptions.

## 09/11/2026 · Analyse d'une campagne Meta en cours : 7 minutes et 3 millions de tokens

**Demande.** « Fais-moi une analyse de la campagne ads en cours. »

**Ce qui s'est passé.** Fiche écrite en 32 secondes, sous-agent Campagnes au travail 5 minutes, bilan enregistré (13 000 caractères), puis tour de conclusion de Gyna. Le sous-agent a consommé environ 3 millions de tokens : des dizaines de lectures chez Meta et PostHog enchaînées, chacune relisant tout le contexte (dont les descriptions de plus de quatre-vingts outils Meta). Ces appels n'apparaissent pas au journal.

**Ce qu'on fait.** Outil MCP `get_campaign_snapshot` (migration : aucune) : la photo de la campagne en un appel, lue par l'app qui a déjà l'accès à Meta (`apps/web/src/lib/campaign-snapshot.ts`, route signée `POST /api/bridge/campaign-snapshot`, même signature que le pont) : enveloppe, dépense, par ensemble de pubs, par pub, par jour, avec taux de clic et coûts. Le serveur MCP n'a jamais de clé Meta ; il lui faut `APP_URL` et `BRIDGE_SECRET` dans `/etc/gyna/mcp.env`. Les fiches Gyna et Campagnes demandent de la lire en premier, et de ne relire chez Meta que liens, statuts de validation et placements.

**Reste ouvert.** Journaliser les appels externes des sous-agents (Meta, PostHog) ; mettre le parcours PostHog dans la photo ; limiter les outils Meta (`infra/hermes/mcp-tools.sh limit`).
