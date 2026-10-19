# Direction produit de Gyna

Document de travail pour Thomas et les sessions de code. Il sert à donner une cohérence d'ensemble avant de reprendre les fonctions une par une. Étapes : 1. état des lieux (ci-dessous), 2. direction (questions à trancher), 3. structure cible, 4. feuille de route fonction par fonction.

## 1. État des lieux (19/10/2026)

### Ce qui existe

| Fonction | Agent | Page | Ce qui s'est passé en vrai | Qui décide |
|---|---|---|---|---|
| Chat et missions | Gyna | `/`, `/c/[id]`, `/nouvelle` | 18 conversations, 67 missions | L'associé lance, Gyna délègue |
| Prospection LinkedIn | Sourcing, Qualification, Rédaction | `/prospects` | 156 prospects trouvés et triés, **0 brouillon de message** | L'agent propose, l'associé valide chaque message |
| Veille concurrentielle | Veille | `/veille` | 12 concurrents profilés | L'agent seul (lecture) |
| Publicités | Ads | `/pubs` | 40 pubs proposées, 5 approuvées | L'agent propose, l'associé valide pub par pub |
| Posts Instagram et LinkedIn | Ads (second mode) | `/posts` | 28 posts proposés, 6 publiés | L'agent propose, l'associé valide puis publie ou planifie |
| Campagnes | Campagnes | `/campagnes` | 31 versions de documents (mesure, plan, bilan) | Meta : **l'agent pilote seul** dans une enveloppe ; Google et LinkedIn : l'agent propose |
| Venture et brief | aucun | `/ventures` | 1 venture (L'Amorce) | L'associé écrit le brief |
| Skills des agents | aucun | `/skills` | 26 skills | L'associé valide chaque modification proposée par Gyna |
| Validations | aucun | `/validations` | 14 en attente | L'associé |
| Journal | aucun | `/journal` | Tout ce que font les agents | Lecture |
| Fiches des agents | aucun | `/agents/[clé]` | 7 fiches, lecture seule | Le code |
| Tableau de bord | aucun | `/dashboard` | Absent du menu, atteint seulement depuis l'aperçu | Lecture |

Le menu de gauche a 10 entrées, une par outil : Chat, Prospects, Validations, Veille, Pubs, Posts, Campagnes, Ventures, Skills, Journal.

### Ce qui tient bien, à garder

- **Rien ne part sans un associé**, sauf le pilotage Meta, qui est encadré par trois garde-fous.
- **La mémoire des agents vit dans l'app** : skills versionnés, textes d'origine et corrections gardés, raisons de refus. Les agents apprennent de vos décisions.
- **Le brief par venture** sépare ce qui dépend de L'Amorce de ce qui vaut pour toute venture.
- **Le multi-organisation dès le schéma**, utile le jour où l'outil se vend.

### Ce qui manque de cohérence

1. **Trois règles d'autonomie différentes.** Pour les messages LinkedIn, l'associé valide chacun. Pour les posts, l'associé valide puis publie lui-même. Pour les pubs Meta, l'agent dépense seul dans une enveloppe. Chaque règle se défend, mais aucun principe ne dit laquelle appliquer à une nouvelle fonction.
2. **Valider se fait à quatre endroits** : `/validations`, `/pubs`, `/posts` et les brouillons dans le chat. Une validation de lot reste « en attente » tant qu'une seule pub du lot n'est pas décidée.
3. **L'unité de travail est floue.** On travaille par conversation, mais Gyna ouvre une mission à chaque message, les agents produisent des lots, et l'objectif (50 pré-inscriptions) appartient à la venture. Aucun écran ne montre une venture de bout en bout.
4. **Le menu est rangé par outil, pas par objectif.** Pour savoir « où en est-on des 50 pré-inscriptions ? », il faut ouvrir Campagnes (Meta seulement), Posts (sans chiffres) et Prospects (sans suite). Le tableau de bord n'est pas dans le menu.
5. **La prospection s'arrête au tri.** 156 prospects triés, aucun message rédigé ni envoyé : la chaîne existe, mais elle ne produit rien pour l'instant.
6. **Un agent fait deux métiers.** Ads crée les pubs et les posts, avec les mêmes tables mais deux pages et deux logiques de publication (Meta par le pilotage, Instagram par l'app).
7. **Ce qui marche se mesure mal.** Les pubs Meta ont leurs chiffres ; les posts publiés n'en ont aucun ; les prospects n'ont pas de suivi de réponse. Impossible de comparer les canaux sur le seul chiffre qui compte, le coût par pré-inscription.
8. **La fiabilité vient d'être reprise à la main** : le jeton de mission, la suspension des appels par Hermes, une limite de dépenses Meta à 30 € qui a coupé les pubs ce matin. L'app ne prévient pas quand quelque chose s'arrête.

## 2. Direction : questions à trancher

Chaque réponse servira à trancher les fonctions une par une.

1. **Pour qui, dans les six prochains mois ?** Vous trois sur L'Amorce, ou déjà une deuxième venture, ou un premier client extérieur ? La réponse dit jusqu'où pousser le multi-venture et la configuration.
2. **La promesse, en une phrase.** Par exemple « remplir une promotion sans y passer ses journées », ou « une équipe d'acquisition complète pour chaque venture ».
3. **La place de l'humain.** Proposition : une seule grille, selon le risque.
   - Lire, chercher, analyser : l'agent seul.
   - Produire un texte ou un visuel : l'agent propose, l'associé valide.
   - Sortir vers l'extérieur ou dépenser : seulement dans un cadre fixé par un associé (enveloppe, calendrier, liste), avec arrêt automatique et alerte.
4. **L'unité de travail.** Proposition : la venture et son objectif, avec les canaux en dessous (prospection, pubs, posts). Le chat devient la façon de passer commande, pas le lieu où l'on suit le travail.
5. **Ce qu'on arrête ou met de côté.** Par exemple : Google et LinkedIn Ads tant que Meta n'est pas rentable, ou la prospection LinkedIn si elle ne débouche pas d'ici le 15/11.
6. **L'horizon.** Ce qui doit servir avant la clôture du 15/11 (pré-inscriptions de L'Amorce), et ce qui peut attendre la refonte.

## 3. Hypothèse de départ, à discuter

Gyna est **l'équipe d'acquisition d'une venture**. On ouvre une venture, on lui donne un objectif chiffré et une date, et l'app s'organise autour :

- **Objectif** : où on en est (pré-inscriptions, coût par pré-inscription, jours restants), tous canaux confondus.
- **Canaux** : prospection, pubs, posts, chacun avec ce qui tourne, ce qui attend et ce que ça rapporte.
- **À décider** : une seule file pour tout ce qui attend un associé, triée par urgence.
- **Équipe** : les agents, leurs skills et le journal, pour ceux qui veulent regarder sous le capot.

Avant le 15/11, on ne refond pas : on resserre sur ce qui produit des pré-inscriptions et on mesure chaque canal sur le même chiffre.

## 4. Suite

- Thomas répond aux questions de la partie 2.
- On en tire la structure cible : parcours, navigation, objets.
- Puis la feuille de route, fonction par fonction : pour chacune, l'écart entre l'existant et la cible, et l'ordre de travail.
