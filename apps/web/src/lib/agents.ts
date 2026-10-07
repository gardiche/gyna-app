import { AGENTS, type AgentName } from "@gyna/schemas";
import gynaMd from "../../../../infra/hermes/agents/gyna.md";
import sourcingMd from "../../../../infra/hermes/agents/sourcing.md";
import qualificationMd from "../../../../infra/hermes/agents/qualification.md";
import redactionMd from "../../../../infra/hermes/agents/redaction.md";

export const AGENT_LABEL: Record<AgentName | "all", string> = {
  all: "Tous les agents",
  gyna: "Gyna (orchestration)",
  sourcing: "Sourcing",
  qualification: "Qualification",
  redaction: "Rédaction",
};

export interface AgentProfile {
  key: AgentName;
  name: string;
  /** Badge court affiché à côté du nom. */
  tag: string;
  /** Une phrase : ce que l'agent apporte. */
  summary: string;
  tools: Array<{ name: string; detail: string }>;
  /** Fiche de l'agent, telle que Hermes la reçoit (infra/hermes/agents). */
  sheet: string;
}

// La fiche de Gyna embarque celles des sous-agents ; on n'en garde que sa partie.
const gynaSheet = gynaMd.split(/\n---\n/)[0]!.trim();

export const AGENT_PROFILES: Record<AgentName, AgentProfile> = {
  gyna: {
    key: "gyna",
    name: "Gyna",
    tag: "Orchestration",
    summary: "Reçoit les missions des associés, les découpe et les confie aux sous-agents, puis rend compte.",
    tools: [
      { name: "delegate_task", detail: "Lance un sous-agent avec sa fiche et un objectif chiffré" },
      { name: "get_brief", detail: "Lit le brief GTM de la venture" },
      { name: "get_agent_skills", detail: "Charge ses skills" },
      { name: "report_cost", detail: "Déclare les dépenses et s'arrête au plafond" },
      { name: "propose_skill_update", detail: "Propose un skill nouveau ou modifié, appliqué après validation" },
      { name: "log_action", detail: "Note une décision au journal" },
      { name: "Recherche web", detail: "Recherche et lecture de pages publiques" },
    ],
    sheet: gynaSheet,
  },
  sourcing: {
    key: "sourcing",
    name: "Sourcing",
    tag: "Recherche de profils",
    summary: "Trouve des profils LinkedIn publics qui correspondent au persona de la venture.",
    tools: [
      { name: "Apify", detail: "Recherche LinkedIn sans cookies de compte personnel" },
      { name: "find_prospect", detail: "Vérifie si un profil est déjà connu" },
      { name: "upsert_prospects", detail: "Enregistre les profils, par lots de 50 au plus" },
      { name: "report_cost", detail: "Déclare le coût d'Apify" },
    ],
    sheet: sourcingMd.trim(),
  },
  qualification: {
    key: "qualification",
    name: "Qualification",
    tag: "Chaleur des prospects",
    summary: "Lit les publications récentes des prospects et juge leur chaleur : froid, tiède ou chaud.",
    tools: [
      { name: "Apify", detail: "Récupère les publications récentes" },
      { name: "Recherche web", detail: "Signaux publics hors LinkedIn" },
      { name: "add_signals", detail: "Enregistre les signaux datés et sourcés" },
      { name: "qualify_prospect", detail: "Attribue la chaleur ; « chaud » exige un signal récent" },
      { name: "discard_prospect", detail: "Écarte un profil hors persona" },
      { name: "get_feedback", detail: "Lit les retours des associés" },
    ],
    sheet: qualificationMd.trim(),
  },
  redaction: {
    key: "redaction",
    name: "Rédaction",
    tag: "Premiers messages",
    summary: "Écrit une première approche personnalisée pour chaque prospect qualifié, à valider par un associé.",
    tools: [
      { name: "get_brief", detail: "Offre, promesse, ton et interdits" },
      { name: "get_feedback", detail: "Corrections et refus des associés" },
      { name: "submit_draft", detail: "Soumet le brouillon à validation, rien n'est envoyé" },
    ],
    sheet: redactionMd.trim(),
  },
};

export const TEAM = AGENTS.map((a) => AGENT_PROFILES[a]);
