import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Sql } from "postgres";
import {
  AGENTS,
  AddCompetitorAdsInput,
  AddSignalsInput,
  DescribeAdReferenceInput,
  GetAdFeedbackInput,
  GetCompetitorAdsInput,
  SubmitAdsInput,
  SubmitPostsInput,
  SaveWatchSummaryInput,
  UpsertCompetitorInput,
  DiscardProspectInput,
  LogActionInput,
  ProposeSkillUpdateInput,
  QualifyProspectInput,
  SaveCampaignDocInput,
  SearchLinkedinProfilesInput,
  FindLinkedinIndustriesInput,
  RecordAdLaunchInput,
  ReportCostInput,
  SubmitDraftInput,
  UpsertProspectsInput,
} from "@gyna/schemas";
import { MissionTokenError, resolveMission, type verifyMissionToken } from "./token.js";
import * as t from "./tools.js";

const token = { mission_token: z.string().describe("Jeton de mission reçu dans le message de mission, à transmettre tel quel") };
const slug = { venture_slug: z.string().describe("Identifiant de la venture, par exemple l-amorce") };

type Handler = (ctx: { sql: Sql; claims: Awaited<ReturnType<typeof verifyMissionToken>> }, input: any) => Promise<unknown>;

export function buildMcpServer(sql: Sql, jwtSecret: string): McpServer {
  const server = new McpServer({ name: "gyna", version: "0.1.0" });

  const wrap = (fn: Handler) => async (input: any) => {
    try {
      const claims = await resolveMission(sql, input.mission_token, jwtSecret);
      const result = await fn({ sql, claims }, input);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message =
        err instanceof t.ToolError || err instanceof MissionTokenError ? err.message
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
    description:
      "Charge tous les skills d'expert attribués à un agent (et ceux partagés par tous), avec leur description qui dit quand appliquer chacun. " +
      "À appeler au début de chaque tâche ; suivre chaque skill au moment indiqué par sa description.",
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

  server.registerTool("get_venture_stats", {
    description:
      "Chiffres de l'entonnoir d'une venture : objectif d'inscrits, prospects par étape (cumulés), chaleur, brouillons, " +
      "rythme des 7 et 30 derniers jours, taux de réponse et d'inscription réels, dépense sur 30 jours. Lecture seule. " +
      "À utiliser pour faire le point sur une venture ou calculer ce qu'il faut pour tenir l'objectif.",
    inputSchema: { ...token, ...slug },
  }, wrap(t.getVentureStats));

  server.registerTool("find_prospect", {
    description: "Indique si un profil LinkedIn est déjà connu, avec ses ventures et statuts. À appeler avant de contacter qui que ce soit.",
    inputSchema: { ...token, linkedin_url: z.string() },
  }, wrap(t.findProspect));

  server.registerTool("search_linkedin_profiles", {
    description: "Sourcing en un appel : cherche des profils LinkedIn publics par intitulé de poste actuel et par lieu (Apify, sans cookies, réglages fixes), enregistre tous les profils exploitables pour la venture et déclare le coût. À utiliser en premier pour tout sourcing par titre. Aucun tri n'est fait : la Qualification juge ensuite.",
    inputSchema: SearchLinkedinProfilesInput.shape,
  }, wrap((ctx, input) => t.searchLinkedinProfiles(ctx, input)));

  server.registerTool("find_linkedin_industries", {
    description: "Trouve le nom exact des secteurs de LinkedIn (en anglais) à partir d'un mot, pour le filtre industries de search_linkedin_profiles. Exemple : « restaurant » rend « Restaurants » et ses voisins.",
    inputSchema: FindLinkedinIndustriesInput.shape,
  }, wrap(t.findLinkedinIndustries));

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

  server.registerTool("propose_skill_update", {
    description:
      "Propose une nouvelle version d'un skill, ou un nouveau skill pour un agent, quand un associé demande de changer la façon de travailler d'un agent. " +
      "Rien ne change avant l'accord d'un associé dans « À valider ». Lis d'abord le skill actuel avec get_agent_skills et envoie le contenu complet.",
    inputSchema: ProposeSkillUpdateInput.shape,
  }, wrap(t.proposeSkillUpdate));

  server.registerTool("list_competitors", {
    description: "Liste les concurrents connus d'une venture : nom, type, liens, positionnement, date de leur fiche et nombre de pubs observées. À lire avant toute veille, pour ne pas refaire ce qui existe.",
    inputSchema: { ...token, ...slug },
  }, wrap(t.listCompetitors));

  server.registerTool("upsert_competitor", {
    description: "Crée un concurrent d'une venture ou complète sa fiche (liens, positionnement en une phrase, fiche markdown). Un champ absent ne remplace pas une valeur connue.",
    inputSchema: UpsertCompetitorInput.shape,
  }, wrap(t.upsertCompetitor));

  server.registerTool("add_competitor_ads", {
    description: "Enregistre jusqu'à 30 pubs d'un concurrent lues dans une bibliothèque publicitaire publique, avec leur texte tel quel et ton analyse (angle, accroche, promesse, public). Une pub déjà vue (même lien) est mise à jour.",
    inputSchema: AddCompetitorAdsInput.shape,
  }, wrap(t.addCompetitorAds));

  server.registerTool("get_competitor_ads", {
    description: "Lit les pubs observées d'une venture, filtrables par concurrent, plateforme ou pubs actives, les plus longtemps diffusées d'abord. Lecture seule.",
    inputSchema: GetCompetitorAdsInput.shape,
  }, wrap(t.getCompetitorAds));

  server.registerTool("save_watch_summary", {
    description: "Enregistre la synthèse de la veille d'une venture (nouvelle version, l'ancienne reste consultable). Contenu complet en markdown.",
    inputSchema: SaveWatchSummaryInput.shape,
  }, wrap(t.saveWatchSummary));

  server.registerTool("get_watch_summary", {
    description: "Lit la dernière synthèse de veille d'une venture : ce que les concurrents mettent en avant, ce qui semble marcher, ce que personne ne dit. Lecture seule.",
    inputSchema: { ...token, ...slug },
  }, wrap(t.getWatchSummary));

  server.registerTool("submit_ads", {
    description:
      "Soumet un lot de 1 à 20 pubs pour une plateforme (texte, brief visuel, sur quoi chacune s'appuie). Le lot part dans « À valider » : un associé approuve, corrige ou refuse chaque pub. " +
      "Rien n'est publié. Un texte au-delà de la limite de la plateforme fait refuser le lot, avec le détail à corriger.",
    inputSchema: SubmitAdsInput.shape,
  }, wrap(t.submitAds));

  server.registerTool("submit_posts", {
    description:
      "Soumet un lot de 1 à 20 posts pour un compte LinkedIn ou Instagram (texte, diapositives d'un carrousel, brief visuel, date prévue). " +
      "Le lot part dans « À valider » : un associé approuve, corrige ou refuse chaque post, puis le publie lui-même. Rien n'est publié par les agents.",
    inputSchema: SubmitPostsInput.shape,
  }, wrap(t.submitPosts));

  server.registerTool("get_ad_feedback", {
    description: "Retours des associés sur les pubs et les posts d'une venture (kind pour n'avoir que l'un ou l'autre) : refus avec leur raison, corrections (proposé et final), dernières pubs approuvées. À lire avant de créer des pubs.",
    inputSchema: GetAdFeedbackInput.shape,
  }, wrap(t.getAdFeedback));

  server.registerTool("get_ad_references", {
    description: "Bibliothèque de visuels d'une venture : logo, photos réelles, charte et inspirations déposées par les associés, avec leur adresse, leur note et la description déjà faite. À lire avant d'écrire les briefs visuels.",
    inputSchema: { ...token, ...slug },
  }, wrap(t.getAdReferences));

  server.registerTool("describe_ad_reference", {
    description: "Enregistre la description d'une image de la bibliothèque après l'avoir regardée avec l'outil de vision. Elle sert ensuite à générer les visuels des pubs.",
    inputSchema: DescribeAdReferenceInput.shape,
  }, wrap(t.describeAdReference));

  server.registerTool("get_campaign_docs", {
    description: "Lit la dernière version du plan de mesure, du plan de campagne et du bilan d'une venture. À lire avant toute tâche sur les campagnes.",
    inputSchema: { ...token, ...slug },
  }, wrap(t.getCampaignDocs));

  server.registerTool("save_campaign_doc", {
    description: "Enregistre une nouvelle version d'un document de campagne (mesure, plan ou bilan), complet, en markdown. L'ancienne version reste consultable. Rien n'est dépensé ni modifié sur les comptes publicitaires.",
    inputSchema: SaveCampaignDocInput.shape,
  }, wrap(t.saveCampaignDoc));

  server.registerTool("get_approved_ads", {
    description: "Liste les pubs approuvées par les associés pour une venture, par plateforme, avec leur référence courte (pour les liens balisés) et si un visuel existe. Ce sont les seules pubs à mettre en campagne.",
    inputSchema: { ...token, ...slug },
  }, wrap(t.getApprovedAds));

  server.registerTool("get_ad_pilot", {
    description: "Enveloppe de pilotage des pubs Meta d'une venture (budget total, dates, coût visé, active ou en pause) et pubs approuvées à diffuser, avec leur texte complet, leur visuel (adresse, et image_hash quand l'app l'a déjà déposé dans la bibliothèque d'images du compte Meta) et leur état chez Meta. À lire avant toute action sur un compte publicitaire : may_act dit si tu as le droit d'agir.",
    inputSchema: { ...token, ...slug },
  }, wrap(t.getAdPilot));

  server.registerTool("record_ad_launch", {
    description: "Déclare ce qu'une pub approuvée est devenue chez Meta (créée en pause, en diffusion, arrêtée) avec son identifiant Meta. À appeler après chaque création, activation, mise en pause ou arrêt. Refuse une pub non approuvée, et refuse « active » quand l'enveloppe est en pause ou hors dates.",
    inputSchema: RecordAdLaunchInput.shape,
  }, wrap(t.recordAdLaunch));

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
