import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Sql } from "postgres";
import {
  AGENTS,
  AddSignalsInput,
  DiscardProspectInput,
  LogActionInput,
  QualifyProspectInput,
  ReportCostInput,
  SubmitDraftInput,
  UpsertProspectsInput,
} from "@gyna/schemas";
import { verifyMissionToken } from "./token.js";
import * as t from "./tools.js";

const token = { mission_token: z.string().describe("Jeton de mission reçu dans le message de mission, à transmettre tel quel") };
const slug = { venture_slug: z.string().describe("Identifiant de la venture, par exemple l-amorce") };

type Handler = (ctx: { sql: Sql; claims: Awaited<ReturnType<typeof verifyMissionToken>> }, input: any) => Promise<unknown>;

export function buildMcpServer(sql: Sql, jwtSecret: string): McpServer {
  const server = new McpServer({ name: "gyna", version: "0.1.0" });

  const wrap = (fn: Handler) => async (input: any) => {
    try {
      const claims = await verifyMissionToken(input.mission_token, jwtSecret);
      const result = await fn({ sql, claims }, input);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message =
        err instanceof t.ToolError ? err.message
        : (err as { code?: string }).code?.startsWith("ERR_JW") ? "Jeton de mission invalide ou expiré."
        : `Erreur interne : ${(err as Error).message}`;
      return { isError: true, content: [{ type: "text" as const, text: message }] };
    }
  };

  server.registerTool("get_brief", {
    description: "Lit le brief GTM courant d'une venture (persona, offre, promesse, objections, ton, signaux chauds, interdits) et ses segments.",
    inputSchema: { ...token, ...slug },
  }, wrap(t.getBrief));

  server.registerTool("get_agent_skills", {
    description: "Charge tous les skills d'expert attribués à un agent (et ceux partagés par tous). À appeler au début de chaque tâche, puis appliquer chacun.",
    inputSchema: { ...token, agent: z.enum(AGENTS) },
  }, wrap(t.getAgentSkills));

  server.registerTool("get_skill", {
    description: "Lit la version courante d'un skill d'expert rédigé par Alpact. À lire avant chaque tâche.",
    inputSchema: { ...token, slug: z.string() },
  }, wrap(t.getSkill));

  server.registerTool("get_feedback", {
    description: "Derniers retours des associés sur les brouillons : refus avec leur raison, corrections (texte proposé et texte final). À lire avant de rédiger ou de qualifier, pour ne pas refaire les mêmes erreurs.",
    inputSchema: {
      ...token,
      venture_slug: z.string().optional().describe("Limiter à une venture, par exemple l-amorce"),
      limit: z.number().int().min(1).max(30).optional().describe("Nombre de retours, 10 par défaut"),
    },
  }, wrap(t.getFeedback));

  server.registerTool("find_prospect", {
    description: "Indique si un profil LinkedIn est déjà connu, avec ses ventures et statuts. À appeler avant de contacter qui que ce soit.",
    inputSchema: { ...token, linkedin_url: z.string() },
  }, wrap(t.findProspect));

  server.registerTool("upsert_prospects", {
    description: "Enregistre jusqu'à 50 profils trouvés pour une venture. Dédoublonne par URL LinkedIn et signale les contacts antérieurs.",
    inputSchema: UpsertProspectsInput.shape,
  }, wrap(t.upsertProspects));

  server.registerTool("add_signals", {
    description: "Ajoute jusqu'à 20 signaux publics (post, commentaire, événement) avec URL, extrait court et date. Les signaux hors fenêtre du brief sont rejetés.",
    inputSchema: AddSignalsInput.shape,
  }, wrap(t.addSignals));

  server.registerTool("qualify_prospect", {
    description: "Attribue la chaleur (cold, warm, hot) avec une justification lisible. « hot » exige au moins un signal récent cité dans signal_ids.",
    inputSchema: QualifyProspectInput.shape,
  }, wrap(t.qualifyProspect));

  server.registerTool("discard_prospect", {
    description: "Écarte un prospect hors persona, avec la raison.",
    inputSchema: DiscardProspectInput.shape,
  }, wrap(t.discardProspect));

  server.registerTool("submit_draft", {
    description: "Soumet un brouillon de première approche pour un prospect qualifié. Il part en validation ; rien n'est envoyé.",
    inputSchema: SubmitDraftInput.shape,
  }, wrap(t.submitDraft));

  server.registerTool("report_cost", {
    description: "Déclare un coût (Apify ou modèle) en euros. Renvoie budget_exceeded : si vrai, s'arrêter et demander l'accord dans le chat.",
    inputSchema: ReportCostInput.shape,
  }, wrap(t.reportCost));

  server.registerTool("log_action", {
    description: "Ajoute une ligne au journal de la mission.",
    inputSchema: LogActionInput.shape,
  }, wrap(t.logAction));

  return server;
}
