#!/usr/bin/env bash
# Installe ou met à jour Gyna sur le VPS : pont, serveur MCP et proxy HTTPS (Caddy).
#
# Usage : sudo bash install.sh <nom d'hôte du pont> [url du dépôt] [branche]
#   exemple : sudo bash install.sh gyna.46-225-178-58.sslip.io
set -euo pipefail

HOST="${1:?Usage : install.sh HOTE_DU_PONT [URL_DU_DEPOT] [BRANCHE]}"
REPO="${2:-https://github.com/gardiche/gyna-app}"
BRANCH="${3:-main}"
APP_DIR=/opt/gyna

if [[ $EUID -ne 0 ]]; then echo "Lancez ce script avec sudo." >&2; exit 1; fi
step() { echo; echo "==> $*"; }

step "Paquets de base"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates gnupg openssl debian-keyring debian-archive-keyring apt-transport-https >/dev/null

step "Node 22 et pnpm"
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
corepack enable
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare pnpm@10.28.0 --activate >/dev/null
echo "node $(node -v), pnpm $(pnpm -v)"

# Proxy HTTPS : Nginx s'il occupe déjà le port 80, sinon Caddy.
if ss -ltnp 2>/dev/null | grep -E ':80 ' | grep -q nginx; then PROXY=nginx; else PROXY=caddy; fi
step "Proxy retenu : $PROXY"
if [[ $PROXY == caddy ]] && ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi
if [[ $PROXY == nginx ]] && ! command -v certbot >/dev/null; then
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
fi

step "Utilisateur système et dossiers"
id gyna >/dev/null 2>&1 || useradd --system --home /var/lib/gyna-bridge --shell /usr/sbin/nologin gyna
mkdir -p /var/lib/gyna-bridge /etc/gyna
chown gyna:gyna /var/lib/gyna-bridge
chmod 750 /etc/gyna

step "Code ($REPO, $BRANCH)"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" checkout --quiet "$BRANCH"
  git -C "$APP_DIR" reset --quiet --hard "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

step "Dépendances et compilation"
CI=true pnpm install --frozen-lockfile --reporter=silent
pnpm --filter @gyna/schemas build >/dev/null
pnpm --filter @gyna/bridge build >/dev/null
pnpm --filter @gyna/mcp build >/dev/null
chown -R root:gyna "$APP_DIR"

step "Fichiers d'environnement"
new_secret() { openssl rand -hex 32; }
if [[ ! -f /etc/gyna/bridge.env ]]; then
  sed -e "s|^BRIDGE_SECRET=.*|BRIDGE_SECRET=$(new_secret)|" apps/bridge/.env.example > /etc/gyna/bridge.env
  echo "Créé : /etc/gyna/bridge.env (BRIDGE_SECRET généré)"
fi
if [[ ! -f /etc/gyna/mcp.env ]]; then
  sed -e "s|^MISSION_JWT_SECRET=.*|MISSION_JWT_SECRET=$(new_secret)|" \
      -e "s|^MCP_ACCESS_TOKEN=.*|MCP_ACCESS_TOKEN=$(new_secret)|" apps/mcp/.env.example > /etc/gyna/mcp.env
  echo "Créé : /etc/gyna/mcp.env (MISSION_JWT_SECRET et MCP_ACCESS_TOKEN générés)"
fi
for f in bridge mcp; do chown root:gyna "/etc/gyna/$f.env"; chmod 640 "/etc/gyna/$f.env"; done

step "Services"
install -m 644 infra/vps/gyna-bridge.service /etc/systemd/system/gyna-bridge.service
install -m 644 infra/vps/gyna-mcp.service /etc/systemd/system/gyna-mcp.service
systemctl daemon-reload
systemctl enable gyna-bridge gyna-mcp >/dev/null 2>&1
systemctl restart gyna-bridge gyna-mcp

step "Proxy HTTPS pour $HOST"
if [[ $PROXY == caddy ]]; then
  sed "s|^GYNA_BRIDGE_HOST {|$HOST {|" infra/vps/Caddyfile > /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
  systemctl enable caddy >/dev/null 2>&1
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
else
  systemctl disable --now caddy >/dev/null 2>&1 || true
  CONF=/etc/nginx/conf.d/gyna-bridge.conf
  # Le bloc n'est écrit qu'une fois : certbot le complète ensuite avec le HTTPS.
  if [[ ! -f $CONF ]]; then
    sed "s|GYNA_BRIDGE_HOST|$HOST|" infra/vps/nginx-gyna-bridge.conf > "$CONF"
    if ! nginx -t >/dev/null 2>&1; then
      rm -f "$CONF"; echo "Configuration Nginx invalide, rien n'a été rechargé : nginx -t" >&2; exit 1
    fi
    nginx -s reload
  fi
  if [[ ! -d /etc/letsencrypt/live/$HOST ]]; then
    if [[ -n "${CERTBOT_EMAIL:-}" ]]; then EMAIL_ARGS=(-m "$CERTBOT_EMAIL"); else EMAIL_ARGS=(--register-unsafely-without-email); fi
    certbot --nginx -d "$HOST" --non-interactive --agree-tos "${EMAIL_ARGS[@]}" --redirect
  fi
fi
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && echo "Pare-feu : ports 80 et 443 ouverts"
fi

step "Vérification"
sleep 3
echo "Pont (local) : $(curl -fsS http://127.0.0.1:8790/health || echo 'pas de réponse')"
echo "MCP  (local) : $(curl -fsS http://127.0.0.1:8791/health || echo 'pas de réponse')"
echo "Pont (public): $(curl -fsS --max-time 20 "https://$HOST/health" || echo 'pas encore de réponse, le certificat peut prendre une minute')"

cat <<EOF

Installation terminée.
À compléter :
  - /etc/gyna/mcp.env    : DATABASE_URL (rôle gyna_mcp, pooler Supabase)
  - /etc/gyna/bridge.env : HERMES_TOKEN et APP_CALLBACK_URL
Puis : systemctl restart gyna-bridge gyna-mcp
Journaux : journalctl -u gyna-bridge -u gyna-mcp -f
EOF
