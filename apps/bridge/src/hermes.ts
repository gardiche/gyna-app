import { EventEmitter } from "node:events";
import WebSocket from "ws";

export interface HermesEvent {
  type: string;
  session_id?: string;
  payload?: Record<string, unknown>;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

export class RpcError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
  }
}

/**
 * Client JSON-RPC 2.0 vers `hermes serve` (WebSocket /api/ws).
 * - attend `gateway.ready` avant tout envoi ;
 * - se reconnecte seul, avec backoff ;
 * - émet "event" pour chaque notification et "reconnected" après une reconnexion.
 */
export class HermesClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private readyWaiters: Array<() => void> = [];
  private backoff = 1000;
  private closed = false;
  ready = false;
  lastReadyPayload: Record<string, unknown> | null = null;

  constructor(private url: string, private token?: string) {
    super();
    this.setMaxListeners(100);
  }

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    this.ws?.close();
  }

  private connect(): void {
    const target = this.token ? `${this.url}${this.url.includes("?") ? "&" : "?"}token=${encodeURIComponent(this.token)}` : this.url;
    const ws = new WebSocket(target);
    this.ws = ws;

    ws.on("message", (raw) => this.onMessage(raw.toString()));
    ws.on("close", () => this.onClose());
    ws.on("error", (err) => {
      this.emit("log", { level: "warn", msg: "hermes_ws_error", err: err.message });
    });
  }

  private onMessage(text: string): void {
    let msg: any;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg && typeof msg.id === "number" && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new RpcError(msg.error.message ?? "Erreur Hermes", msg.error.code));
      else p.resolve(msg.result);
      return;
    }
    if (msg && msg.method === "event" && msg.params && typeof msg.params.type === "string") {
      const ev = msg.params as HermesEvent;
      if (ev.type === "gateway.ready") {
        const wasReady = this.lastReadyPayload !== null;
        this.ready = true;
        this.backoff = 1000;
        this.lastReadyPayload = (ev.payload as Record<string, unknown>) ?? {};
        this.readyWaiters.splice(0).forEach((fn) => fn());
        if (wasReady) this.emit("reconnected");
        this.emit("log", { level: "info", msg: "hermes_ready" });
        return;
      }
      this.emit("event", ev);
    }
  }

  private onClose(): void {
    this.ready = false;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new RpcError("Connexion à Hermes perdue"));
    }
    this.pending.clear();
    if (this.closed) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 30_000);
    this.emit("log", { level: "warn", msg: "hermes_reconnect", delay_ms: delay });
    setTimeout(() => this.connect(), delay);
  }

  waitReady(timeoutMs = 10_000): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new RpcError("Hermes n'est pas prêt")), timeoutMs);
      this.readyWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async request<T = any>(method: string, params: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<T> {
    await this.waitReady();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError(`Délai dépassé pour ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.ws!.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }
}
