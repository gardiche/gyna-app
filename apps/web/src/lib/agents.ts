import { AGENTS, type AgentName } from "@gyna/schemas";

export const AGENT_LABEL: Record<AgentName | "all", string> = {
  all: "Tous les agents",
  gyna: "Gyna (orchestration)",
  sourcing: "Sourcing",
  qualification: "Qualification",
  redaction: "Rédaction",
};

/** Groupes d'affichage des skills : partagés d'abord, puis par agent. */
export const SKILL_GROUPS = ["all", ...AGENTS] as const;
