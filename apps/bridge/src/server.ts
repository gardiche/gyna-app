import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { BRIDGE_SIG_HEADER, BRIDGE_TS_HEADER, type BridgeEvent } from "@gyna/schemas";
import type { BridgeConfig } from "./config.js";
import type { HermesClient, HermesEvent } from "./hermes.js";
import type { SessionStore } from "./sessions.js";
import { composeMissionPrompt, mapEvent } from "./events.js";
import { MissionWatch, readUsage, type Activity, type MissionCallback } from "./missions.js";
import { sign, verify } from "./signature.js";

interface TurnBody {
  text: string;
  mission_token: string;
  venture_slug?: string | null;
  budget_remaining_eur?: number;
  callback?: MissionCallback;
}

/** Sans nouvelles des sous-agents pendant ce délai, la mission est close. */
const MISSION_IDLE_MS = Number(process.env.MISSION_IDLE_MS ?? 30 * 60 * 1000);
/** Hermes pousse la consommation chaque seconde ; l'app n'en reçoit qu'un relevé par intervalle. */
const USAGE_POST_MS = Number(process.env.USAGE_POST_MS ?? 8000);

export function buildServer(cfg: BridgeConfig, hermes: HermesClient, sessions: SessionStore): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, bodyLimit: 256 * 1024 });

  hermes.on("log", (l: Record<string, unknown>) => app.log.info(l));

  // Missions suivies au-delà du premier tour, par ID runtime de session Hermes.
  const watches = new Map<string, MissionWatch>();
  // Envoi au client du flux du premier tour, tant qu'il est ouvert.
  const streams = new Map<string, (ev: BridgeEvent) => void>();

  const post = (path: string, payload: Record<string, unknown>) => {
    if (!cfg.callbackUrl) return;
    void postSigned(cfg, path, payload).catch((err) => app.log.warn({ msg: "callback_failed", path, err: (err as Error).message }));
  };

  // Relevés de consommation : au plus un envoi par mission et par intervalle, plus un dernier à la clôture.
  const usageTimers = new Map<MissionWatch, NodeJS.Timeout>();
  const flushUsage = (w: MissionWatch) => {
    const t = usageTimers.get(w);
    if (t) clearTimeout(t);
    usageTimers.delete(w);
    if (w.callback && w.usage) post("/api/bridge/usage", { ...w.callback, usage: w.usage });
  };
  const scheduleUsage = (w: MissionWatch) => {
    if (usageTimers.has(w)) return;
    usageTimers.set(w, setTimeout(() => flushUsage(w), USAGE_POST_MS));
  };

  const closeWatch = (w: MissionWatch) => {
    if (w.closed) return;
    flushUsage(w);
    w.stop();
    if (watches.get(w.sid) === w) watches.delete(w.sid);
    sessions.unlock(w.key);
  };

  const watchHooks = {
    idleMs: MISSION_IDLE_MS,
    onUsage: scheduleUsage,
    onActivity: (w: MissionWatch, a: Activity) => {
      streams.get(w.sid)?.(
        a.kind === "start"
          ? { type: "tool_start", id: `subagent-${a.agent}-${a.goal ?? ""}`.slice(0, 120), name: `subagent.${a.agent}`, summary: a.goal }
          : { type: "tool_complete", id: `subagent-${a.agent}-${a.goal ?? ""}`.slice(0, 120), name: `subagent.${a.agent}`, summary: a.summary, ok: a.status !== "error" && a.status !== "failed" },
      );
      if (w.callback) post("/api/bridge/activity", { ...w.callback, ...a });
    },
    onTurnEnd: (w: MissionWatch, turn: { text: string; tools: unknown[]; status: string; followup: boolean }) => {
      if (w.callback) {
        post("/api/bridge/turn-complete", {
          ...w.callback,
          text: turn.text,
          status: turn.status,
          error: null,
          tool_events: turn.tools,
          followup: turn.followup,
          pending_subagents: w.settled ? 0 : Math.max(w.pending.size, w.awaiting, 1),
        });
      }
      if (w.settled) closeWatch(w);
      else flushUsage(w);
    },
    onIdle: (w: MissionWatch) => {
      app.log.warn({ msg: "mission_idle", sid: w.sid, pending: w.pending.size, awaiting: w.awaiting });
      if (w.callback) {
        post("/api/bridge/turn-complete", {
          ...w.callback,
          text: "",
          status: "error",
          error: "Plus de nouvelles des sous-agents depuis 30 minutes : la mission est close.",
          tool_events: [],
          followup: true,
          pending_subagents: 0,
        });
      }
      closeWatch(w);
    },
  };

  // Écoute permanente : sous-agents, et tours de Gyna relancés après le premier.
  hermes.on("event", (ev: HermesEvent) => {
    let w = ev.session_id ? watches.get(ev.session_id) : undefined;
    if (ev.type.startsWith("subagent.")) {
      app.log.info({ msg: "subagent_event", type: ev.type, session_id: ev.session_id, keys: Object.keys(ev.payload ?? {}) });
      // Les événements d'un enfant peuvent porter un autre ID de session : une seule mission suivie lève l'ambiguïté.
      if (!w && watches.size === 1) w = [...watches.values()][0];
      w?.handleSubagent(ev);
      return;
    }
    if (w && (ev.type === "session.usage" || ev.type === "message.complete")) w.noteUsage(readUsage(ev.payload));
    if (w && !w.streaming && /^(message\.(start|delta|complete)|tool\.complete)$/.test(ev.type)) w.handleFollowup(ev);
  });

  // Horloge des publications planifiées : chaque minute, l'app publie les posts dont l'heure choisie par un associé est passée.
  const publishTick = setInterval(() => post("/api/bridge/publish-due", {}), Number(process.env.PUBLISH_TICK_MS ?? 60_000));
  publishTick.unref();
  app.addHook("onClose", async () => clearInterval(publishTick));

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
    missions: watches.size,
  }));

  app.get("/models", async (_req, reply) => {
    try {
      return await hermes.request("model.options", {});
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  // Barres de quota de l'abonnement, telles que Hermes les renvoie (forme non documentée : l'app les lit avec prudence).
  let barsLogged = false;
  app.get("/usage/bars", async (_req, reply) => {
    try {
      const bars = await hermes.request("usage.bars", {}, 20_000);
      if (!barsLogged) {
        barsLogged = true;
        app.log.info({ msg: "usage_bars", sample: JSON.stringify(bars).slice(0, 1500) });
      }
      return { bars };
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  // Génération d'un visuel à la demande d'un associé, hors mission : Hermes renvoie l'image en data URL.
  app.post<{ Body: { prompt: string; aspect_ratio?: string } }>("/images", async (req, reply) => {
    const prompt = String(req.body?.prompt ?? "").trim();
    if (!prompt) return reply.code(400).send({ error: "prompt requis" });
    const aspect = ["square", "portrait", "landscape"].includes(req.body?.aspect_ratio ?? "") ? req.body!.aspect_ratio : "square";
    try {
      const r = await hermes.request<{ available?: boolean; success?: boolean; image_data?: string; error?: string }>(
        "image.generate",
        { prompt, aspect_ratio: aspect, max_bytes: 12_000_000 },
        240_000,
      );
      if (!r?.available) return reply.code(503).send({ error: "Aucun générateur d'images n'est configuré dans Hermes." });
      if (!r.success || !r.image_data) return reply.code(502).send({ error: r.error ?? "Hermes n'a pas renvoyé d'image." });
      return { image_data: r.image_data };
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
      const w = watches.get(sid);
      if (w) closeWatch(w);
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
    if (!sessions.tryLock(key)) {
      return reply.code(409).send({ error: "Gyna travaille encore sur la mission en cours. Attendez son compte rendu, ou arrêtez la mission." });
    }

    let sid: string;
    try {
      sid = await sessions.runtimeId(key);
    } catch (err) {
      sessions.unlock(key);
      return reply.code(502).send({ error: (err as Error).message });
    }

    const watch = new MissionWatch(key, sid, body.callback, watchHooks);
    // Point de départ des compteurs : la session cumule les tokens de toutes les missions de la conversation.
    watch.baseline = await hermes.request("session.usage", { session_id: sid }, 5000).then(readUsage).catch(() => null);
    watches.set(sid, watch);
    return streamTurn(reply, { cfg, hermes, sid, body, watch, streams, closeWatch, post, log: app.log });
  });

  return app;
}

async function streamTurn(
  reply: FastifyReply,
  ctx: {
    cfg: BridgeConfig;
    hermes: HermesClient;
    sid: string;
    body: TurnBody;
    watch: MissionWatch;
    streams: Map<string, (ev: BridgeEvent) => void>;
    closeWatch: (w: MissionWatch) => void;
    post: (path: string, payload: Record<string, unknown>) => void;
    log: FastifyInstance["log"];
  },
): Promise<void> {
  const { cfg, hermes, sid, body, watch } = ctx;
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
  ctx.streams.set(sid, send);
  watch.inTurn = true;

  let text = "";
  const tools: Array<Extract<BridgeEvent, { type: "tool_complete" }>> = [];
  let finished = false;

  const finish = (status: string, error?: string) => {
    if (finished) return;
    finished = true;
    hermes.off("event", onEvent);
    clearTimeout(timer);
    clearInterval(keepAlive);
    ctx.streams.delete(sid);
    watch.streaming = false;
    watch.inTurn = false;
    if (error) send({ type: "error", message: error });
    if (clientOpen) res.end();
    if (error) {
      // Erreur ou interruption : la mission s'arrête là, sous-agents compris.
      watch.pending.clear();
      watch.awaiting = 0;
    }
    const pending = watch.settled ? 0 : Math.max(watch.pending.size, watch.awaiting, 1);
    if (body.callback && cfg.callbackUrl) {
      ctx.post("/api/bridge/turn-complete", {
        ...body.callback,
        text,
        status: error ? "error" : status,
        error: error ?? null,
        tool_events: tools,
        followup: false,
        pending_subagents: pending,
      });
    }
    if (watch.settled) ctx.closeWatch(watch);
    else watch.touch();
  };

  const onEvent = (ev: HermesEvent) => {
    if (ev.session_id !== sid || ev.type.startsWith("subagent.")) return;
    const mapped = mapEvent(ev, () => randomUUID());
    if (!mapped) return;
    if (mapped.type === "delta") text += mapped.text;
    if (mapped.type === "tool_complete") {
      tools.push(mapped);
      watch.noteTool(mapped.name);
    }
    if (mapped.type === "complete") {
      if (mapped.text) text = mapped.text;
      send(mapped);
      finish(mapped.status);
      return;
    }
    send(mapped);
  };
  hermes.on("event", onEvent);

  const timer = setTimeout(() => {
    void hermes.request("session.interrupt", { session_id: sid }).catch(() => undefined);
    finish("timeout", "Le tour a dépassé la durée maximale et a été interrompu.");
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
    finish("error", (err as Error).message);
  }
}

/** POST signé vers l'app, sur le chemin donné de la même origine que APP_CALLBACK_URL. */
async function postSigned(cfg: BridgeConfig, path: string, payload: Record<string, unknown>): Promise<void> {
  const url = new URL(path, cfg.callbackUrl!);
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
