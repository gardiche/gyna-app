import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { HermesClient } from "./hermes.js";

export interface SessionRecord {
  key: string;
  storedId: string;
  model: string;
  provider?: string;
  reasoningEffort?: string;
  createdAt: string;
}

/**
 * Correspondance clé de session Gyna -> ID persisté Hermes, sur disque.
 * L'ID runtime reste en mémoire : il change après un redémarrage d'Hermes ou du pont.
 */
export class SessionStore {
  private file: string;
  private records = new Map<string, SessionRecord>();
  private runtime = new Map<string, string>();
  private busy = new Set<string>();

  constructor(dataDir: string, private hermes: HermesClient, private profile?: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "sessions.json");
    if (existsSync(this.file)) {
      const list = JSON.parse(readFileSync(this.file, "utf8")) as SessionRecord[];
      for (const r of list) this.records.set(r.key, r);
    }
    hermes.on("reconnected", () => this.runtime.clear());
  }

  private save(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify([...this.records.values()], null, 2));
    renameSync(tmp, this.file);
  }

  get size(): number {
    return this.records.size;
  }

  get(key: string): SessionRecord | undefined {
    return this.records.get(key);
  }

  async create(opts: { model: string; provider?: string; reasoningEffort?: string; title?: string }): Promise<SessionRecord> {
    const res = await this.hermes.request<{ session_id: string; stored_session_id?: string }>("session.create", {
      model: opts.model,
      ...(this.profile ? { profile: this.profile } : {}),
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
      ...(opts.title ? { title: opts.title } : {}),
    });
    const record: SessionRecord = {
      key: randomUUID(),
      storedId: res.stored_session_id ?? res.session_id,
      model: opts.model,
      provider: opts.provider,
      reasoningEffort: opts.reasoningEffort,
      createdAt: new Date().toISOString(),
    };
    this.records.set(record.key, record);
    this.runtime.set(record.key, res.session_id);
    this.save();
    return record;
  }

  /** Renvoie l'ID runtime, en reprenant la session si besoin. */
  async runtimeId(key: string): Promise<string> {
    const cached = this.runtime.get(key);
    if (cached) return cached;
    const record = this.records.get(key);
    if (!record) throw new Error("Session inconnue");
    try {
      const res = await this.hermes.request<{ session_id: string }>("session.resume", { session_id: record.storedId });
      this.runtime.set(key, res.session_id);
      return res.session_id;
    } catch {
      // La ligne persistée n'existe qu'après le premier tour : on recrée une session vide avec les mêmes réglages.
      const res = await this.hermes.request<{ session_id: string; stored_session_id?: string }>("session.create", {
        model: record.model,
        ...(this.profile ? { profile: this.profile } : {}),
        ...(record.provider ? { provider: record.provider } : {}),
        ...(record.reasoningEffort ? { reasoning_effort: record.reasoningEffort } : {}),
      });
      record.storedId = res.stored_session_id ?? res.session_id;
      this.save();
      this.runtime.set(key, res.session_id);
      return res.session_id;
    }
  }

  tryLock(key: string): boolean {
    if (this.busy.has(key)) return false;
    this.busy.add(key);
    return true;
  }

  unlock(key: string): void {
    this.busy.delete(key);
  }
}
