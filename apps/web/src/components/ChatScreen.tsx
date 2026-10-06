import Link from "next/link";
import type { Session } from "@/lib/supabase/server";
import { agentStatus, listVentures } from "@/lib/data";
import { env } from "@/lib/env";
import { Chat, type ChatMessage, type ConversationInfo } from "./Chat";
import { Overview } from "./Overview";
import { IconPlus } from "./icons";

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Paris" }).format(new Date()));
  return h >= 18 || h < 5 ? "Bonsoir" : "Bonjour";
}

/** Écran principal : accueil, agents, chat au centre, vue d'ensemble à droite. */
export async function ChatScreen({
  session,
  conversation,
  messages,
}: {
  session: Session;
  conversation: ConversationInfo | null;
  messages: ChatMessage[];
}) {
  const db = session.supabase;
  const [ventures, status] = await Promise.all([listVentures(db), agentStatus(db)]);
  const focus = (conversation?.venture && ventures.find((v) => v.id === conversation.venture!.id)) || ventures[0] || null;
  const working = status.mission?.status === "running";

  const chips: Array<{ key: keyof typeof status.agents; label: string }> = [
    { key: "sourcing", label: "Sourcing" },
    { key: "qualification", label: "Qualification" },
    { key: "redaction", label: "Rédaction" },
  ];

  return (
    <>
      <div className="hero">
        <div>
          <h1>{greeting()} {session.displayName}</h1>
          <p>Gyna prospecte pour vous. Vous validez ce qui part.</p>
        </div>
        <div className="agent-row">
          <Link href="/" className="agent-new" aria-label="Nouvelle mission"><IconPlus /></Link>
          {chips.map((c) => (
            <div key={c.key} className="agent-chip">
              <strong>{c.label}{working ? <span className="live-dot" aria-label="actif" /> : null}</strong>
              <span title={status.agents[c.key] ?? undefined}>{status.agents[c.key] ?? "En attente d'une mission"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="workspace">
        <Chat
          conversation={conversation}
          initialMessages={messages}
          ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
          defaultVentureId={focus?.id ?? null}
          defaultModel={env.defaultModel()}
        />
        <Overview db={db} venture={focus} />
      </div>
    </>
  );
}
