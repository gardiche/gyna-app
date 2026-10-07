# Gyna — contexte pour Claude Code

Gyna est l'agent d'acquisition (GTM) d'Alpact, venture builder en Savoie. Les trois associés lui confient des missions dans un chat ; Gyna orchestre trois sous-agents (Sourcing, Qualification, Rédaction) qui trouvent des prospects LinkedIn, jugent leur chaleur et rédigent une première approche. **Rien ne part vers l'extérieur sans la validation d'un associé.** Outil interne aujourd'hui, pensé pour être commercialisé plus tard (multi-organisation dès le schéma).

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
- `apps/mcp` : serveur MCP (HTTP streamable, Bearer `MCP_ACCESS_TOKEN`), **seul chemin d'écriture des agents vers la base**, via le rôle Postgres `gyna_mcp`. Chaque appel porte un `mission_token` (JWT HS256 signé par l'app, audience `gyna-mcp`) qui fixe org, mission et budget.
- Hermes v0.21.5, profil `gyna` dans `/root/.hermes/profiles/gyna` (`SOUL.md` = `infra/hermes/agents/gyna.md`). Modèle par défaut : `gpt-6-sol` via `openai-codex` ; modifiable par conversation dans l'app.

## Décisions prises

- Hermes est le moteur, l'interface est la nôtre. Les associés n'utilisent pas l'interface Hermes.
- Sous-agents : éphémères, lancés par Gyna avec `delegate_task`. Leur rôle est dans les fiches de `infra/hermes/agents/` (recopiées dans `gyna.md`). Pas de profil Hermes séparé pour l'instant ; à reconsidérer si on veut un modèle, des outils ou une conversation directe par agent. Paperclip écarté : il ferait doublon avec l'app (budgets, validations, journal).
- Skills : rédigés et versionnés dans l'app (page Skills), **attribués à un agent** (`skills.agent`, null = tous les agents) et activables. Chaque agent les charge avec l'outil MCP `get_agent_skills`. La mémoire des agents, c'est ce qui est écrit dans les skills et en base, pas une mémoire Hermes.
- Brief GTM par venture, versionné dans l'app.
- Chaleur : froid / tiède / chaud sur une fenêtre de 60 jours ; « chaud » exige un signal récent et sourcé.
- Données LinkedIn via Apify uniquement, sans cookies de compte personnel.
- Budget plafonné par mission ; au-delà, la mission attend l'accord d'un associé.
- Journal (`actions`) en ajout seul. Purge RGPD des prospects à 12 mois (pg_cron).
- Design : cadre sombre, cartes claires colorées (lavande, citron vert, orange flamme), chat au centre, police Plus Jakarta Sans, libellés de navigation en infobulle.

## Infrastructure en place

- Dépôt : `github.com/gardiche/gyna-app`, branche `main`. Pas de force push.
- Supabase : projet `gyna` (`vshcsaxkmitcbwygaaup`, eu-west-3). Migrations `packages/db/migrations/0001` à `0004` appliquées.
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

- Configurer Apify (jeton via `infra/hermes/setup-hermes.sh`, jamais dans le chat).
- Restreindre les outils du profil `gyna` : étape ajoutée dans `setup-hermes.sh` (liste blanche `delegation`, `todo`, `web` + MCP, mémoire Hermes coupée). À appliquer sur le VPS et vérifier que `hermes serve` utilise bien la plateforme `cli`.
- Mémoire des sous-agents (décidé, pas Hermes) : garder texte d'origine, texte final et raison de refus des brouillons, outil MCP `get_feedback(agent)`, outil `propose_skill_update` qui passe par « À valider ».
- Vérifier en conditions réelles `delegate_task` : modèle utilisé par les sous-agents, transmission du `mission_token`, noms des événements d'outils.
- Compléter le brief de L'Amorce dans l'app.
- Créer les comptes des deux autres associés (`allowed_emails`).
- Telegram (notifications de validation) : pas encore configuré.
- Variable `NEXT_PUBLIC_APP_URL` dans Vercel à confirmer.
