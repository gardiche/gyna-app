"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconLayers, IconSend, IconSliders, IconStop } from "./icons";
import { AgentAvatar } from "./AgentAvatar";
import { MissionResults } from "./MissionResults";
import { Markdown } from "./Markdown";
import { supabaseBrowser } from "@/lib/supabase/browser";

export interface ToolEvent { id: string; name: string; summary?: string; ok?: boolean; done: boolean }
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  mission_id: string | null;
  tool_events: ToolEvent[];
  /** Message affiché avant son enregistrement en base (envoi ou flux en cours). */
  local?: boolean;
}
/** Mission de la conversation dont des sous-agents travaillent encore, après la réponse de Gyna. */
export interface LiveMission { id: string; activity: string | null }
export interface ConversationInfo { id: string; title: string; model: string; reasoning_effort: string | null; venture: { id: string; name: string } | null }
export interface Suggestion { title: string; detail: string; prompt: string }
interface VentureOption { id: string; name: string }
interface ModelOption { id: string; provider: string | null }

const REASONING: Record<string, string> = { low: "Rapide", medium: "Moyen", high: "Poussé" };

/** Ce que Gyna ou un sous-agent fait en ce moment, d'après le dernier outil appelé. */
const ACTIVITY: Array<[RegExp, string]> = [
  [/^subagent.sourcing/, "La Sourcing cherche des profils"],
  [/^subagent.qualification/, "La Qualification juge la chaleur des prospects"],
  [/^subagent.redaction/, "La Rédaction écrit les brouillons"],
  [/^subagent./, "Un sous-agent travaille"],
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


export function Chat({
  conversation,
  initialMessages,
  ventures,
  defaultVentureId,
  defaultModel,
  budgetEur,
  greeting,
  suggestions,
  initialPrompt,
  liveMission,
}: {
  conversation: ConversationInfo | null;
  initialMessages: ChatMessage[];
  ventures: VentureOption[];
  defaultVentureId: string | null;
  defaultModel: string;
  budgetEur: number;
  greeting: string;
  suggestions: Suggestion[];
  initialPrompt?: string;
  liveMission?: LiveMission | null;
}) {
  const router = useRouter();
  const [conv, setConv] = useState(conversation);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState(initialPrompt ?? "");
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

  // Messages enregistrés en base, en direct : la réponse du premier tour remplace le texte reçu en flux,
  // et les comptes rendus envoyés plus tard par Gyna (sous-agents en arrière-plan) s'ajoutent au fil.
  const convId = conv?.id ?? null;
  useEffect(() => {
    if (!convId) return;
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`messages-${convId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` }, (payload) => {
        const row = payload.new as { id: string; role: "user" | "assistant"; content: string; mission_id: string | null; tool_events: ToolEvent[] | null };
        const incoming: ChatMessage = {
          id: row.id,
          role: row.role,
          content: row.content,
          mission_id: row.mission_id,
          tool_events: (row.tool_events ?? []).map((t) => ({ ...t, done: true })),
        };
        setMessages((list) => {
          if (list.some((m) => m.id === row.id)) return list;
          const isLocal = (m: ChatMessage) => m.local || m.id.startsWith("pending-");
          const i =
            row.role === "user"
              ? list.findIndex((m) => isLocal(m) && m.role === "user" && m.content.trim() === row.content.trim())
              : list.findIndex((m) => isLocal(m) && m.role === "assistant" && m.mission_id === row.mission_id);
          if (i < 0) return [...list, incoming];
          const copy = list.slice();
          // Le flux en cours garde son texte et ses outils tant que la réponse en base est vide.
          copy[i] = { ...incoming, content: row.content || copy[i]!.content, tool_events: incoming.tool_events.length ? incoming.tool_events : copy[i]!.tool_events };
          return copy;
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [convId]);

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
      if (i >= 0 && copy[i]!.role === "assistant" && copy[i]!.local) copy[i] = fn(copy[i]!);
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
      { id: crypto.randomUUID(), role: "user", content: text, mission_id: null, tool_events: [], local: true },
      { id: crypto.randomUUID(), role: "assistant", content: "", mission_id: null, tool_events: [], local: true },
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
            setMessages((l) => l.map((m, i) => (i >= l.length - 2 && m.local ? { ...m, mission_id: ev.mission_id } : m)));
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
  // Après la réponse de Gyna, ses sous-agents peuvent encore travailler : on l'indique sous son dernier message.
  const waiting = !busy && !!liveMission;
  // Résultats d'une mission sous son dernier message seulement (réponse courte, puis compte rendu).
  const lastOfMission = new Map<string, string>();
  for (const m of messages) if (m.role === "assistant" && m.mission_id) lastOfMission.set(m.mission_id, m.id);
  const assistants = messages.filter((m) => m.role === "assistant");
  const waitingOn = waiting
    ? [...assistants].reverse().find((m) => m.mission_id === liveMission!.id) ?? assistants[assistants.length - 1] ?? null
    : null;
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
          {busy || waiting ? (
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
            <AgentAvatar agent="gyna" size={64} />
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
              const live = (busy && m === lastAssistant) || m === waitingOn;
              return m.role === "user" ? (
                <div key={m.id} className="bubble-user">{m.content}</div>
              ) : (
                <div key={m.id} className="gyna-msg">
                  <AgentAvatar agent="gyna" size={40} working={live} />
                  <div className="gyna-body">
                    <div className="row" style={{ gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>Gyna</span>
                      {live ? <span className="pill pill-lavender">Au travail</span> : null}
                    </div>
                    {m.content ? <Markdown>{m.content}</Markdown> : null}
                    {live ? (
                      <p className="activity">
                        <span className="spinner" aria-hidden="true" />
                        {busy ? activityLabel(m.tool_events) : liveMission?.activity ?? "Les sous-agents travaillent…"}
                      </p>
                    ) : null}
                    {m.mission_id && lastOfMission.get(m.mission_id) === m.id ? <MissionResults key={m.mission_id} missionId={m.mission_id} /> : null}
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
            placeholder={
              waiting
                ? "Gyna attend le retour de ses sous-agents…"
                : conv
                  ? "Demandez quelque chose à Gyna"
                  : "Par exemple : trouve 50 profils pour la prochaine promo, tous segments"
            }
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
            <button type="submit" className="send" aria-label="Envoyer" disabled={busy || waiting || !input.trim()}>
              <IconSend />
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
