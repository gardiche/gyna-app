import type { Session } from "@/lib/supabase/server";
import { hotWithoutDraft, latestMission, listConversations, listVentures, teamStatus, ventureFunnel } from "@/lib/data";
import { TEAM } from "@/lib/agents";
import { env } from "@/lib/env";
import { Chat, type ChatMessage, type ConversationInfo, type Suggestion } from "./Chat";
import { ConversationList } from "./ConversationList";
import { Overview } from "./Overview";

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Paris" }).format(new Date()));
  return h >= 18 || h < 5 ? "Bonsoir" : "Bonjour";
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Écran principal : conversations à gauche, chat au centre, vue d'ensemble à droite. */
export async function ChatScreen({
  session,
  conversation,
  messages,
  initialPrompt,
}: {
  session: Session;
  conversation: ConversationInfo | null;
  messages: ChatMessage[];
  initialPrompt?: string;
}) {
  const db = session.supabase;
  const [ventures, history, team, mission, { data: org }] = await Promise.all([
    listVentures(db),
    listConversations(db),
    teamStatus(db),
    latestMission(db, conversation?.id ?? null),
    db.from("organizations").select("default_mission_budget_eur").eq("id", session.orgId).maybeSingle(),
  ]);
  const focus = (conversation?.venture && ventures.find((v) => v.id === conversation.venture!.id)) || ventures[0] || null;

  // Missions types de l'accueil, avec les chiffres réels de la venture.
  let suggestions: Suggestion[] = [];
  if (!conversation && focus) {
    const [funnel, hot] = await Promise.all([ventureFunnel(db, focus.id), hotWithoutDraft(db, focus.id)]);
    const enrolled = funnel.byStatus.enrolled;
    suggestions = [
      {
        title: "Trouver de nouveaux profils",
        detail: `20 profils pour ${focus.name}`,
        prompt: `Trouve 20 nouveaux profils pour ${focus.name}, qualifie-les et prépare un brouillon pour les chauds.`,
      },
      {
        title: "Qualifier les prospects en attente",
        detail: plural(funnel.byStatus.to_review, "prospect à examiner", "prospects à examiner"),
        prompt: `Qualifie les prospects à examiner de ${focus.name}.`,
      },
      {
        title: "Rédiger pour les chauds",
        detail: plural(hot, "chaud sans brouillon", "chauds sans brouillon"),
        prompt: `Prépare un brouillon pour chaque prospect chaud de ${focus.name} qui n'en a pas encore.`,
      },
      {
        title: "Faire le point",
        detail: focus.enrollment_goal ? `${plural(enrolled, "inscrit", "inscrits")} sur ${focus.enrollment_goal}` : plural(enrolled, "inscrit", "inscrits"),
        prompt: `Fais le point sur ${focus.name} : où en est-on par rapport à l'objectif, et que proposes-tu pour la suite ?`,
      },
    ];
  }

  return (
    <div className="chat-layout">
      <ConversationList
        items={history}
        currentId={conversation?.id ?? null}
        team={TEAM.map((a) => ({ key: a.key, name: a.name, tag: a.tag, ...team[a.key] }))}
      />
      <Chat
        conversation={conversation}
        initialMessages={messages}
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        defaultVentureId={focus?.id ?? null}
        defaultModel={env.defaultModel()}
        budgetEur={Number(org?.default_mission_budget_eur ?? 5)}
        greeting={`${greeting()} ${session.displayName}`}
        suggestions={suggestions}
        initialPrompt={initialPrompt}
      />
      <Overview db={db} venture={focus} mission={mission} budgetEur={Number(org?.default_mission_budget_eur ?? 5)} />
    </div>
  );
}
