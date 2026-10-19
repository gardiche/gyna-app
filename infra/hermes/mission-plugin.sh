#!/usr/bin/env bash
# Plugin Hermes « gyna-mission » (infra/hermes/plugins/gyna-mission) : il glisse le jeton de mission dans chaque
# appel d'outil du serveur MCP gyna, pour que les agents n'aient plus à le recopier.
#
#   bash /opt/gyna/infra/hermes/mission-plugin.sh install   # copie dans le profil, active, redémarre hermes serve
#   bash /opt/gyna/infra/hermes/mission-plugin.sh probe     # install + sonde allumée : lancez ensuite une mission avec délégation
#   bash /opt/gyna/infra/hermes/mission-plugin.sh report    # ce que la sonde a vu (jamais le jeton lui-même)
#   bash /opt/gyna/infra/hermes/mission-plugin.sh stop      # éteint la sonde et efface son relevé
#   bash /opt/gyna/infra/hermes/mission-plugin.sh remove    # désactive et retire le plugin
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Lancez ce script en root." >&2; exit 1; fi

HERMES=/usr/local/bin/hermes
HERMES_PY=/usr/local/lib/hermes-agent/venv/bin/python
SRC=/usr/local/lib/hermes-agent
HERMES_HOME=${HERMES_HOME:-/root/.hermes}
PROFILE=gyna
PROFILE_DIR="$HERMES_HOME/profiles/$PROFILE"
APP_DIR=/opt/gyna
NAME=gyna-mission
DEST="$PROFILE_DIR/plugins/$NAME"

install() {
  [[ -d $PROFILE_DIR ]] || { echo "Profil introuvable : $PROFILE_DIR. Lancez d'abord setup-hermes.sh." >&2; exit 1; }
  # Garde-fou : la réécriture des arguments par pre_tool_call doit exister dans cette version de Hermes.
  if ! grep -rqs --include='*.py' 'pre_tool_call' "$SRC" || ! grep -rqs --include='*.py' '"modify"' "$SRC"; then
    echo "Attention : « pre_tool_call » avec « modify » introuvable dans le code de Hermes ($SRC)." >&2
    echo "Le plugin s'installe quand même, mais il ne changera sans doute rien : la sonde le dira." >&2
  fi
  mkdir -p "$DEST"
  cp "$APP_DIR/infra/hermes/plugins/$NAME/plugin.yaml" "$APP_DIR/infra/hermes/plugins/$NAME/__init__.py" "$DEST/"
  "$HERMES" -p "$PROFILE" plugins enable "$NAME" >/dev/null
  # Sortie lue d'abord : avec pipefail, « grep -q » qui s'arrête tôt fait échouer hermes (SIGPIPE) et le test.
  local listed
  listed=$("$HERMES" -p "$PROFILE" plugins list --plain --no-bundled 2>&1 || true)
  if ! grep -q "$NAME" <<<"$listed"; then
    echo "Hermes ne voit pas le plugin dans $DEST : vérifiez « hermes -p $PROFILE plugins list »." >&2
    exit 1
  fi
  systemctl restart gyna-hermes-serve
  echo "Plugin $NAME installé et activé ($DEST), hermes serve redémarré."
  grep "$NAME" <<<"$listed" || true
}

case ${1:-} in
  install)
    install
    ;;
  probe)
    install
    rm -f "$DEST/probe.jsonl"
    touch "$DEST/probe"
    cat <<'EOF'

Sonde allumée. Dans l'app, ouvrez une nouvelle conversation sur L'Amorce et envoyez par exemple :
  « Demande à Ads de lire les retours sur les posts et résume-les en trois lignes, sans rien soumettre. »
Attendez la fin de la mission (le sous-agent doit avoir répondu), puis :
  bash /opt/gyna/infra/hermes/mission-plugin.sh report
EOF
    ;;
  report)
    [[ -f $DEST/probe.jsonl ]] || { echo "Aucun relevé : lancez « probe », puis une mission depuis l'app." >&2; exit 1; }
    LOG="$DEST/probe.jsonl" "$HERMES_PY" - <<'PY'
import json, os
rows = [json.loads(l) for l in open(os.environ["LOG"], encoding="utf-8") if l.strip()]
by = lambda e: [r for r in rows if r["event"] == e]
llm, sub, pre, post = by("pre_llm_call"), by("subagent_start"), by("pre_tool_call"), by("post_tool_call")
print(f"Événements : {len(rows)} (tours {len(llm)}, sous-agents {len(sub)}, appels gyna {len(pre)})")
print()
block = [r for r in llm if r.get("source") == "block"]
print(("OK  " if block else "NON ") + f"jeton lu dans le bloc [Mission Gyna] : {len(block)} tour(s)")
inh = [r for r in sub if r.get("inherited")] + [r for r in llm if r.get("source") == "parent"]
print(("OK  " if inh else ("--  " if not sub else "NON ")) + f"jeton transmis aux sous-agents : {len(inh)} fois ({len(sub)} sous-agent(s) lancés)")
known = [r for r in pre if r.get("known")]
print(("OK  " if pre and len(known) == len(pre) else "NON ") + f"appels gyna dont la session a un jeton : {len(known)} sur {len(pre)}")
applied = [r for r in post if r.get("applied")]
print(("OK  " if post and len(applied) == len(post) else "NON ") + f"appels où l'outil a reçu le bon jeton (réécriture prise) : {len(applied)} sur {len(post)}")
wrong = [r for r in pre if r.get("agent_gave") and not r.get("agent_right")]
missing = [r for r in pre if not r.get("agent_gave")]
print(f"     dont jeton mal recopié par l'agent : {len(wrong)}, absent : {len(missing)}")
print()
print("Sessions vues :")
sessions = {}
for r in rows:
    s = r.get("session") or r.get("child")
    if s:
        sessions.setdefault(s, set()).add(r["event"])
for r in sub:
    print(f"  sous-agent {r.get('role') or ''} : parent {r.get('parent')} -> enfant {r.get('child')}")
for s, ev in sessions.items():
    calls = [r for r in pre if r.get("session") == s]
    print(f"  {s} : {', '.join(sorted(ev))} ; appels gyna {len(calls)}, avec jeton {sum(1 for r in calls if r.get('known'))}")
other = by("other_tool")
if other:
    print()
    print("Autres outils appelés (nom ; prend un mission_token ?) :")
    seen = {}
    for r in other:
        seen.setdefault(r.get("tool"), (r.get("has_token_arg"), r.get("arg_keys") or []))
    for name, (tok, keys) in seen.items():
        print(f"  {name} ; {'oui' if tok else 'non'}" + (f" ; arguments : {', '.join(keys)}" if keys else ""))
untracked = {r.get("session") for r in pre if not r.get("known")}
if untracked:
    print()
    print("Sessions d'appels sans jeton (à comparer aux enfants ci-dessus) :", ", ".join(sorted(map(str, untracked))))
PY
    ;;
  stop)
    rm -f "$DEST/probe" "$DEST/probe.jsonl"
    echo "Sonde éteinte, relevé effacé. Le plugin reste actif."
    ;;
  remove)
    "$HERMES" -p "$PROFILE" plugins disable "$NAME" >/dev/null || true
    rm -rf "$DEST"
    systemctl restart gyna-hermes-serve
    echo "Plugin $NAME retiré, hermes serve redémarré : les agents recopient de nouveau le jeton eux-mêmes."
    ;;
  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
