import type { BridgeEvent } from "@gyna/schemas";
import type { HermesEvent } from "./hermes.js";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

/**
 * Traduit un événement Hermes en événement pour l'app.
 * Seuls le texte et l'activité des outils passent ; tout le reste est ignoré.
 */
export function mapEvent(ev: HermesEvent, fallbackId: () => string): BridgeEvent | null {
  const p = ev.payload ?? {};
  switch (ev.type) {
    case "message.start":
      return { type: "start" };
    case "message.delta": {
      const text = str(p.text);
      return text ? { type: "delta", text } : null;
    }
    case "message.complete":
      return { type: "complete", text: typeof p.text === "string" ? p.text : "", status: str(p.status) ?? "complete" };
    case "tool.start":
    case "tool.complete": {
      const name = str(p.name) ?? str(p.tool) ?? str(p.tool_name) ?? "outil";
      const id = str(p.id) ?? str(p.tool_call_id) ?? str(p.call_id) ?? fallbackId();
      const summary = str(p.summary) ?? str(p.title) ?? str(p.description);
      if (ev.type === "tool.start") return { type: "tool_start", id, name, summary };
      const ok = !p.error && p.status !== "error" && p.ok !== false;
      return { type: "tool_complete", id, name, summary, ok };
    }
    default:
      return null;
  }
}

/** Message de mission envoyé à Gyna : contexte machine en tête, puis la demande de l'associé. */
export function composeMissionPrompt(input: {
  text: string;
  missionToken: string;
  ventureSlug?: string | null;
  budgetRemainingEur?: number;
}): string {
  const lines = [
    "[Mission Gyna]",
    `venture: ${input.ventureSlug ?? "aucune"}`,
    `mission_token: ${input.missionToken}`,
  ];
  if (typeof input.budgetRemainingEur === "number") lines.push(`budget_restant_eur: ${input.budgetRemainingEur.toFixed(2)}`);
  lines.push("Transmets mission_token tel quel à chaque appel d'outil Gyna.", "---", input.text);
  return lines.join("\n");
}
