import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { BRIDGE_SIG_HEADER, BRIDGE_TS_HEADER } from "@gyna/schemas";
import { HermesClient } from "./hermes.js";
import { SessionStore } from "./sessions.js";
import { buildServer } from "./server.js";
import { sign, verify } from "./signature.js";

/** Faux `hermes serve` : même framing (une trame JSON-RPC par message), mêmes événements. */
function fakeHermes() {
  const wss = new WebSocketServer({ port: 0 });
  const prompts: string[] = [];
  const createParams: any[] = [];
  wss.on("connection", (ws) => {
    const ev = (type: string, session_id?: string, payload?: object) =>
      ws.send(JSON.stringify({ jsonrpc: "2.0", method: "event", params: { type, session_id, payload } }));
    ev("gateway.ready", undefined, { heartbeat: true });
    ws.on("message", (raw) => {
      const req = JSON.parse(raw.toString());
      const reply = (result: object) => ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }));
      if (req.method === "session.create") { createParams.push(req.params); reply({ session_id: "runtime-1", stored_session_id: "stored-1", info: req.params }); }
      else if (req.method === "session.resume") reply({ session_id: "runtime-2" });
      else if (req.method === "model.options") reply({ models: ["anthropic/claude-sonnet-5"] });
      else if (req.method === "prompt.submit") {
        prompts.push(req.params.text);
        const sid = req.params.session_id;
        ev("message.start", sid);
        ev("tool.start", sid, { id: "t1", name: "upsert_prospects" });
        ev("tool.complete", sid, { id: "t1", name: "upsert_prospects", summary: "20 prospects" });
        ev("message.delta", "autre-session", { text: "ignoré" });
        ev("message.delta", sid, { text: "J'ai trouvé " });
        ev("message.delta", sid, { text: "20 profils." });
        reply({ status: "streaming" });
        ev("message.complete", sid, { text: "J'ai trouvé 20 profils.", status: "complete" });
      } else ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "inconnu" } }));
    });
  });
  const port = (wss.address() as { port: number }).port;
  return { wss, url: `ws://127.0.0.1:${port}/api/ws`, prompts, createParams };
}

const SECRET = "secret-de-test";

function signed(method: string, path: string, body = "") {
  const ts = String(Date.now());
  return { [BRIDGE_TS_HEADER]: ts, [BRIDGE_SIG_HEADER]: sign(SECRET, ts, method, path, body), "content-type": "application/json" };
}

test("signature : accepte la bonne, refuse une altérée ou trop ancienne", () => {
  const ts = String(Date.now());
  const s = sign(SECRET, ts, "POST", "/sessions", "{}");
  assert.ok(verify(SECRET, ts, s, "POST", "/sessions", "{}"));
  assert.ok(!verify(SECRET, ts, s, "POST", "/sessions", '{"x":1}'));
  assert.ok(!verify(SECRET, ts, s, "POST", "/sessions", "{}", Date.now() + 10 * 60 * 1000));
});

test("tour complet : session, streaming filtré, callback", async () => {
  const hermesFake = fakeHermes();

  const callbacks: any[] = [];
  const cbServer = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      assert.ok(verify(SECRET, req.headers[BRIDGE_TS_HEADER] as string, req.headers[BRIDGE_SIG_HEADER] as string, "POST", "/cb", b));
      callbacks.push(JSON.parse(b));
      res.end("ok");
    });
  }).listen(0);
  const cbPort = (cbServer.address() as { port: number }).port;

  const cfg = {
    port: 0,
    host: "127.0.0.1",
    secret: SECRET,
    hermesUrl: hermesFake.url,
    hermesToken: undefined,
    hermesProfile: "gyna",
    callbackUrl: `http://127.0.0.1:${cbPort}/cb`,
    dataDir: mkdtempSync(join(tmpdir(), "gyna-bridge-")),
    turnTimeoutMs: 5000,
  };
  const hermes = new HermesClient(cfg.hermesUrl);
  const sessions = new SessionStore(cfg.dataDir, hermes, cfg.hermesProfile);
  const app = buildServer(cfg, hermes, sessions);
  hermes.start();
  await hermes.waitReady();

  try {
    const unauth = await app.inject({ method: "POST", url: "/sessions", payload: { model: "m" } });
    assert.equal(unauth.statusCode, 401);

    const createBody = JSON.stringify({ model: "anthropic/claude-sonnet-5", provider: "custom" });
    const created = await app.inject({ method: "POST", url: "/sessions", headers: signed("POST", "/sessions", createBody), payload: createBody });
    assert.equal(created.statusCode, 200);
    const key = created.json().hermes_session_key as string;
    assert.equal(hermesFake.createParams[0].profile, "gyna");

    const path = `/sessions/${key}/messages`;
    const turnBody = JSON.stringify({
      text: "Trouve 20 profils",
      mission_token: "jwt.test",
      venture_slug: "l-amorce",
      callback: { conversation_id: "c1", mission_id: "m1" },
    });
    const turn = await app.inject({ method: "POST", url: path, headers: signed("POST", path, turnBody), payload: turnBody });
    const events = turn.body
      .split("\n\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice(6)));

    assert.deepEqual(events.map((e) => e.type), ["start", "tool_start", "tool_complete", "delta", "delta", "complete"]);
    assert.ok(!events.some((e) => e.text === "ignoré"), "les événements d'une autre session sont filtrés");
    assert.match(hermesFake.prompts[0]!, /mission_token: jwt\.test/);
    assert.match(hermesFake.prompts[0]!, /venture: l-amorce/);

    await new Promise((r) => setTimeout(r, 100));
    assert.equal(callbacks.length, 1);
    assert.equal(callbacks[0].text, "J'ai trouvé 20 profils.");
    assert.equal(callbacks[0].tool_events.length, 1);
    assert.equal(callbacks[0].mission_id, "m1");
  } finally {
    hermes.stop();
    await app.close();
    hermesFake.wss.close();
    cbServer.close();
  }
});
