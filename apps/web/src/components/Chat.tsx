"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconFail, IconOk, IconSend, IconStop, Spark } from "./icons";
import { MissionResults } from "./MissionResults";
import { Markdown } from "./Markdown";
import { History, type HistoryItem } from "./History";

export interface ToolEvent { id: string; name: string; summary?: string; ok?: boolean; done: boolean }
export interface ChatMessage { id: string; role: "user" | "assistant"; content: string; mission_id: string | null; tool_events: ToolEvent[] }
export interface ConversationInfo { id: string; title: string; model: string; reasoning_effort: string | null; venture: { id: string; name: string } | null }
interface VentureOption { id: string; name: string }
interface ModelOption { id: string; provider: string | null }

const TOOL_LABELS: Record<string, string> = {
  get_brief: "Lecture du brief",
  get_skill: "Lecture d'un skill",
  find_prospect: "Vérification des doublons",
  upsert_prospects: "Ajout de prospects",
  add_signals: "Enregistrement de signaux",
  qualify_prospect: "Qualification",
  discard_prospect: "Prospect écarté",
  submit_draft: "Brouillon soumis",
  report_cost: "Coût déclaré",
  log_action: "Journal",
};
const toolLabel = (name: string) => TOOL_LABELS[name.replace(/^.*__/, "")] ?? name;
const REASONING: Record<string, string> = { low: "Raisonnement rapide", medium: "Raisonnement moyen", high: "Raisonnement poussé" };

function GynaAvatar({ working }: { working: boolean }) {
  return (
    <div className={`gyna-avatar${working ? " working" : ""}`} aria-hidden="true">
      <div className="aura" />
      <div className="core"><Spark size={22} /></div>
    </div>
  );
}

function ToolLog({ tools }: { tools: ToolEvent[] }) {
  if (!tools.length) return null;
  return (
    <div className="tool-log" aria-label="Activité des agents">
      {tools.map((t) => (
        <div key={t.id}>
          {t.done ? (t.ok === false ? <IconFail /> : <IconOk />) : <span className="spinner" aria-label="En cours" />}
          <span className="name">{toolLabel(t.name)}</span>
          {t.summary ? <span className="meta">{t.summary}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function Chat({
  conversation,
  history,
  initialMessages,
  ventures,
  defaultVentureId,
  defaultModel,
}: {
  conversation: ConversationInfo | null;
  history: HistoryItem[];
  initialMessages: ChatMessage[];
  ventures: VentureOption[];
  defaultVentureId: string | null;
  defaultModel: string;
}) {
  const router = useRouter();
  const [conv, setConv] = useState(conversation);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([{ id: defaultModel, provider: null }]);
  const [settings, setSettings] = useState({ venture_id: defaultVentureId ?? "", model: defaultModel, reasoning_effort: "medium" });
  const scroller = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // On ne recharge le fil que si l'on change vraiment de conversation : après le premier message,
  // la conversation créée ici revient du serveur avec le même identifiant et garde le texte reçu en direct.
  const convIdRef = useRef<string | null>(conversation?.id ?? null);
  useEffect(() => {
    const next = conversation?.id ?? null;
    if (next === convIdRef.current) return;
    convIdRef.current = next;
    setConv(conversation);
    setMessages(initialMessages);
    setError(null);
  }, [conversation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (conv) return;
    void fetch("/api/models")
      .then((r) => r.json())
      .then((d: { models: ModelOption[] }) => {
        if (d.models?.length) setModels(d.models);
      })
      .catch(() => undefined);
  }, [conv]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((list) => {
      const copy = list.slice();
      const i = copy.length - 1;
      if (i >= 0 && copy[i]!.role === "assistant") copy[i] = fn(copy[i]!);
      return copy;
    });

  async function ensureConversation(): Promise<ConversationInfo | null> {
    if (conv) return conv;
    const model = models.find((m) => m.id === settings.model) ?? { id: settings.model, provider: null };
    const r = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        venture_id: settings.venture_id || null,
        model: model.id,
        provider: model.provider,
        reasoning_effort: settings.reasoning_effort,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Impossible d'ouvrir la conversation.");
      return null;
    }
    const venture = ventures.find((v) => v.id === settings.venture_id) ?? null;
    const created: ConversationInfo = { id: d.id, title: "Nouvelle conversation", model: model.id, reasoning_effort: settings.reasoning_effort, venture };
    convIdRef.current = created.id;
    setConv(created);
    window.history.replaceState(null, "", `/c/${d.id}`);
    return created;
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const c = await ensureConversation();
    if (!c) {
      setBusy(false);
      return;
    }
    setInput("");
    setMessages((l) => [
      ...l,
      { id: crypto.randomUUID(), role: "user", content: text, mission_id: null, tool_events: [] },
      { id: crypto.randomUUID(), role: "assistant", content: "", mission_id: null, tool_events: [] },
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await fetch(`/api/conversations/${c.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Erreur ${r.status}`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "mission") {
            setMessages((l) => l.map((m, i) => (i >= l.length - 2 ? { ...m, mission_id: ev.mission_id } : m)));
          } else if (ev.type === "delta") {
            patchLast((m) => ({ ...m, content: m.content + ev.text }));
          } else if (ev.type === "complete") {
            patchLast((m) => ({ ...m, content: ev.text || m.content }));
          } else if (ev.type === "tool_start") {
            patchLast((m) => ({ ...m, tool_events: [...m.tool_events, { id: ev.id, name: ev.name, summary: ev.summary, done: false }] }));
          } else if (ev.type === "tool_complete") {
            patchLast((m) => {
              const found = m.tool_events.some((t) => t.id === ev.id);
              const done: ToolEvent = { id: ev.id, name: ev.name, summary: ev.summary, ok: ev.ok, done: true };
              return { ...m, tool_events: found ? m.tool_events.map((t) => (t.id === ev.id ? { ...t, ...done, summary: ev.summary ?? t.summary } : t)) : [...m.tool_events, done] };
            });
          } else if (ev.type === "error") {
            setError(ev.message);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      abortRef.current = null;
      setBusy(false);
      router.refresh();
    }
  }

  async function stop() {
    if (!conv) return;
    await fetch(`/api/conversations/${conv.id}/interrupt`, { method: "POST" });
    abortRef.current?.abort();
  }

  const lastAssistant = messages.length ? messages[messages.length - 1] : null;

  return (
    <section className="card card-main chat" aria-label="Conversation avec Gyna">
      <div className="chat-head">
        <div className="row">
          <h2>{conv?.title && conv.title !== "Nouvelle conversation" ? conv.title : "Nouvelle mission"}</h2>
          {conv ? (
            <>
              {conv.venture ? <span className="pill pill-lime">{conv.venture.name}</span> : null}
              <span className="pill">{conv.model.replace(/^.*\//, "")}</span>
              {conv.reasoning_effort ? <span className="pill">{REASONING[conv.reasoning_effort] ?? conv.reasoning_effort}</span> : null}
            </>
          ) : null}
        </div>
        <div className="row">
          <History items={history} currentId={conv?.id ?? null} />
          {conv ? <a href="/nouvelle" className="btn btn-sm">Nouvelle conversation</a> : null}
          {busy ? (
            <button type="button" className="btn btn-dark" onClick={() => void stop()}><IconStop />Arrêter</button>
          ) : null}
        </div>
      </div>

      <div className="chat-scroll" ref={scroller}>
        <div className="thread">
          {!conv ? (
            <div className="stack" style={{ gap: 16 }}>
              <p className="muted" style={{ fontSize: 15 }}>
                Choisissez la venture et le modèle, puis confiez une mission à Gyna. Ces réglages restent fixes pour toute la conversation.
              </p>
              <div className="form-grid">
                <label className="field">
                  Venture
                  <select value={settings.venture_id} onChange={(e) => setSettings({ ...settings, venture_id: e.target.value })}>
                    <option value="">Aucune</option>
                    {ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  Modèle
                  <select value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })}>
                    {models.map((m) => <option key={`${m.provider}-${m.id}`} value={m.id}>{m.id.replace(/^.*\//, "")}</option>)}
                  </select>
                </label>
                <label className="field">
                  Raisonnement
                  <select value={settings.reasoning_effort} onChange={(e) => setSettings({ ...settings, reasoning_effort: e.target.value })}>
                    <option value="low">Rapide</option>
                    <option value="medium">Moyen</option>
                    <option value="high">Poussé</option>
                  </select>
                </label>
              </div>
            </div>
          ) : null}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="bubble-user">{m.content}</div>
            ) : (
              <div key={m.id} className="gyna-msg">
                <GynaAvatar working={busy && m === lastAssistant} />
                <div className="gyna-body">
                  <div className="row" style={{ gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>Gyna</span>
                    {busy && m === lastAssistant ? <span className="pill pill-lavender">Au travail</span> : null}
                  </div>
                  {m.content ? <Markdown>{m.content}</Markdown> : busy && m === lastAssistant ? <p className="muted">Gyna lit le brief et prépare la mission…</p> : null}
                  <ToolLog tools={m.tool_events} />
                  {m.mission_id ? <MissionResults missionId={m.mission_id} /> : null}
                </div>
              </div>
            ),
          )}
          {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
        </div>
      </div>

      <div className="composer-wrap">
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor="composer" className="sr-only">Message à Gyna</label>
          <textarea
            id="composer"
            rows={1}
            value={input}
            placeholder={conv ? "Demandez quelque chose à Gyna" : "Par exemple : trouve 20 profils pour le prochain bootcamp, en Savoie"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button type="submit" className="btn btn-dark btn-icon" aria-label="Envoyer" disabled={busy || !input.trim()}>
            <IconSend />
          </button>
        </form>
        <p className="composer-hint">Gyna prépare, vous validez : rien n'est envoyé sans vous.</p>
      </div>
    </section>
  );
}
