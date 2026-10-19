# Direction produit de Gyna

Document de travail pour Thomas et les sessions de code. Il sert à donner une cohérence d'ensemble avant de reprendre les fonctions une par une. Étapes : 1. état des lieux, 2. décisions de direction, 3. structure cible, 4. feuille de route, à reprendre fonction par fonction.

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

## 2. Direction : décisions du 19/10/2026

1. **Pour qui.** Aujourd'hui L'Amorce seule ; demain d'autres ventures, puis des clients. La venture devient un **espace de travail complet** : en changer change tout (conversations, prospects, veille, contenus, campagnes, validations), comme si chaque venture avait sa propre Gyna. Un client est une organisation ; ses ventures sont à l'intérieur.
2. **La promesse.** Piloter toute la stratégie GTM d'une venture avec Gyna : trouver la cible et la prospecter, animer les réseaux sociaux (posts), mener les publicités.
3. **La place de l'humain.** Un associé valide toujours les décisions. Lire, chercher et analyser restent libres ; tout ce qui produit, sort vers l'extérieur ou dépense passe par un associé. Le pilotage entièrement confié à l'IA viendra plus tard, fonction par fonction.

**Exception assumée : le pilotage autonome sur Meta** (décision du 13/10, confirmée le 19/10). Activer une enveloppe (budget total, dates, coût visé) est la décision de l'associé ; dans ce cadre, l'agent Campagnes lance, met en pause et répartit le budget seul, sur les seules pubs approuvées. Ses garde-fous restent : le plafond du compte chez Meta (à aligner sur l'enveloppe), la relecture de la dépense par l'app toutes les dix minutes, le bouton « Tout mettre en pause ». Toute autre fonction qui voudrait la même autonomie demande une décision explicite.

Restent ouvertes : ce qu'on arrête ou met de côté (question 5), et ce qui doit servir avant le 15/11 (question 6).

## 3. Structure cible

### Hiérarchie

```
Organisation (Alpact, puis chaque client)
├── Réglages communs : membres, équipe d'agents et skills, facturation
└── Venture (L'Amorce, …) : un espace complet
    ├── Brief, objectif chiffré, date, bibliothèque (logo, photos, charte), comptes reliés
    ├── Cible : segments, prospects, messages
    ├── Contenus : posts et pubs, une seule bibliothèque
    ├── Diffusion : calendrier des posts, campagnes payantes, résultats
    ├── Veille : concurrents, pubs, synthèse
    ├── Conversations avec Gyna
    ├── À décider : une seule file
    └── Journal
```

Les **skills restent communs à l'organisation** : ils décrivent la méthode de l'équipe. Ce qui dépend de la venture va dans son brief (règle déjà en place). Une surcharge de skill par venture pourra venir si un client en a besoin.

Une **personne prospectée reste unique dans l'organisation** (pas de doublon, purge RGPD à 12 mois), mais elle n'apparaît dans une venture que par son suivi propre (adéquation, chaleur, messages) : c'est déjà le rôle de `prospect_ventures`.

### Navigation

- En haut du menu, le **sélecteur de venture**, comme un espace de travail. Tout ce qui suit est filtré par la venture choisie.
- Menu de la venture, rangé par pilier GTM plutôt que par outil :
  1. **Cockpit** : objectif, avancement, coût par objectif tous canaux confondus, ce qui tourne, ce qui attend. Il remplace le tableau de bord et la colonne « venture » du chat.
  2. **Chat** : les conversations de la venture.
  3. **Cible** : segments, prospects, messages de prospection.
  4. **Contenus** : posts et pubs ensemble, filtrés par format et par réseau.
  5. **Diffusion** : calendrier des posts, campagnes, résultats par canal.
  6. **Veille**.
  7. **À décider** : toutes les validations de la venture, triées par urgence, chacune ouverte sur place.
  8. **Journal**.
- En bas : **Équipe** (agents, skills) et **Paramètres**, communs à l'organisation.

### Ce qu'il faut changer dans les données

Déjà rattachés à une venture : conversations (et leurs messages), missions, lots de pubs et de posts (et leurs pubs, posts, visuels), brief, segments, suivi des prospects et signaux, veille, documents de campagne, enveloppe Meta, bibliothèque.

À rattacher :
- **Validations** (`approvals`) et **journal** (`actions`) : une colonne `venture_id`, pour la file « À décider » et le journal de chaque venture.
- **Comptes reliés** : la page Instagram, la Page Facebook et le compte publicitaire Meta sont aujourd'hui des variables Vercel, uniques pour toute l'app. Une deuxième venture publierait sur le compte de L'Amorce. Il faut une table des connexions par venture, avec les jetons hors de la base ou chiffrés.
- **Mesure** : un lien suivi (UTM) par post, pub et message, pour ramener chaque canal au même chiffre, le coût par objectif.

## 4. Feuille de route proposée

Chaque étape se reprend une par une, avec l'écart entre l'existant et la cible.

**Avant le 15/11, sans rien casser pour L'Amorce :**
1. **Mesure commune** : liens suivis sur les posts, pubs et messages ; cockpit de l'objectif (pré-inscriptions, coût, jours restants).
2. **Une seule file « À décider »** pour la venture, qui remplace les quatre endroits actuels.
3. **Alertes du pilotage Meta** : prévenir un associé quand la diffusion s'arrête (plafond du compte atteint, pub refusée, enveloppe épuisée), comme le 19/10 où les pubs se sont coupées sans que l'app le signale.

**Ensuite, la venture comme espace :**
4. Sélecteur de venture, et tout filtré par venture (validations et journal compris).
5. Comptes reliés par venture (Instagram, Facebook, Meta Ads).
6. Navigation par piliers : Cible, Contenus, Diffusion.
7. Prospection menée jusqu'au message (aujourd'hui, la chaîne s'arrête au tri).
8. Création guidée d'une venture (brief, objectif, comptes) : le premier pas vers un client.
