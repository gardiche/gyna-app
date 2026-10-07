#!/usr/bin/env bash
# Configure Hermes pour Gyna, sur le VPS où tourne Hermes (après infra/vps/install.sh).
#   - profil « gyna » (cloné du profil actif pour garder les accès aux modèles, sans les canaux de messagerie)
#   - prompt de Gyna (SOUL.md du profil)
#   - serveurs MCP « gyna » (local) et « apify » (distant, token demandé sans affichage)
#   - service permanent « hermes serve » sur 127.0.0.1:9119, jeton partagé avec le pont
#
# Usage : bash /opt/gyna/infra/hermes/setup-hermes.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Lancez ce script en root." >&2; exit 1; fi
step() { echo; echo "==> $*"; }

HERMES=/usr/local/bin/hermes
HERMES_PY=/usr/local/lib/hermes-agent/venv/bin/python
HERMES_HOME=${HERMES_HOME:-/root/.hermes}
PROFILE=gyna
PROFILE_DIR="$HERMES_HOME/profiles/$PROFILE"
APP_DIR=/opt/gyna

[[ -x $HERMES ]] || { echo "Hermes introuvable ($HERMES)." >&2; exit 1; }
[[ -f /etc/gyna/bridge.env && -f /etc/gyna/mcp.env ]] || { echo "Lancez d'abord infra/vps/install.sh." >&2; exit 1; }

step "Profil Hermes « $PROFILE »"
if [[ -d $PROFILE_DIR ]]; then
  echo "Déjà présent : $PROFILE_DIR"
else
  "$HERMES" profile create "$PROFILE" --clone --no-alias \
    --description "Gyna, orchestratrice de l'acquisition d'Alpact : prospection LinkedIn, qualification, brouillons à valider."
  [[ -d $PROFILE_DIR ]] || { echo "Profil créé, mais dossier introuvable : $PROFILE_DIR. Vérifiez « hermes profile show $PROFILE »." >&2; exit 1; }
fi
cp "$APP_DIR/infra/hermes/agents/gyna.md" "$PROFILE_DIR/SOUL.md"
echo "Prompt de Gyna installé dans $PROFILE_DIR/SOUL.md"

step "Serveurs MCP du profil"
# Garde-fou : on vérifie dans le code de Hermes le format de configuration attendu avant d'y écrire.
SRC=/usr/local/lib/hermes-agent
if ! grep -rqs --include='*.py' '"mcp_servers"' "$SRC" || ! grep -rqs --include='*.py' '"headers"' "$SRC"; then
  echo "Format mcp_servers/headers non reconnu dans le code de Hermes : configuration MCP non modifiée." >&2
  echo "Ajoutez les serveurs avec « hermes -p $PROFILE mcp add » et signalez-le." >&2
  exit 1
fi
MCP_TOKEN=$(grep -E '^MCP_ACCESS_TOKEN=' /etc/gyna/mcp.env | cut -d= -f2-)
[[ -n $MCP_TOKEN ]] || { echo "MCP_ACCESS_TOKEN vide dans /etc/gyna/mcp.env." >&2; exit 1; }

APIFY_TOKEN=""
if ! grep -q "mcp.apify.com" "$PROFILE_DIR/config.yaml" 2>/dev/null; then
  read -rsp "Token Apify (Settings > API & Integrations, ne s'affiche pas ; Entrée pour passer) : " APIFY_TOKEN; echo
fi

cp "$PROFILE_DIR/config.yaml" "$PROFILE_DIR/config.yaml.bak-gyna" 2>/dev/null || true
MCP_TOKEN="$MCP_TOKEN" APIFY_TOKEN="$APIFY_TOKEN" CONFIG="$PROFILE_DIR/config.yaml" "$HERMES_PY" - <<'PY'
import os, yaml
path = os.environ["CONFIG"]
cfg = {}
if os.path.exists(path):
    with open(path) as f:
        cfg = yaml.safe_load(f) or {}
servers = cfg.setdefault("mcp_servers", {}) or {}
cfg["mcp_servers"] = servers
servers["gyna"] = {
    "url": "http://127.0.0.1:8791/mcp",
    "headers": {"Authorization": f"Bearer {os.environ['MCP_TOKEN']}"},
}
if os.environ.get("APIFY_TOKEN"):
    servers["apify"] = {
        "url": "https://mcp.apify.com",
        "headers": {"Authorization": f"Bearer {os.environ['APIFY_TOKEN']}"},
    }
with open(path, "w") as f:
    yaml.safe_dump(cfg, f, sort_keys=False, allow_unicode=True)
print("Serveurs MCP :", ", ".join(servers.keys()))
PY
chmod 600 "$PROFILE_DIR/config.yaml"

step "Jeton partagé entre hermes serve et le pont"
TOKEN=$(grep -E '^HERMES_TOKEN=' /etc/gyna/bridge.env | cut -d= -f2-)
if [[ -z $TOKEN ]]; then
  TOKEN=$(openssl rand -hex 32)
  sed -i "s|^HERMES_TOKEN=.*|HERMES_TOKEN=$TOKEN|" /etc/gyna/bridge.env
fi
umask 077
printf 'HERMES_DASHBOARD_SESSION_TOKEN=%s\nHOME=/root\n' "$TOKEN" > /etc/gyna/hermes-serve.env
chmod 600 /etc/gyna/hermes-serve.env

step "Service hermes serve (127.0.0.1:9119)"
cat > /etc/systemd/system/gyna-hermes-serve.service <<EOF
[Unit]
Description=Hermes serve pour Gyna (127.0.0.1:9119)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
EnvironmentFile=/etc/gyna/hermes-serve.env
ExecStart=$HERMES serve --host 127.0.0.1 --port 9119 --skip-build
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable gyna-hermes-serve >/dev/null 2>&1
systemctl restart gyna-hermes-serve
systemctl restart gyna-bridge

step "Vérification"
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8790/health 2>/dev/null | grep -q '"ok":true'; then break; fi
  sleep 2
done
echo "hermes serve : $(systemctl is-active gyna-hermes-serve)"
echo "Pont        : $(curl -fsS http://127.0.0.1:8790/health || echo 'pas de réponse')"
echo "MCP (outils): $("$HERMES" -p "$PROFILE" mcp list 2>&1 | tail -n +1 | head -20 || true)"
cat <<'EOF'

Si le pont reste « déconnecté » :
  journalctl -u gyna-hermes-serve -n 40 --no-pager
  journalctl -u gyna-bridge -n 40 --no-pager
EOF
