import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { BRIDGE_SIG_HEADER, BRIDGE_TS_HEADER, type BridgeEvent } from "@gyna/schemas";
import type { BridgeConfig } from "./config.js";
import type { HermesClient, HermesEvent } from "./hermes.js";
import type { SessionStore } from "./sessions.js";
import { composeMissionPrompt, mapEvent } from "./events.js";
import { sign, verify } from "./signature.js";

interface TurnBody {
  text: string;
  mission_token: string;
  venture_slug?: string | null;
  budget_remaining_eur?: number;
  callback?: { conversation_id: string; mission_id: string };
}

export function buildServer(cfg: BridgeConfig, hermes: HermesClient, sessions: SessionStore): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, bodyLimit: 256 * 1024 });

  hermes.on("log", (l: Record<string, unknown>) => app.log.info(l));

  // Corps brut conservé pour vérifier la signature.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as FastifyRequest & { rawBody?: string }).rawBody = body as string;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.addHook("preHandler", async (req, reply) => {
    if (req.url === "/health") return;
    const raw = (req as FastifyRequest & { rawBody?: string }).rawBody ?? "";
    const ok = verify(
      cfg.secret,
      req.headers[BRIDGE_TS_HEADER] as string | undefined,
      req.headers[BRIDGE_SIG_HEADER] as string | undefined,
      req.method,
      req.url,
      raw,
    );
    if (!ok) return reply.code(401).send({ error: "Signature invalide" });
  });

  app.get("/health", async () => ({
    ok: hermes.ready,
    hermes: hermes.ready ? "connecté" : "déconnecté",
    sessions: sessions.size,
  }));

  app.get("/models", async (_req, reply) => {
    try {
      return await hermes.request("model.options", {});
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  app.post<{ Body: { model: string; provider?: string; reasoning_effort?: string; title?: string } }>(
    "/sessions",
    async (req, reply) => {
      const { model, provider, reasoning_effort, title } = req.body ?? ({} as never);
      if (!model) return reply.code(400).send({ error: "model requis" });
      try {
        const rec = await sessions.create({ model, provider, reasoningEffort: reasoning_effort, title });
        return { hermes_session_key: rec.key };
      } catch (err) {
        return reply.code(502).send({ error: (err as Error).message });
      }
    },
  );

  app.get<{ Params: { key: string } }>("/sessions/:key/history", async (req, reply) => {
    try {
      const sid = await sessions.runtimeId(req.params.key);
      return await hermes.request("session.history", { session_id: sid });
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { key: string } }>("/sessions/:key/interrupt", async (req, reply) => {
    try {
      const sid = await sessions.runtimeId(req.params.key);
      await hermes.request("session.interrupt", { session_id: sid });
      return { ok: true };
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { key: string }; Body: TurnBody }>("/sessions/:key/messages", async (req, reply) => {
    const key = req.params.key;
    const body = req.body;
    if (!body?.text || !body?.mission_token) return reply.code(400).send({ error: "text et mission_token requis" });
    if (!sessions.get(key)) return reply.code(404).send({ error: "Session inconnue" });
    if (!sessions.tryLock(key)) return reply.code(409).send({ error: "Un tour est déjà en cours" });

    let sid: string;
    try {
      sid = await sessions.runtimeId(key);
    } catch (err) {
      sessions.unlock(key);
      return reply.code(502).send({ error: (err as Error).message });
    }

    return streamTurn(reply, { cfg, hermes, sessions, key, sid, body, log: app.log });
  });

  return app;
}

async function streamTurn(
  reply: FastifyReply,
  ctx: {
    cfg: BridgeConfig;
    hermes: HermesClient;
    sessions: SessionStore;
    key: string;
    sid: string;
    body: TurnBody;
    log: FastifyInstance["log"];
  },
): Promise<void> {
  const { cfg, hermes, sessions, key, sid, body } = ctx;
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  let clientOpen = true;
  res.on("close", () => {
    clientOpen = false;
  });
  const send = (ev: BridgeEvent) => {
    if (clientOpen) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  };

  let text = "";
  const tools: Array<Extract<BridgeEvent, { type: "tool_complete" }>> = [];
  let finished = false;

  const finish = async (status: string, error?: string) => {
    if (finished) return;
    finished = true;
    hermes.off("event", onEvent);
    clearTimeout(timer);
    clearInterval(keepAlive);
    sessions.unlock(key);
    if (error) send({ type: "error", message: error });
    if (clientOpen) res.end();
    if (body.callback && cfg.callbackUrl) {
      await postCallback(cfg, {
        ...body.callback,
        text,
        status: error ? "error" : status,
        error: error ?? null,
        tool_events: tools,
      }).catch((err) => ctx.log.warn({ msg: "callback_failed", err: (err as Error).message }));
    }
  };

  const onEvent = (ev: HermesEvent) => {
    if (ev.session_id !== sid) return;
    const mapped = mapEvent(ev, () => randomUUID());
    if (!mapped) return;
    if (mapped.type === "delta") text += mapped.text;
    if (mapped.type === "tool_complete") tools.push(mapped);
    if (mapped.type === "complete") {
      if (mapped.text) text = mapped.text;
      send(mapped);
      void finish(mapped.status);
      return;
    }
    send(mapped);
  };
  hermes.on("event", onEvent);

  const timer = setTimeout(() => {
    void hermes.request("session.interrupt", { session_id: sid }).catch(() => undefined);
    void finish("timeout", "Le tour a dépassé la durée maximale et a été interrompu.");
  }, cfg.turnTimeoutMs);
  const keepAlive = setInterval(() => {
    if (clientOpen) res.write(": ping\n\n");
  }, 15_000);

  try {
    await hermes.request(
      "prompt.submit",
      {
        session_id: sid,
        text: composeMissionPrompt({
          text: body.text,
          missionToken: body.mission_token,
          ventureSlug: body.venture_slug,
          budgetRemainingEur: body.budget_remaining_eur,
        }),
      },
      cfg.turnTimeoutMs,
    );
  } catch (err) {
    await finish("error", (err as Error).message);
  }
}

async function postCallback(cfg: BridgeConfig, payload: Record<string, unknown>): Promise<void> {
  const url = new URL(cfg.callbackUrl!);
  const body = JSON.stringify(payload);
  const ts = String(Date.now());
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [BRIDGE_TS_HEADER]: ts,
      [BRIDGE_SIG_HEADER]: sign(cfg.secret, ts, "POST", url.pathname, body),
    },
    body,
  });
  if (!r.ok) throw new Error(`Callback ${r.status}`);
}
