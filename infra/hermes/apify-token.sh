#!/usr/bin/env bash
# Remplace le jeton Apify partout où Gyna s'en sert, sans jamais l'afficher ni le passer en argument :
#   - /etc/gyna/mcp.env : APIFY_TOKEN (outils search_linkedin_profiles, fetch_profiles, fetch_posts, search_places)
#   - le profil Hermes « gyna » : serveur MCP « apify » (recherches et lectures directes des agents)
# Le jeton est testé auprès d'Apify avant d'être écrit : un jeton refusé n'est écrit nulle part.
#
# À lancer quand une mission rend « Apify HTTP 401 user-or-token-not-found » (jeton régénéré, révoqué ou compte changé) :
#   bash /opt/gyna/infra/hermes/apify-token.sh
# Jeton : console Apify > Settings > API & Integrations > Personal API tokens.
#
# GYNA_NO_RESTART=1 : écrit sans redémarrer (à faire quand aucune mission ne tourne).
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Lancez ce script en root." >&2; exit 1; fi

HERMES_PY=/usr/local/lib/hermes-agent/venv/bin/python
HERMES_HOME=${HERMES_HOME:-/root/.hermes}
CONFIG="$HERMES_HOME/profiles/gyna/config.yaml"
MCP_ENV=/etc/gyna/mcp.env

[[ -f $MCP_ENV ]] || { echo "Introuvable : $MCP_ENV." >&2; exit 1; }

read -rsp "Nouveau jeton Apify (ne s'affiche pas) : " APIFY_TOKEN; echo
[[ -n $APIFY_TOKEN ]] || { echo "Jeton vide : rien n'est modifié." >&2; exit 1; }

# Test auprès d'Apify : le jeton passe par l'entrée standard de curl, jamais en argument (invisible dans la liste des processus).
CODE=$(printf 'header = "Authorization: Bearer %s"\n' "$APIFY_TOKEN" | curl -s -o /dev/null -w '%{http_code}' -K - https://api.apify.com/v2/users/me || true)
if [[ $CODE != 200 ]]; then
  echo "Apify a répondu $CODE : ce jeton n'est pas accepté. Rien n'est modifié." >&2
  exit 1
fi
echo "Apify accepte ce jeton."

cp "$MCP_ENV" "$MCP_ENV.bak-apify"
# Retire l'ancienne ligne (s'il y en a) puis ajoute la nouvelle : pas de remplacement par sed, le jeton ne passe pas par une expression.
grep -v '^APIFY_TOKEN=' "$MCP_ENV.bak-apify" > "$MCP_ENV" || true
printf 'APIFY_TOKEN=%s\n' "$APIFY_TOKEN" >> "$MCP_ENV"
chmod --reference="$MCP_ENV.bak-apify" "$MCP_ENV" 2>/dev/null || true
echo "Écrit dans $MCP_ENV (sauvegarde : $MCP_ENV.bak-apify)."

if [[ -f $CONFIG ]]; then
  cp "$CONFIG" "$CONFIG.bak-apify"
  CONFIG="$CONFIG" APIFY_TOKEN="$APIFY_TOKEN" "$HERMES_PY" - <<'PY'
import os, yaml
path = os.environ["CONFIG"]
with open(path) as f:
    cfg = yaml.safe_load(f) or {}
servers = cfg.setdefault("mcp_servers", {}) or {}
cfg["mcp_servers"] = servers
server = servers.get("apify")
if server is None:
    server = servers["apify"] = {"url": "https://mcp.apify.com", "headers": {}}
server.setdefault("headers", {})["Authorization"] = f"Bearer {os.environ['APIFY_TOKEN']}"
with open(path, "w") as f:
    yaml.safe_dump(cfg, f, sort_keys=False, allow_unicode=True)
os.chmod(path, 0o600)
print("Serveur MCP « apify » du profil mis à jour.")
PY
else
  echo "Profil Hermes introuvable ($CONFIG) : seul $MCP_ENV a été mis à jour." >&2
fi
unset APIFY_TOKEN

if [[ ${GYNA_NO_RESTART:-0} != 1 ]]; then
  echo "Redémarrage de gyna-mcp et de hermes serve (une mission en cours serait coupée)…"
  systemctl restart gyna-mcp gyna-hermes-serve
  echo "Fait."
fi
