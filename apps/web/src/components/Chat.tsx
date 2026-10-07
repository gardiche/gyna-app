"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconLayers, IconSend, IconSliders, IconStop, Spark } from "./icons";
import { MissionResults } from "./MissionResults";
import { Markdown } from "./Markdown";

export interface ToolEvent { id: string; name: string; summary?: string; ok?: boolean; done: boolean }
export interface ChatMessage { id: string; role: "user" | "assistant"; content: string; mission_id: string | null; tool_events: ToolEvent[] }
export interface ConversationInfo { id: string; title: string; model: string; reasoning_effort: string | null; venture: { id: string; name: string } | null }
export interface Suggestion { title: string; detail: string; prompt: string }
interface VentureOption { id: string; name: string }
interface ModelOption { id: string; provider: string | null }

const REASONING: Record<string, string> = { low: "Rapide", medium: "Moyen", high: "Poussé" };

/** Ce que Gyna ou un sous-agent fait en ce moment, d'après le dernier outil appelé. */
const ACTIVITY: Array<[RegExp, string]> = [
  [/delegate_task/, "Gyna confie une tâche à un sous-agent"],
  [/upsert_prospects/, "Sourcing : enregistrement des profils"],
  [/find_prospect/, "Sourcing : vérification des doublons"],
  [/add_signals/, "Qualification : enregistrement des signaux"],
  [/qualify_prospect/, "Qualification d'un prospect"],
  [/discard_prospect/, "Qualification : profil écarté"],
  [/submit_draft/, "Rédaction : brouillon soumis"],
  [/get_feedback/, "Lecture des retours des associés"],
  [/get_brief/, "Lecture du brief"],
  [/get_agent_skills|get_skill/, "Lecture des skills"],
  [/web_search|web_extract/, "Recherche sur le web"],
  [/apify|actor/i, "Recherche LinkedIn avec Apify"],
  [/report_cost/, "Mise à jour du budget"],
];

function activityLabel(events: ToolEvent[]): string {
  const current = [...events].reverse().find((e) => !e.done) ?? events[events.length - 1];
  if (!current) return "Gyna réfléchit…";
  return ACTIVITY.find(([re]) => re.test(current.name))?.[1] ?? "Gyna travaille…";
}

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

function GynaAvatar({ working }: { working: boolean }) {
  return (
    <div className={`gyna-avatar${working ? " working" : ""}`} aria-hidden="true">
      <div className="aura" />
      <div className="core"><Spark size={18} /></div>
    </div>
  );
}

export function Chat({
  conversation,
  initialMessages,
  ventures,
  defaultVentureId,
  defaultModel,
  budgetEur,
  greeting,
  suggestions,
}: {
  conversation: ConversationInfo | null;
  initialMessages: ChatMessage[];
  ventures: VentureOption[];
  defaultVentureId: string | null;
  defaultModel: string;
  budgetEur: number;
  greeting: string;
  suggestions: Suggestion[];
}) {
  const router = useRouter();
  const [conv, setConv] = useState(conversation);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([{ id: defaultModel, provider: null }]);
  const [settings, setSettings] = useState({ venture_id: defaultVentureId ?? "", model: defaultModel, reasoning_effort: "medium" });
  const [menuOpen, setMenuOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const menu = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // La zone de saisie grandit avec le texte, jusqu'à une hauteur maximale.
  useEffect(() => {
    const el = composer.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

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
    setMenuOpen(false);
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

  function pick(s: Suggestion) {
    setInput(s.prompt);
    composer.current?.focus();
  }

  const lastAssistant = messages.length ? messages[messages.length - 1] : null;
  const ventureName = conv ? conv.venture?.name ?? null : ventures.find((v) => v.id === settings.venture_id)?.name ?? null;
  const modelName = (conv?.model ?? settings.model).replace(/^.*\//, "");
  const reasoning = conv?.reasoning_effort ?? settings.reasoning_effort;
  const showSuggestions = !conv && messages.length === 0 && settings.venture_id === (defaultVentureId ?? "") && suggestions.length > 0;

  return (
    <section className="chat" aria-label="Conversation avec Gyna">
      <div className="chat-head">
        <div className="row" style={{ minWidth: 0 }}>
          <h1 className="chat-title">{conv?.title && conv.title !== "Nouvelle conversation" ? conv.title : "Nouvelle mission"}</h1>
          {ventureName ? <span className="pill pill-lime">{ventureName}</span> : null}
        </div>
        <div className="row">
          {busy ? (
            <button type="button" className="btn btn-dark btn-sm" onClick={() => void stop()}><IconStop />Arrêter</button>
          ) : null}
          <div className="menu-wrap" ref={menu}>
            <button type="button" className="icon-btn" aria-label="Réglages de la conversation" aria-expanded={menuOpen} aria-haspopup="true"
              onClick={() => setMenuOpen((o) => !o)}>
              <IconSliders />
            </button>
            {menuOpen ? (
              <div className="menu-panel" role="dialog" aria-label="Réglages de la conversation">
                {conv ? (
                  <>
                    <div className="kv"><span>Modèle</span><strong>{modelName}</strong></div>
                    <div className="kv"><span>Raisonnement</span><strong>{REASONING[reasoning ?? ""] ?? reasoning ?? "Par défaut"}</strong></div>
                    <p className="muted">Fixés pour toute la conversation. Ouvrez une nouvelle mission pour en changer.</p>
                  </>
                ) : (
                  <>
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
                    <p className="muted">Fixés pour toute la conversation dès le premier message.</p>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="chat-scroll" ref={scroller}>
        {messages.length === 0 && !conv ? (
          <div className="chat-empty">
            <div className="gyna-avatar" aria-hidden="true"><div className="core core-lg"><Spark size={26} /></div></div>
            <h2>{greeting}, que cherche-t-on ?</h2>
            <p className="muted">Choisissez une mission type ou écrivez la vôtre.</p>
            {showSuggestions ? (
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button key={s.title} type="button" onClick={() => pick(s)}>
                    <strong>{s.title}</strong>
                    <span>{s.detail}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="thread">
            {messages.map((m) => {
              const live = busy && m === lastAssistant;
              return m.role === "user" ? (
                <div key={m.id} className="bubble-user">{m.content}</div>
              ) : (
                <div key={m.id} className="gyna-msg">
                  <GynaAvatar working={live} />
                  <div className="gyna-body">
                    <div className="row" style={{ gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>Gyna</span>
                      {live ? <span className="pill pill-lavender">Au travail</span> : null}
                    </div>
                    {m.content ? <Markdown>{m.content}</Markdown> : null}
                    {live ? <p className="activity"><span className="spinner" aria-hidden="true" />{activityLabel(m.tool_events)}</p> : null}
                    {m.mission_id ? <MissionResults missionId={m.mission_id} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {error ? <p className="notice notice-error thread" role="alert">{error}</p> : null}
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
            ref={composer}
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
          <div className="composer-tools">
            {conv ? (
              ventureName ? <span className="chip"><IconLayers size={14} />{ventureName}</span> : null
            ) : (
              <label className="chip chip-select">
                <IconLayers size={14} />
                <span className="sr-only">Venture</span>
                <select value={settings.venture_id} onChange={(e) => setSettings({ ...settings, venture_id: e.target.value })}>
                  <option value="">Sans venture</option>
                  {ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
            )}
            <span className="chip chip-quiet" title="Plafond de dépense par message envoyé à Gyna">Budget {eur(budgetEur)}</span>
            <button type="submit" className="send" aria-label="Envoyer" disabled={busy || !input.trim()}>
              <IconSend />
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
