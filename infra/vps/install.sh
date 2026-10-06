#!/usr/bin/env bash
# Installe ou met à jour le pont et le serveur MCP Gyna sur le VPS.
# Usage : sudo bash infra/vps/install.sh <url du dépôt git> [branche]
set -euo pipefail

REPO="${1:?Usage : install.sh <url du dépôt> [branche]}"
BRANCH="${2:-main}"
APP_DIR=/opt/gyna

if [[ $EUID -ne 0 ]]; then echo "Lancez ce script avec sudo." >&2; exit 1; fi

# Node 22 et pnpm
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable
corepack prepare pnpm@10.28.0 --activate

# Utilisateur système et dossiers
id gyna >/dev/null 2>&1 || useradd --system --home /var/lib/gyna-bridge --shell /usr/sbin/nologin gyna
mkdir -p /var/lib/gyna-bridge /etc/gyna
chown gyna:gyna /var/lib/gyna-bridge
chmod 750 /etc/gyna

# Code
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" checkout --quiet "$BRANCH"
  git -C "$APP_DIR" reset --quiet --hard "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"
pnpm install --frozen-lockfile --filter @gyna/bridge... --filter @gyna/mcp...
pnpm turbo run build --filter=@gyna/bridge --filter=@gyna/mcp
chown -R root:gyna "$APP_DIR"

# Fichiers d'environnement (créés une seule fois, à compléter)
for svc in bridge mcp; do
  if [[ ! -f "/etc/gyna/$svc.env" ]]; then
    cp "apps/$svc/.env.example" "/etc/gyna/$svc.env"
    echo "À compléter : /etc/gyna/$svc.env"
  fi
  chown root:gyna "/etc/gyna/$svc.env"
  chmod 640 "/etc/gyna/$svc.env"
done

# Services
install -m 644 infra/vps/gyna-bridge.service /etc/systemd/system/gyna-bridge.service
install -m 644 infra/vps/gyna-mcp.service /etc/systemd/system/gyna-mcp.service
systemctl daemon-reload
systemctl enable gyna-bridge gyna-mcp >/dev/null
systemctl restart gyna-bridge gyna-mcp

sleep 2
echo "Pont : $(curl -fsS http://127.0.0.1:8790/health || echo 'pas de réponse')"
echo "MCP  : $(curl -fsS http://127.0.0.1:8791/health || echo 'pas de réponse')"
echo "Journaux : journalctl -u gyna-bridge -u gyna-mcp -f"
