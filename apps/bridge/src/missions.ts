import type { HermesEvent } from "./hermes.js";

/**
 * Sous-agent d'une délégation, reconnu au préfixe du goal (« [Sourcing] … », consigne de Gyna) ou,
 * à défaut, à ses mots : la rédaction et la qualification d'abord, leurs goals citant souvent des profils.
 */
const KEYWORDS: Array<[string, RegExp]> = [
  ["redaction", /\b(r[ée]dig\w*|brouillons?|premi[eè]re approche)\b/i],
  ["veille", /\b(veille|concurren\w*|publicit\w*|biblioth[eè]que)\b/i],
  ["qualification", /\b(qualif\w*|chaleur|signaux)\b/i],
  ["sourcing", /\b(sourcing|trouver|chercher|recherche)\b/i],
];

export function agentOf(goal: string | undefined): string {
  const g = goal ?? "";
  const prefix = g.match(/^\s*\[(sourcing|qualification|r[ée]daction|veille)\]/i)?.[1]?.toLowerCase();
  if (prefix) return prefix.startsWith("r") ? "redaction" : prefix;
  return KEYWORDS.find(([, re]) => re.test(g))?.[0] ?? "gyna";
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

/** Identifiant stable d'un sous-agent dans une délégation. */
export function subagentKey(p: Record<string, unknown>): string {
  return (
    str(p.subagent_id) ??
    (str(p.delegation_id) ? `${p.delegation_id}:${p.task_index ?? 0}` : undefined) ??
    str(p.child_session_id) ??
    str(p.goal) ??
    "sous-agent"
  );
}

export interface MissionCallback {
  conversation_id: string;
  mission_id: string;
}

export interface Activity {
  kind: "start" | "complete";
  agent: string;
  goal?: string;
  status?: string;
  summary?: string;
}

/**
 * Suivi d'une mission au-delà du premier tour de Gyna : `delegate_task` tourne en arrière-plan dans
 * `hermes serve`, et Hermes relance Gyna dans un nouveau tour quand ses sous-agents ont fini.
 * La mission reste ouverte tant qu'un sous-agent travaille ou qu'un tour de Gyna est en cours.
 */
export class MissionWatch {
  readonly pending = new Map<string, string>(); // clé du sous-agent → agent
  inTurn = false;
  /** Appels à delegate_task dont Gyna n'a pas encore reçu le résultat (un tour de suite par appel). */
  awaiting = 0;
  /** Le flux du premier tour est encore ouvert vers l'app. */
  streaming = true;
  private text = "";
  private tools: Array<{ id: string; name: string; summary?: string; ok: boolean }> = [];
  private idle: NodeJS.Timeout | null = null;

  constructor(
    readonly key: string,
    readonly sid: string,
    readonly callback: MissionCallback | undefined,
    private hooks: {
      onActivity: (w: MissionWatch, a: Activity) => void;
      onTurnEnd: (w: MissionWatch, turn: { text: string; tools: MissionWatch["tools"]; status: string; followup: boolean }) => void;
      onIdle: (w: MissionWatch) => void;
      idleMs: number;
    },
  ) {
    this.touch();
  }

  /** Mission close : plus aucun événement n'est traité. */
  closed = false;

  touch(): void {
    if (this.closed) return;
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.hooks.onIdle(this), this.hooks.idleMs);
  }

  stop(): void {
    this.closed = true;
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
  }

  /** La mission peut se clore : aucun sous-agent, aucun résultat attendu, aucun tour de Gyna en cours. */
  get settled(): boolean {
    return this.pending.size === 0 && this.awaiting === 0 && !this.inTurn;
  }

  /** Un outil de Gyna a fini : une délégation lancée annonce un tour de suite. */
  noteTool(name: string): void {
    if (/delegate_task/.test(name)) this.awaiting++;
  }

  /** Événements des sous-agents, pendant comme après le premier tour. */
  handleSubagent(ev: HermesEvent): void {
    if (this.closed) return;
    const p = ev.payload ?? {};
    const key = subagentKey(p);
    const agent = this.pending.get(key) ?? agentOf(str(p.goal));
    if (ev.type === "subagent.start") {
      this.pending.set(key, agent);
      this.hooks.onActivity(this, { kind: "start", agent, goal: str(p.goal) });
    } else if (ev.type === "subagent.complete") {
      this.pending.delete(key);
      this.hooks.onActivity(this, { kind: "complete", agent, goal: str(p.goal), status: str(p.status), summary: str(p.summary) });
    }
    this.touch();
  }

  /** Tours de Gyna relancés par Hermes après le premier (résultats des sous-agents). */
  handleFollowup(ev: HermesEvent): void {
    if (this.closed) return;
    const p = ev.payload ?? {};
    this.touch();
    if (ev.type === "message.start") {
      this.inTurn = true;
      this.text = "";
      this.tools = [];
    } else if (ev.type === "message.delta") {
      this.inTurn = true;
      this.text += str(p.text) ?? "";
    } else if (ev.type === "tool.complete") {
      const name = str(p.name) ?? str(p.tool) ?? str(p.tool_name) ?? "outil";
      this.noteTool(name);
      this.tools.push({
        id: str(p.id) ?? str(p.tool_call_id) ?? `${Date.now()}`,
        name,
        summary: str(p.summary),
        ok: !p.error && p.status !== "error" && p.ok !== false,
      });
    } else if (ev.type === "message.complete") {
      this.inTurn = false;
      this.awaiting = Math.max(0, this.awaiting - 1);
      const text = typeof p.text === "string" && p.text ? p.text : this.text;
      this.hooks.onTurnEnd(this, { text, tools: this.tools, status: str(p.status) ?? "complete", followup: true });
      this.text = "";
      this.tools = [];
    }
  }
}
