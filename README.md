# Gyna

Cockpit d'acquisition d'Alpact. Les associés confient des missions à Gyna dans un chat ; Hermes fait travailler ses sous-agents (sourcing, qualification, rédaction) ; l'app garde les données, les validations et le journal.

```
Navigateur ─▶ App Next.js (Vercel) ─▶ Pont Gyna (VPS) ─▶ hermes serve (VPS)
                    ▲                                         │
                    │ temps réel                              ▼
                 Supabase ◀──────── Serveur MCP Gyna ◀── agents + Apify
```

- `apps/web` : l'interface et les routes API (Next.js, Supabase).
- `apps/bridge` : le pont signé entre l'app et `hermes serve` (WebSocket JSON-RPC, streaming SSE).
- `apps/mcp` : les outils des agents, seul chemin d'écriture vers la base.
- `packages/schemas` : schémas et règles partagés.
- `packages/db` : migrations SQL et données de départ.
- `infra` : VPS (services, proxy, script d'installation) et configuration des agents Hermes.

## Brancher Gyna, dans l'ordre

### 1. Secrets

Générez trois secrets et gardez-les sous la main :

```
openssl rand -hex 32   # BRIDGE_SECRET  (app + pont)
openssl rand -hex 32   # MISSION_JWT_SECRET  (app + MCP)
openssl rand -hex 32   # MCP_ACCESS_TOKEN  (MCP + Hermes)
```

### 2. Supabase

1. Créez un projet (région Europe).
2. Dans l'éditeur SQL, exécutez dans l'ordre : `packages/db/migrations/0001_init.sql`, `0002_mcp_role.sql`, puis `0003_purge_schedule.sql` après avoir activé l'extension pg_cron (Database > Extensions).
3. Remplacez les emails des associés dans `packages/db/seed/seed.sql`, puis exécutez-le.
4. Donnez un mot de passe au rôle du MCP : `alter role gyna_mcp with password '…';`
5. Authentication > Sign In / Providers > Email : désactivez « Allow new users to sign up ». Seuls les comptes créés à la main peuvent se connecter.
6. Authentication > Users > Add user : créez un compte par associé (email du seed, mot de passe, « Auto Confirm User » coché). Le rattachement à Alpact se fait automatiquement.

### 3. VPS (pont et MCP)

1. Créez un sous-domaine (par exemple `gyna-bridge.alpact.fr`) pointant vers le VPS.
2. Poussez ce dépôt sur GitHub, puis sur le VPS : `sudo bash infra/vps/install.sh <url du dépôt>` (depuis un clone du dépôt).
3. Complétez `/etc/gyna/bridge.env` et `/etc/gyna/mcp.env` (modèles dans `apps/*/.env.example`).
4. Ajoutez le bloc de `infra/vps/Caddyfile` (ou `nginx-gyna-bridge.conf`) à votre proxy.
5. Envoyez à Hermes le message de `infra/hermes/MESSAGE_POUR_HERMES.md` : il crée le profil `gyna`, les agents, les serveurs MCP, et lance `hermes serve`.
6. Contrôle : `curl https://gyna-bridge.alpact.fr/health` doit répondre `"hermes":"connecté"`.

### 4. App (Vercel)

1. Importez le dépôt, Root Directory = `apps/web` (le `vercel.json` gère le monorepo).
2. Variables d'environnement : voir `apps/web/.env.example`.
3. Déployez, puis connectez-vous avec l'email et le mot de passe créés dans Supabase.

### 5. Telegram (facultatif)

1. Créez un bot avec @BotFather, renseignez `TELEGRAM_BOT_TOKEN` et `TELEGRAM_BOT_USERNAME`.
2. Déclarez le webhook :
   `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<app>/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>"`
3. Supabase > Database > Webhooks : sur INSERT dans `approvals`, POST vers `https://<app>/api/hooks/approval-created` avec l'en-tête `Authorization: Bearer <APP_HOOKS_SECRET>`.
4. Dans l'app, Paramètres > Lier mon compte Telegram.

## Premier test

1. Dans l'app, complétez le brief de L'Amorce (Ventures).
2. Dans le chat : « Trouve 10 profils pour le prochain bootcamp de L'Amorce, en Savoie. Qualifie-les et prépare un brouillon pour les chauds. »
3. Suivez l'activité des agents dans le chat, les prospects arrivent en direct, les brouillons attendent dans « À valider ».

## Développement

```
pnpm install
pnpm build
pnpm test          # schémas, pont (faux Hermes), MCP (Postgres en mémoire)
pnpm --filter @gyna/web dev
```

## Points à confirmer en conditions réelles

- Authentification du pont auprès de `hermes serve` (jeton local).
- Noms exacts des champs des événements `tool.start` / `tool.complete` : le pont accepte plusieurs variantes (`name`, `tool`, `tool_name`).
- Transmission du `mission_token` par les sous-agents : prévue dans les prompts, à vérifier sur une première mission.
- Format renvoyé par `model.options` : l'app accepte plusieurs formes et retombe sur `DEFAULT_MODEL` sinon.
