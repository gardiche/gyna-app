#!/usr/bin/env bash
# Diagnostic en lecture seule de toute la chaîne Gyna sur le VPS : services, version de Hermes, connexion du profil,
# délégation, plugin de mission, serveurs MCP, erreurs récentes. Ne modifie rien, n'affiche aucun jeton ni aucune clé.
# À lancer après une mise à jour de Hermes :   bash /opt/gyna/infra/hermes/doctor.sh
set -uo pipefail

HERMES=/usr/local/bin/hermes
SRC=/usr/local/lib/hermes-agent
HERMES_HOME=${HERMES_HOME:-/root/.hermes}
PROFILE=gyna
PROFILE_DIR="$HERMES_HOME/profiles/$PROFILE"
APP_DIR=/opt/gyna

ok()   { printf '  \033[32mOK\033[0m   %s\n' "$*"; }
warn() { printf '  \033[33m??\033[0m   %s\n' "$*"; }
bad()  { printf '  \033[31mNON\033[0m  %s\n' "$*"; }
title() { printf '\n== %s\n' "$*"; }

title "Services"
for s in gyna-mcp gyna-bridge gyna-hermes-serve caddy; do
  if systemctl is-active --quiet "$s"; then ok "$s actif (depuis $(systemctl show -p ActiveEnterTimestamp --value "$s"))"; else bad "$s inactif"; fi
done
exec_line=$(systemctl cat gyna-hermes-serve 2>/dev/null | grep -m1 '^ExecStart=' || true)
if grep -q -- '--isolated' <<<"$exec_line"; then ok "hermes serve lancé avec --isolated"; else bad "hermes serve sans --isolated : la génération d'images lirait le profil par défaut ($exec_line)"; fi
if grep -q -- "-p $PROFILE\|--profile $PROFILE" <<<"$exec_line"; then ok "hermes serve sur le profil $PROFILE"; else warn "profil $PROFILE non repéré dans ExecStart : $exec_line"; fi

title "Code déployé"
if git -C "$APP_DIR" rev-parse HEAD >/dev/null 2>&1; then
  head=$(git -C "$APP_DIR" log -1 --format='%h %s' | cut -c1-90)
  git -C "$APP_DIR" fetch -q origin main 2>/dev/null || warn "fetch impossible (réseau ?)"
  behind=$(git -C "$APP_DIR" rev-list --count HEAD..origin/main 2>/dev/null || echo "?")
  if [[ $behind == 0 ]]; then ok "à jour : $head"; else warn "en retard de $behind commit(s) sur origin/main : $head (lancer la mise à jour du VPS)"; fi
  [[ -d $APP_DIR/apps/bridge/dist && $APP_DIR/apps/bridge/dist/server.js -nt $APP_DIR/apps/bridge/src/server.ts ]] && ok "pont compilé après la dernière modification des sources" || warn "pont peut-être pas recompilé depuis le dernier pull"
else bad "$APP_DIR n'est pas un dépôt git"; fi
if cmp -s "$APP_DIR/infra/hermes/agents/gyna.md" "$PROFILE_DIR/SOUL.md"; then ok "SOUL.md identique à infra/hermes/agents/gyna.md"; else warn "SOUL.md diffère de gyna.md (cp infra/hermes/agents/gyna.md vers le profil, puis redémarrer)"; fi

title "Hermes"
"$HERMES" --version 2>&1 | head -1 | sed 's/^/       version : /'
if ss -ltn 2>/dev/null | grep -q '127.0.0.1:9119'; then ok "hermes serve écoute sur 127.0.0.1:9119"; else bad "rien n'écoute sur 127.0.0.1:9119"; fi
if grep -rqs --include='*.py' 'pre_tool_call' "$SRC" && grep -rqs --include='*.py' '"modify"' "$SRC"; then ok "hooks du plugin (pre_tool_call + modify) présents dans Hermes"; else bad "pre_tool_call/modify introuvables dans le code de Hermes : le plugin gyna-mission ne réécrira plus le jeton"; fi

title "Connexion du profil $PROFILE (identifiants, sans les jetons)"
"$HERMES" -p "$PROFILE" auth list 2>&1 | sed 's/^/       /'
grep -q 'openai-codex' <("$HERMES" -p "$PROFILE" auth list 2>&1) && ok "openai-codex présent (sa validité se voit au premier appel : voir les erreurs plus bas)" || bad "openai-codex absent : hermes -p $PROFILE auth add openai-codex --type oauth"

title "Délégation et outils du profil"
grep -n -A4 '^delegation:' "$PROFILE_DIR/config.yaml" 2>/dev/null | sed 's/^/       /' || warn "section delegation introuvable"
echo "       serveurs MCP déclarés :" $(awk '/^mcp_servers:/{f=1;next} f&&/^[^ ]/{f=0} f&&/^  [A-Za-z0-9_-]+:/{gsub(":","",$1);printf "%s ",$1}' "$PROFILE_DIR/config.yaml" 2>/dev/null)
for want in gyna; do
  awk '/^mcp_servers:/{f=1;next} f&&/^[^ ]/{f=0} f' "$PROFILE_DIR/config.yaml" 2>/dev/null | grep -q "^  $want:" && ok "serveur MCP « $want » déclaré" || bad "serveur MCP « $want » absent de la config du profil"
done

title "Plugin gyna-mission"
listed=$("$HERMES" -p "$PROFILE" plugins list --plain --no-bundled 2>&1 || true)
if grep -q 'gyna-mission' <<<"$listed"; then ok "plugin vu par Hermes : $(grep 'gyna-mission' <<<"$listed" | head -1)"; else bad "plugin absent : bash $APP_DIR/infra/hermes/mission-plugin.sh install"; fi
[[ -f $PROFILE_DIR/plugins/gyna-mission/probe ]] && warn "sonde du plugin encore allumée (mission-plugin.sh stop pour l'éteindre)" || true

title "Pont et serveur MCP"
h=$(curl -s -m 8 http://127.0.0.1:8790/health || true)
if grep -q '"ok":true' <<<"$h"; then ok "pont : $h"; else bad "pont : ${h:-pas de réponse}"; fi
m=$(curl -s -m 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:8791/health || true)
[[ $m == 200 ]] && ok "serveur MCP : /health répond 200" || bad "serveur MCP : /health répond ${m:-rien}"
t=$(curl -s -m 8 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8791/mcp -H 'content-type: application/json' -d '{}' || true)
[[ $t == 401 || $t == 403 ]] && ok "serveur MCP : refuse bien un appel sans jeton ($t)" || warn "serveur MCP : appel sans jeton -> $t (attendu 401)"

title "Variables des services (présence seulement)"
for pair in "bridge:BRIDGE_SECRET" "bridge:HERMES_WS_URL" "bridge:APP_CALLBACK_URL" "mcp:MCP_ACCESS_TOKEN" "mcp:MISSION_JWT_SECRET" "mcp:APIFY_TOKEN" "mcp:DATABASE_URL"; do
  f=/etc/gyna/${pair%%:*}.env; k=${pair##*:}
  if [[ -r $f ]] && grep -q "^$k=." "$f"; then ok "$k posée dans $f"; else warn "$k absente ou vide dans $f"; fi
done

title "Erreurs des 60 dernières minutes (comptes)"
logs=$(journalctl -u gyna-bridge -u gyna-hermes-serve -u gyna-mcp --since "60 minutes ago" --no-pager 2>/dev/null)
count() { grep -ci -- "$1" <<<"$logs" || true; }
for pat in "401" "Missing Authentication" "rejected" "session not found" "hermes_reconnect" "callback_failed" "ECONNREFUSED"; do
  n=$(count "$pat"); [[ $n -eq 0 ]] && ok "« $pat » : 0" || warn "« $pat » : $n"
done
echo
echo "Dernières lignes d'erreur (jetons masqués) :"
grep -i "error\|401\|rejected\|not found\|failed" <<<"$logs" | tail -8 | sed -E 's/(gm-[A-Za-z0-9-]+|Bearer [A-Za-z0-9._-]+)/[masqué]/g' | cut -c1-240 | sed 's/^/       /'

echo
echo "Fin du diagnostic. Rien n'a été modifié."
