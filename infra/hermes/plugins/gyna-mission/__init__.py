"""Jeton de mission glissé par Hermes dans chaque appel d'outil du serveur MCP « gyna ».

Les agents recopiaient le jeton d'un appel à l'autre et se trompaient parfois d'un caractère : le serveur MCP
refusait l'appel, puis Hermes suspendait le serveur après plusieurs erreurs. Ce plugin retient le jeton de
chaque session à partir du bloc [Mission Gyna] que le pont place en tête de la mission, le transmet aux
sous-agents par le lien parent → enfant, et l'impose dans les arguments de chaque appel `mcp_gyna_*`.
Ce qu'un agent a recopié ne sert plus que si la session n'a pas de jeton connu (Hermes redémarré en cours de
mission, par exemple).

Aucun jeton n'est écrit dans les journaux. Sonde : un fichier `probe` à côté de ce fichier fait noter chaque
étape dans `probe.jsonl` (identifiants de session et oui/non, jamais le jeton), voir
infra/hermes/probe-mission-plugin.sh.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from pathlib import Path

log = logging.getLogger("gyna-mission")

TOOL_PREFIX = "mcp_gyna_"
# Le bloc écrit par le pont (apps/bridge/src/events.ts, composeMissionPrompt) ; la clé suit KEY_ALPHABET de l'app.
BLOCK_MARK = "[Mission Gyna]"
KEY_RE = re.compile(r"mission_token:\s*(gm-[a-z2-9]{5}(?:-[a-z2-9]{5}){3})\b", re.IGNORECASE)
# Un peu plus que la durée de vie d'un jeton (6 h, MISSION_KEY_TTL_MS).
TTL_S = 7 * 3600

HERE = Path(__file__).resolve().parent
PROBE_FLAG = HERE / "probe"
PROBE_LOG = HERE / "probe.jsonl"


class MissionTokens:
    """Jeton connu de chaque session Hermes, et réécriture des appels d'outils gyna."""

    def __init__(self, probe_flag: Path = PROBE_FLAG, probe_log: Path = PROBE_LOG, clock=time.monotonic):
        self._keys: dict[str, tuple[str, float]] = {}
        self._lock = threading.Lock()
        self._probe_flag = probe_flag
        self._probe_log = probe_log
        self._clock = clock

    # --- mémoire session → jeton ---

    def _get(self, session: str | None) -> str | None:
        if not session:
            return None
        with self._lock:
            hit = self._keys.get(session)
            if hit and self._clock() - hit[1] < TTL_S:
                return hit[0]
            self._keys.pop(session, None)
            return None

    def _set(self, session: str | None, key: str) -> None:
        if not session:
            return
        now = self._clock()
        with self._lock:
            self._keys[session] = (key, now)
            for s, (_, at) in list(self._keys.items()):
                if now - at >= TTL_S:
                    del self._keys[s]

    def _probe(self, event: str, **fields) -> None:
        if not self._probe_flag.exists():
            return
        try:
            with self._probe_log.open("a", encoding="utf-8") as f:
                f.write(json.dumps({"t": time.strftime("%Y-%m-%dT%H:%M:%S"), "event": event, **fields}, ensure_ascii=False) + "\n")
        except OSError:
            pass

    # --- hooks Hermes ---

    def on_pre_llm_call(self, **kw) -> None:
        session = kw.get("session_id") or kw.get("task_id")
        parent = kw.get("parent_session_id")
        message = kw.get("user_message") or ""
        source = None
        # Un sous-agent hérite du jeton de sa session parente, jamais de ce que Gyna a recopié dans son goal.
        inherited = self._get(parent)
        if inherited:
            self._set(session, inherited)
            source = "parent"
        elif isinstance(message, str) and BLOCK_MARK in message:
            m = KEY_RE.search(message)
            if m:
                self._set(session, m.group(1).lower())
                source = "block"
        self._probe("pre_llm_call", session=session, parent=parent, source=source, known=bool(self._get(session)))

    def on_subagent_start(self, **kw) -> None:
        parent, child = kw.get("parent_session_id"), kw.get("child_session_id")
        key = self._get(parent)
        if key:
            self._set(child, key)
        self._probe("subagent_start", parent=parent, child=child, inherited=bool(key), role=kw.get("child_role"))

    def on_pre_tool_call(self, **kw):
        name = kw.get("tool_name") or ""
        session = kw.get("session_id") or kw.get("task_id")
        if not name.startswith(TOOL_PREFIX):
            # La sonde note aussi les autres outils : c'est ainsi qu'on voit le vrai nom des outils gyna.
            self._probe("other_tool", tool=name, session=session, has_token_arg=isinstance(kw.get("args"), dict) and "mission_token" in kw["args"])
            return None
        key = self._get(session)
        args = kw.get("args") if isinstance(kw.get("args"), dict) else {}
        given = args.get("mission_token")
        self._probe(
            "pre_tool_call",
            tool=name,
            session=session,
            task=kw.get("task_id"),
            known=bool(key),
            agent_gave=given is not None,
            agent_right=bool(key) and isinstance(given, str) and given.strip().strip("\"'`").lower() == key,
        )
        if not key:
            return None
        if given != key:
            log.info("gyna-mission : jeton %s pour %s", "corrigé" if given else "ajouté", name)
        return {"action": "modify", "args": {"mission_token": key}}

    def on_post_tool_call(self, **kw) -> None:
        name = kw.get("tool_name") or ""
        if not name.startswith(TOOL_PREFIX) or not self._probe_flag.exists():
            return
        session = kw.get("session_id") or kw.get("task_id")
        key = self._get(session)
        args = kw.get("args") if isinstance(kw.get("args"), dict) else {}
        # Ce que l'outil a vraiment reçu : la preuve que la réécriture de pre_tool_call a pris.
        self._probe("post_tool_call", tool=name, session=session, applied=bool(key) and args.get("mission_token") == key, status=kw.get("status"))


def _safe(fn):
    """Un plugin ne doit jamais faire échouer un appel : toute erreur est notée et ignorée."""

    def wrapped(**kw):
        try:
            return fn(**kw)
        except Exception:  # noqa: BLE001
            log.exception("gyna-mission : erreur dans %s", fn.__name__)
            return None

    wrapped.__name__ = fn.__name__
    return wrapped


def register(ctx):
    tokens = MissionTokens()
    ctx.register_hook("pre_llm_call", _safe(tokens.on_pre_llm_call))
    ctx.register_hook("subagent_start", _safe(tokens.on_subagent_start))
    ctx.register_hook("pre_tool_call", _safe(tokens.on_pre_tool_call))
    ctx.register_hook("post_tool_call", _safe(tokens.on_post_tool_call))
