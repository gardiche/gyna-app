#!/usr/bin/env bash
# Limite les outils du serveur MCP « meta-ads » à ceux que le pilotage utilise vraiment.
#
# Pourquoi : Hermes charge dans le contexte de chaque appel la description de TOUS les outils de chaque serveur MCP.
# Le serveur de Meta en expose plus de quatre-vingts (catalogues, audiences, tests A/B, pixel…), dont la description
# est longue : ce contexte est relu à chaque appel de Gyna et de ses sous-agents, y compris pour une mission de prospection.
# Hermes sait n'enregistrer que les outils d'une liste (`tools.include` de la configuration du serveur).
#
#   bash /opt/gyna/infra/hermes/mcp-tools.sh limit    # applique la liste (sauvegarde la configuration, redémarre hermes serve)
#   bash /opt/gyna/infra/hermes/mcp-tools.sh status   # montre ce qui est configuré
#   bash /opt/gyna/infra/hermes/mcp-tools.sh all      # retire la limite (tous les outils de Meta)
#
# Pour ajouter des outils à la liste sans modifier ce fichier : GYNA_META_EXTRA="ads_library_search ads_get_ad_videos".
# GYNA_NO_RESTART=1 : écrit la configuration sans redémarrer (à faire quand aucune mission ne tourne).
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Lancez ce script en root." >&2; exit 1; fi

HERMES_PY=/usr/local/lib/hermes-agent/venv/bin/python
SRC=/usr/local/lib/hermes-agent
HERMES_HOME=${HERMES_HOME:-/root/.hermes}
CONFIG="$HERMES_HOME/profiles/gyna/config.yaml"
MODE=${1:-status}

[[ -f $CONFIG ]] || { echo "Configuration introuvable : $CONFIG. Lancez d'abord setup-hermes.sh." >&2; exit 1; }

# Lecture et écriture de la configuration dans un seul bloc Python.
MODE="$MODE" CONFIG="$CONFIG" EXTRA="${GYNA_META_EXTRA:-}" "$HERMES_PY" - <<'PY'
import os, shutil, sys, yaml

# Ce que lisent les skills « piloter-en-autonomie », « piloter-meta » et « bilan-et-recommandations » :
# comptes et Pages, entités et mesures, jeux de données, aperçus, création et activation, erreurs.
META_TOOLS = [
    "ads_get_ad_accounts", "ads_get_ad_account_pages", "ads_get_user_pages", "ads_get_pages_for_business", "ads_get_ig_accounts",
    "ads_get_ad_entities", "ads_get_field_context", "ads_get_errors", "ads_get_ad_preview", "ads_get_creatives",
    "ads_get_creative_ads", "ads_get_ad_images", "ads_get_async_result", "ads_account_get_activity_logs",
    "ads_get_datasets", "ads_get_dataset_stats", "ads_get_dataset_quality", "ads_get_dataset_details",
    "ads_insights_performance_trend", "ads_insights_anomaly_signal", "ads_insights_advertiser_context",
    "ads_creative_upload_media", "ads_create_campaign", "ads_create_ad_set", "ads_create_creative", "ads_create_ad",
    "ads_activate_entity", "ads_update_entity",
]
mode, path = os.environ["MODE"], os.environ["CONFIG"]
extra = os.environ.get("EXTRA", "").split()
with open(path) as f:
    cfg = yaml.safe_load(f) or {}
server = (cfg.get("mcp_servers") or {}).get("meta-ads")
if server is None:
    print("Le serveur « meta-ads » n'est pas configuré dans ce profil : rien à limiter.")
    sys.exit(0)

current = (server.get("tools") or {}).get("include")
if mode == "status":
    print("meta-ads :", f"{len(current)} outils autorisés" if current else "tous les outils du serveur (aucune limite)")
    sys.exit(0)

if mode == "limit":
    wanted = sorted(set(META_TOOLS + extra))
    server["tools"] = {**(server.get("tools") or {}), "include": wanted}
elif mode == "all":
    tools = dict(server.get("tools") or {})
    tools.pop("include", None)
    if tools: server["tools"] = tools
    else: server.pop("tools", None)
else:
    print("Usage : mcp-tools.sh limit | status | all", file=sys.stderr)
    sys.exit(2)

shutil.copy(path, path + ".bak-mcp-tools")
with open(path, "w") as f:
    yaml.safe_dump(cfg, f, sort_keys=False, allow_unicode=True)
os.chmod(path, 0o600)
print("meta-ads :", f"{len(server['tools']['include'])} outils autorisés" if "tools" in server and "include" in server["tools"] else "tous les outils du serveur")
print("Sauvegarde :", path + ".bak-mcp-tools")
PY

if [[ $MODE != status && ${GYNA_NO_RESTART:-0} != 1 ]]; then
  # Garde-fou : le filtre `include` doit exister dans cette version de Hermes.
  if ! grep -rqs --include='*.py' '"include"' "$SRC"; then
    echo "Attention : « include » introuvable dans le code de Hermes ($SRC) : le filtre ne sera peut-être pas appliqué." >&2
  fi
  echo "Redémarrage de hermes serve (la mission en cours, s'il y en a une, sera coupée)…"
  systemctl restart gyna-hermes-serve
  echo "Fait. Pour vérifier l'effet : lancez une mission et comparez ses tokens (page « Voir le travail »)."
fi
