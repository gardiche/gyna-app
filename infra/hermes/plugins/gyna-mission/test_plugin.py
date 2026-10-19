"""Tests du plugin gyna-mission, sans Hermes : python -m unittest discover -s infra/hermes/plugins/gyna-mission -p "test_*.py"."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("gyna_mission", HERE / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)

KEY = "gm-sk7m2-9xs4t-h3w8n-b6r5s"
BLOCK = f"[Mission Gyna]\nventure: l-amorce\nmission_token: {KEY}\nTransmets mission_token tel quel à chaque appel d'outil Gyna.\n---\nRefais le carrousel."


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


class MissionTokensTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.clock = Clock()
        self.t = plugin.MissionTokens(self.dir / "probe", self.dir / "probe.jsonl", self.clock)

    def test_impose_le_jeton_du_bloc_de_mission(self):
        self.t.on_pre_llm_call(session_id="s1", user_message=BLOCK)
        r = self.t.on_pre_tool_call(tool_name="mcp_gyna_get_brief", session_id="s1", args={"mission_token": "gm-sk7m2-9xs4t-h3w8-b6r5s"})
        self.assertEqual(r, {"action": "modify", "args": {"mission_token": KEY}})

    def test_le_sous_agent_herite_du_parent_et_pas_de_son_goal(self):
        self.t.on_pre_llm_call(session_id="s1", user_message=BLOCK)
        self.t.on_subagent_start(parent_session_id="s1", child_session_id="c1")
        mal_recopie = BLOCK.replace(KEY, "gm-aaaaa-bbbbb-ccccc-ddddd")
        self.t.on_pre_llm_call(session_id="c1", parent_session_id="s1", user_message=mal_recopie)
        r = self.t.on_pre_tool_call(tool_name="mcp_gyna_submit_posts", session_id="c1", args={})
        self.assertEqual(r["args"]["mission_token"], KEY)

    def test_parent_connu_par_pre_llm_call_seulement(self):
        self.t.on_pre_llm_call(session_id="s1", user_message=BLOCK)
        self.t.on_pre_llm_call(session_id="c2", parent_session_id="s1", user_message="[Ads] Refais le carrousel")
        self.assertEqual(self.t.on_pre_tool_call(tool_name="mcp_gyna_get_brief", session_id="c2", args={})["args"]["mission_token"], KEY)

    def test_une_nouvelle_mission_remplace_l_ancienne(self):
        self.t.on_pre_llm_call(session_id="s1", user_message=BLOCK)
        other = "gm-22222-33333-44444-55555"
        self.t.on_pre_llm_call(session_id="s1", user_message=BLOCK.replace(KEY, other))
        self.assertEqual(self.t.on_pre_tool_call(tool_name="mcp_gyna_get_brief", session_id="s1", args={})["args"]["mission_token"], other)

    def test_un_tour_sans_bloc_garde_le_jeton(self):
        self.t.on_pre_llm_call(session_id="s1", user_message=BLOCK)
        self.t.on_pre_llm_call(session_id="s1", user_message="Résultats des sous-agents : …")
        self.assertIsNotNone(self.t.on_pre_tool_call(tool_name="mcp_gyna_get_brief", session_id="s1", args={}))

    def test_ne_touche_ni_aux_autres_outils_ni_aux_sessions_inconnues(self):
        self.t.on_pre_llm_call(session_id="s1", user_message=BLOCK)
        self.assertIsNone(self.t.on_pre_tool_call(tool_name="mcp_apify_call_actor", session_id="s1", args={}))
        self.assertIsNone(self.t.on_pre_tool_call(tool_name="mcp_gyna_get_brief", session_id="inconnue", args={"mission_token": KEY}))

    def test_un_texte_sans_bloc_ne_donne_pas_de_jeton(self):
        self.t.on_pre_llm_call(session_id="s1", user_message=f"mission_token: {KEY}")
        self.assertIsNone(self.t.on_pre_tool_call(tool_name="mcp_gyna_get_brief", session_id="s1", args={}))

    def test_le_jeton_expire(self):
        self.t.on_pre_llm_call(session_id="s1", user_message=BLOCK)
        self.clock.now = plugin.TTL_S + 1
        self.assertIsNone(self.t.on_pre_tool_call(tool_name="mcp_gyna_get_brief", session_id="s1", args={}))

    def test_la_sonde_n_ecrit_jamais_le_jeton(self):
        (self.dir / "probe").touch()
        self.t.on_pre_llm_call(session_id="s1", user_message=BLOCK)
        self.t.on_subagent_start(parent_session_id="s1", child_session_id="c1", child_role="leaf")
        self.t.on_pre_tool_call(tool_name="mcp_gyna_get_brief", session_id="c1", args={"mission_token": KEY})
        self.t.on_post_tool_call(tool_name="mcp_gyna_get_brief", session_id="c1", args={"mission_token": KEY}, status="ok")
        text = (self.dir / "probe.jsonl").read_text(encoding="utf-8")
        self.assertNotIn("gm-", text)
        lines = [json.loads(l) for l in text.splitlines()]
        self.assertEqual([l["event"] for l in lines], ["pre_llm_call", "subagent_start", "pre_tool_call", "post_tool_call"])
        self.assertTrue(lines[2]["agent_right"])
        self.assertTrue(lines[3]["applied"])

    def test_une_erreur_ne_remonte_pas(self):
        def boom(**kw):
            raise RuntimeError("x")

        self.assertIsNone(plugin._safe(boom)(tool_name="mcp_gyna_x"))


if __name__ == "__main__":
    unittest.main()
