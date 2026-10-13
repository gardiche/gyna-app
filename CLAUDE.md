# Gyna — contexte pour Claude Code

Gyna est l'agent d'acquisition (GTM) d'Alpact, venture builder en Savoie. Les trois associés lui confient des missions dans un chat ; Gyna orchestre cinq sous-agents : Sourcing, Qualification et Rédaction trouvent des prospects LinkedIn, jugent leur chaleur et rédigent une première approche ; Veille analyse les concurrents et leurs publicités ; Ads crée des publicités ; Campagnes prépare leur mesure et leur diffusion, et propose où mettre le budget. **Rien ne part vers l'extérieur sans la validation d'un associé.** Outil interne aujourd'hui, pensé pour être commercialisé plus tard (multi-organisation dès le schéma).

Première venture : **L'Amorce** (bootcamp, objectif 10 à 15 apprenants).

Le README décrit l'architecture et l'installation pas à pas. Ce fichier résume les décisions et l'état du projet.

## Langue et ton

- Échanges avec Thomas : en français, tutoiement.
- Tout ce que l'app ou les agents produisent pour l'extérieur (messages aux prospects) : vouvoiement.
- Textes d'interface : français, phrases complètes et sobres.

## Architecture

```
Navigateur ─▶ App Next.js (Vercel) ─▶ Pont Gyna (VPS) ─▶ hermes serve (VPS, profil « gyna »)
                    ▲                                         │
                    │ temps réel                              ▼
                 Supabase ◀──────── Serveur MCP Gyna ◀── agents + Apify
```

- Monorepo pnpm 10 + Turborepo, TypeScript, Zod (`packages/schemas`).
- `apps/web` : Next.js 15 App Router sur Vercel, Supabase (Auth email + mot de passe, RLS, Realtime). Déploiement automatique à chaque push sur `main`.
- `apps/bridge` : Fastify + WebSocket JSON-RPC vers `hermes serve` (127.0.0.1:9119). Requêtes app→pont signées HMAC (`x-gyna-ts`, `x-gyna-signature`), réponses en SSE, callback `POST /api/bridge/turn-complete` pour enregistrer la réponse finale.
- `apps/mcp` : serveur MCP (HTTP streamable, Bearer `MCP_ACCESS_TOKEN`), **seul chemin d'écriture des agents vers la base**, via le rôle Postgres `gyna_mcp`. Chaque appel porte un `mission_token` qui fixe org, mission et budget : une clé courte `gm-xxxxx-xxxxx-xxxxx-xxxxx` créée par l'app à chaque mission (seule son empreinte est en base, `missions.token_hash`, valable 6 h). Le JWT d'origine, trop long, était mal recopié par les agents et refusé par le MCP ; il reste accepté pour compatibilité.
- Hermes v0.21.5, serveur dédié au profil (`hermes -p gyna serve --isolated` : sans cela les appels hors session, comme `image.generate`, lisent le profil par défaut de la machine), profil `gyna` dans `/root/.hermes/profiles/gyna` (`SOUL.md` = `infra/hermes/agents/gyna.md`). Modèle par défaut : `gpt-6-sol` via `openai-codex` ; modifiable par conversation dans l'app. Les sous-agents peuvent tourner sur un modèle plus léger : `GYNA_SUBAGENT_MODEL=<identifiant> bash infra/hermes/setup-hermes.sh` écrit `delegation.model` dans le profil (un seul modèle pour tous les sous-agents, Hermes ne permet pas d'en choisir un par délégation) ; le modèle choisi dans l'app ne vaut alors plus que pour Gyna.

## Décisions prises

- Hermes est le moteur, l'interface est la nôtre. Les associés n'utilisent pas l'interface Hermes.
- Délégation asynchrone : dans `hermes serve`, `delegate_task` tourne en arrière-plan et Hermes relance Gyna dans un nouveau tour quand ses sous-agents ont fini (pas de réglage pour forcer le synchrone). Le pont suit chaque mission au-delà du premier tour (`apps/bridge/src/missions.ts`) : événements `subagent.start`/`subagent.complete` → `POST /api/bridge/activity` (journal), tours de suite → `POST /api/bridge/turn-complete` avec `followup` ; la mission reste « running » et la session verrouillée tant qu'un sous-agent travaille ou qu'une délégation attend son résultat (30 min sans nouvelles : mission close). Gyna préfixe chaque goal par `[Sourcing]`, `[Qualification]` ou `[Rédaction]`. L'app reçoit messages et journal en temps réel.
- Sous-agents : éphémères, lancés par Gyna avec `delegate_task`. Leur rôle est dans les fiches de `infra/hermes/agents/` (recopiées dans `gyna.md`). Pas de profil Hermes séparé pour l'instant ; à reconsidérer si on veut un modèle, des outils ou une conversation directe par agent. Paperclip écarté : il ferait doublon avec l'app (budgets, validations, journal).
- Skills : rédigés et versionnés dans l'app (page Skills), **attribués à un agent** (`skills.agent`, null = tous les agents) et activables. Chaque agent les charge avec l'outil MCP `get_agent_skills`. La mémoire des agents, c'est ce qui est écrit dans les skills et en base, pas une mémoire Hermes.
- Contenu des skills : relu dans le dépôt (`packages/db/seed/skills/*.md`, format Objectif / Entrées / Méthode / Sortie / Garde-fous / Exemples, description « ce que fait le skill et quand l'utiliser » à la troisième personne, évaluations dans `evaluations.md`), chargé en base avec `node packages/db/scripts/skills-to-sql.mjs` (nouvelle version seulement si le contenu change). Ce qui dépend d'une venture va dans son brief, pas dans un skill.
- Brief GTM par venture, versionné dans l'app ; source relue dans `packages/db/seed/briefs/<venture>.md` (champs du brief, objectif, fenêtre, segments), chargée avec `node packages/db/scripts/brief-to-sql.mjs <venture>`. L'Amorce : programme d'entrepreneuriat de 16 semaines (25/01 → 14/05/2027, Annecy), cible porteurs de projet, créateurs, entrepreneurs et salariés qui veulent entreprendre, en Auvergne-Rhône-Alpes et à Genève ; pour Gyna, « inscrit » = pré-inscription sur amorce-campus.fr ; objectif 50 pré-inscriptions avant la clôture du 30/10/2026 ; consigne : du volume, brouillons pour les chauds et les tièdes.
- Chaleur : froid / tiède / chaud sur une fenêtre de 60 jours ; « chaud » exige un signal récent et sourcé.
- Données LinkedIn via Apify uniquement, sans cookies de compte personnel.
- Budget plafonné par mission ; au-delà, la mission attend l'accord d'un associé.
- Outils du profil `gyna` en liste blanche (`setup-hermes.sh`) : `delegation`, `todo`, `web`, `vision` (visuels des pubs, pour la Veille) et les serveurs MCP ; `hermes serve` utilise la plateforme `cli`. Mémoire Hermes coupée. `desktop_project` (toolset `project`, injecté par `hermes serve`) laissé : inoffensif sans fichiers ni terminal. Les sous-agents ne peuvent pas avoir plus d'outils que Gyna. Rouvrir un outil : `hermes -p gyna tools enable <nom>` et l'ajouter à `KEEP_TOOLSETS`.
- Mémoire des sous-agents : en base, pas dans Hermes. Les brouillons gardent le texte proposé (`drafts.original_body`, figé par trigger), le texte final corrigé par un associé (`body`) et la raison du refus (`rejection_reason`). L'outil MCP `get_feedback` les rend à la Rédaction et à la Qualification avant chaque tâche.
- Faire évoluer un agent : on le demande à Gyna dans le chat. Elle appelle `propose_skill_update` (contenu complet + raison) ; la proposition (`skill_proposals`) passe par « À valider » avec l'avant et l'après, et ne crée la nouvelle version du skill qu'après l'accord d'un associé. Les fiches des agents (outils, ordre de travail, sécurité) restent dans le code et ne se modifient pas par un skill.
- Page de chaque agent (`/agents/[clé]`) en lecture seule : la fiche affichée est celle de `infra/hermes/agents/*.md`, intégrée au build de l'app (règle webpack `asset/source`, entrées turbo). Équipe listée sous les conversations, dans la colonne de gauche du chat.
- Veille concurrentielle : agent `veille` (fiche `infra/hermes/agents/veille.md`, skills `profiler-un-concurrent`, `decortiquer-les-pubs`, `synthese-de-la-veille`). Tables `competitors` (fiche markdown observé / déduit / implications), `competitor_ads` (texte tel quel et analyse : angle, accroche, promesse, public ; dédoublonnées par lien de la bibliothèque) et `watch_summaries` (versions en ajout seul). Sources : bibliothèques publicitaires publiques de Meta, LinkedIn et Google via Apify sans cookies, et la recherche web. Visuels lus avec l'outil Hermes `vision`. Aucune performance de pub n'est disponible : une longue diffusion sert d'indice. Page `/veille`.
- Création de pubs : agent `ads` (fiche `infra/hermes/agents/ads.md`, skills `creer-des-pubs`, `modeles-de-pubs`, `accroches-et-titres`). Il part du brief, de la veille (`get_watch_summary`, `get_competitor_ads`) et des retours (`get_ad_feedback`), et soumet des lots avec `submit_ads` : tables `ad_batches` et `ads` (texte proposé figé dans `ads.original`, version corrigée dans les colonnes, raison du refus). Les limites de caractères par plateforme (`AD_LIMITS` dans `packages/schemas`) sont vérifiées par le MCP et dans l'app. Une validation `ad_batch` par lot ; chaque pub se décide sur la page `/pubs` et la validation se clôt quand il n'en reste plus en attente. Visuels : générés à la demande d'un associé (bouton « Générer le visuel » de la page `/pubs`), jamais par l'agent. L'app appelle `POST /images` du pont, qui appelle la RPC Hermes `image.generate` (fournisseur `openai-codex` : `gpt-image-2` par l'abonnement ChatGPT, sans clé d'API ; qualité et taille seulement indicatives) et reçoit l'image en data URL ; l'app la range dans le bucket public `gyna-media` (`ad_images`, plusieurs versions par pub). Cette RPC n'accepte que du texte : les références de la bibliothèque (`venture_assets` : logo, photos, charte, inspirations) entrent dans la consigne par leur description, écrite par l'agent Ads avec l'outil de vision (`get_ad_references`, `describe_ad_reference`), et par la note de l'associé. Passer à GPT Image 2.5 demande une clé d'API OpenAI et `image_gen.provider: openai`. Pas d'accès aux comptes publicitaires, rien n'est publié. Pilotage des campagnes (lecture des performances) : plus tard.
- Posts LinkedIn et Instagram : second mode de l'agent `ads` (skills `ligne-editoriale`, `ecrire-des-posts`, `carrousels`, outil `submit_posts`). Mêmes tables que les pubs (`ad_batches.kind = 'post'`, `author` = page ou associé, `ads.slides` pour les carrousels, `scheduled_for`, `published_at`) et même validation post par post, page `/posts` avec la liste « À publier ». Les limites de chaque réseau (`POST_LIMITS`) sont vérifiées par le MCP. Publication : jamais par un agent. Sur un post approuvé, un associé choisit « Publier maintenant » (avec confirmation) ou une heure (`ads.scheduled_at`, `publish_status`) ; le pont sert d'horloge et appelle chaque minute `POST /api/bridge/publish-due`, qui publie ce qui est dû (`apps/web/src/lib/publish.ts`, verrou par passage à `publishing`). Instagram seulement pour l'instant, par l'API Graph de Meta : posts à une image et carrousels de 2 à 10 diapositives. Variables Vercel `META_ACCESS_TOKEN` et `META_IG_USER_ID` (et `META_GRAPH_VERSION` facultative), posées par Thomas. Un carrousel demande une image par diapositive (`ad_images.slide` : 0 = couverture ou visuel unique, n = diapositive de rang n), générée à partir de son texte ou déposée (`CarouselVisuals`) ; seules les diapositives qui ont une image sont publiées, dans l'ordre (couverture obligatoire, 2 images au moins), et l'app le dit avant la confirmation ; le générateur ne voit pas les autres images, la cohérence de la série tient à la consigne. Un post Instagram peut partir en même temps sur la Page Facebook (case « Publier aussi sur la Page Facebook », `ads.also_facebook`, `facebook_url` ; variable Vercel `META_PAGE_ID`, autorisation `pages_manage_posts` sur le jeton) : Facebook est publié après Instagram, et son refus est signalé sur le post sans défaire la publication Instagram. LinkedIn : copie manuelle puis « Marquer comme publié ». Les visuels d'un lot se génèrent d'un clic (`BatchVisuals`), et un visuel fait ailleurs se dépose sur le post.
- Gestion de campagnes : agent `campagnes` (fiche `infra/hermes/agents/campagnes.md`, skills `plan-de-mesure`, `structurer-les-campagnes`, `piloter-meta`, `piloter-google-et-linkedin`, `bilan-et-recommandations`). Il lit les pubs approuvées (`get_approved_ads`) et les chiffres que l'associé donne dans le chat, et enregistre trois documents versionnés (`campaign_docs` : mesure, plan, bilan ; `save_campaign_doc`, `get_campaign_docs`), affichés page `/campagnes`. Toutes les règles de décision sont des multiples du coût cible par pré-inscription. Hors Meta (Google, LinkedIn) : l'agent propose, un associé décide et applique.
- Pilotage autonome sur Meta (décision de Thomas du 13/10/2026, qui remplace « l'agent propose, un associé applique » pour Meta) : une fois les pubs approuvées et une enveloppe activée par un associé (page `/campagnes`, table `ad_pilots` : budget total, dates, coût visé), l'agent Campagnes lance et pilote seul, avec le serveur MCP officiel de Meta (`https://mcp.facebook.com/ads`, outils `ads_*`, jeton de l'utilisateur système de rôle Employé ; branché sur le profil par `GYNA_META_ADS=1 bash infra/hermes/setup-hermes.sh`, jeton demandé sans affichage). Skill `piloter-en-autonomie`. Garde-fous, du plus sûr au moins sûr : le plafond de dépenses du compte publicitaire, fixé par un associé chez Meta ; l'app elle-même, qui relit la dépense toutes les dix minutes (`POST /api/bridge/pilot-due`, appelé par le pont) et met tout en pause si l'enveloppe est atteinte ou la période finie, et le bouton « Tout mettre en pause » (`apps/web/src/lib/pilot.ts`, variables Vercel `META_ACCESS_TOKEN` et `META_AD_ACCOUNT_ID`) ; les outils MCP `get_ad_pilot` (`may_act`) et `record_ad_launch` (seules les pubs approuvées, `ads.external_id` et `external_status`) ; les consignes de l'agent. Hermes ne permet pas de réserver les outils `ads_*` à un seul sous-agent : c'est une consigne de la fiche de Gyna, pas une barrière. Un passage par jour à partir de 8 h (Paris), dans une conversation « Pilotage des pubs » créée par l'app. Suivi page `/campagnes` (`PilotDashboard`, `apps/web/src/lib/pilot-report.ts`) : dépense sur l'enveloppe, pré-inscriptions et coût, résultats par pub et par jour, lus chez Meta par l'app à chaque affichage, sans agent, et derniers gestes de l'agent tirés du journal. Non testé en conditions réelles au 13/10/2026.
- Consommation : le modèle passe par `openai-codex` (abonnement ChatGPT, pas de facturation au token), donc pas de coût en euros côté OpenAI. Le pont relève les tokens de la session de Gyna (événements Hermes `session.usage`, écart depuis le début de la mission) et ceux que les sous-agents déclarent à leur fin, et les envoie à `POST /api/bridge/usage` (`missions.usage`, un relevé toutes les 8 s). Le bandeau « Consommation » de la colonne de droite remplace « À valider » (les validations restent dans la barre de gauche). Quota de l'abonnement : lu par `GET /usage/bars` du pont (RPC Hermes `usage.bars`, forme non documentée, lue avec prudence par `/api/usage/quota`).
- Chat : un associé peut joindre des fichiers à un message (images, PDF, texte, CSV, JSON ; 4 Mo, 6 par message). Ils sont déposés dans le bucket public `gyna-media` (`POST /api/files`), listés dans `messages.attachments`, et leur adresse est ajoutée au message envoyé à Gyna (avec le contenu des fichiers texte courts) ; Gyna lit les images avec la vision et les documents par leur adresse. Une conversation se supprime depuis la liste (`DELETE /api/conversations/[id]`) : messages, missions et fichiers joints partent, ce que les missions ont produit et le journal restent.
- Journal (`actions`) en ajout seul. Purge RGPD des prospects à 12 mois (pg_cron).
- Design : cadre sombre, cartes claires colorées (lavande, citron vert, orange flamme), police Plus Jakarta Sans, libellés de navigation en infobulle. Écran Chat en trois colonnes : conversations et équipe à gauche, chat au centre (avancement de mission, brouillons modifiables), suivi de mission, consommation et venture à droite.

## Infrastructure en place

- Dépôt : `github.com/gardiche/gyna-app`, branche `main`. Pas de force push.
- Supabase : projet `gyna` (`vshcsaxkmitcbwygaaup`, eu-west-3). Migrations `packages/db/migrations/0001` à `0022` appliquées (la 0013 crée le bucket Storage `gyna-media`, hors tests PGlite).
- VPS Hermes : `178.104.189.227` (Caddy, hôte `gyna.178-104-189-227.sslip.io`). Code dans `/opt/gyna`, services systemd `gyna-bridge`, `gyna-mcp`, `gyna-hermes-serve`. Node système 22 dans `/usr/bin/node` (le Node privé de Hermes n'est pas lisible par l'utilisateur `gyna`).
- Mettre à jour le VPS après un push :
  ```bash
  cd /opt/gyna && git pull -q origin main \
   && PATH=/usr/bin:$PATH pnpm install --frozen-lockfile \
   && PATH=/usr/bin:$PATH pnpm --filter @gyna/schemas build \
   && PATH=/usr/bin:$PATH pnpm --filter @gyna/bridge build \
   && PATH=/usr/bin:$PATH pnpm --filter @gyna/mcp build \
   && chown -R root:gyna /opt/gyna \
   && cp infra/hermes/agents/gyna.md /root/.hermes/profiles/gyna/SOUL.md \
   && systemctl restart gyna-mcp gyna-bridge gyna-hermes-serve
  ```

## Règles de sécurité

- Ne jamais demander ni afficher en clair : `BRIDGE_SECRET`, `MISSION_JWT_SECRET`, `MCP_ACCESS_TOKEN`, clé `service_role`, mot de passe de la base, jeton Apify. Thomas les copie directement aux bons endroits.
- Le `mission_token` ne doit jamais apparaître dans les réponses de Gyna.
- Ne pas toucher au profil Hermes par défaut, à la passerelle Telegram existante, ni au serveur n8n (autre VPS).

## Vérifier avant de pousser

```bash
pnpm --filter @gyna/web exec tsc --noEmit
pnpm --filter @gyna/web build
pnpm --filter @gyna/mcp build && pnpm --filter @gyna/mcp test   # PGlite, vraies migrations
```

## Reste à faire

- **Urgent** : configurer Apify (jeton via `infra/hermes/setup-hermes.sh`, jamais dans le chat) ; les pré-inscriptions de L'Amorce ferment le 30/10/2026.
- Vérifier en conditions réelles le suivi des délégations asynchrones (logs `subagent_event` du pont : ID de session des événements d'enfants, champs reçus). Le `mission_token` est bien transmis aux sous-agents (vérifié le 08/10).
- Créer les comptes des deux autres associés (`allowed_emails`).
- Telegram (notifications de validation) : pas encore configuré.
- Variable `NEXT_PUBLIC_APP_URL` dans Vercel à confirmer.
