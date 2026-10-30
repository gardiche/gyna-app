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
  SearchPlacesInput,
  ListCompaniesInput,
  RateCompaniesInput,
  FindCompanyEmailsInput,
  FindLinkedinIndustriesInput,
  FetchProfilesInput,
  TriageProspectsInput,
  FetchPostsInput,
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

  // Périmètre des missions : une mission « prospection » n'appelle que les outils de prospection.
  // Le contrôle enveloppe chaque outil enregistré ci-dessous, avant même son propre traitement.
  const registerTool = server.registerTool.bind(server) as (...args: any[]) => unknown;
  (server as any).registerTool = (name: string, def: unknown, cb: (input: any, extra: any) => Promise<any>) =>
    registerTool(name, def, async (input: any, extra: any) => {
      if (!t.isProspectionTool(name)) {
        const claims = await resolveMission(sql, input?.mission_token, jwtSecret).catch(() => null);
        const refusal = claims ? t.outOfScope(name, claims.scope) : null;
        if (refusal) return { isError: true, content: [{ type: "text" as const, text: refusal }] };
      }
      return cb(input, extra);
    });

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

  server.registerTool("list_prospects", {
    description:
      "Relit les prospects d'une venture ligne par ligne (nom, lien LinkedIn, titre, lieu, adéquation, raison du tri, chaleur, statut, date d'ajout). " +
      "Filtres facultatifs : adéquation (A, B, C, discarded = écartés, untriaged = pas encore triés), chaleur, période d'ajout (AAAA-MM-JJ). Lecture seule. " +
      "À utiliser pour une short-list, un récapitulatif de sourcing ou de tri, ou pour répondre « qui a été trouvé tel jour ».",
    inputSchema: {
      ...token, ...slug,
      fit: z.enum(["A", "B", "C", "discarded", "untriaged"]).optional(),
      heat: z.enum(["hot", "warm", "cold"]).optional(),
      added_since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Ajoutés à partir de ce jour, inclus"),
      added_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Ajoutés jusqu'à ce jour, inclus"),
      limit: z.number().int().min(1).max(t.PROSPECT_LIST_MAX).optional().describe("100 par défaut"),
    },
  }, wrap(t.listProspects));

  server.registerTool("find_prospect", {
    description: "Indique si un profil LinkedIn est déjà connu, avec ses ventures et statuts. À appeler avant de contacter qui que ce soit.",
    inputSchema: { ...token, linkedin_url: z.string() },
  }, wrap(t.findProspect));

  server.registerTool("search_linkedin_profiles", {
    description: "Sourcing en un appel : cherche des profils LinkedIn publics par intitulé de poste actuel et par lieu (Apify, sans cookies, réglages fixes), enregistre tous les profils exploitables pour la venture et déclare le coût. À utiliser en premier pour tout sourcing par titre. Aucun tri n'est fait : la Qualification juge ensuite.",
    inputSchema: SearchLinkedinProfilesInput.shape,
  }, wrap((ctx, input) => t.searchLinkedinProfiles(ctx, input)));

  server.registerTool("search_places", {
    description: "Sourcing d'entreprises autour d'un lieu (Google Maps via Apify, sans cookies, réglages fixes) : cherche des termes (« hôtel », « restaurant »…) dans un rayon autour d'un lieu, enregistre toutes les entreprises ouvertes pour la venture (nom, catégorie, adresse, téléphone, site, note, avis) et déclare le coût. Données brutes, aucun tri : le potentiel de linge se juge ensuite avec list_companies et rate_companies. Pour les ventures dont la cible est un établissement, pas une personne.",
    inputSchema: SearchPlacesInput.shape,
  }, wrap((ctx, input) => t.searchPlaces(ctx, input)));

  server.registerTool("list_companies", {
    description: "Relit les entreprises enregistrées par search_places (nom, catégorie, adresse, téléphone, site, note, avis, potentiel de linge et sa raison). Filtres facultatifs : potentiel (fort, possible, faible, ecarte, unrated = pas encore jugées), catégorie, commune, date d'ajout. Lecture seule, 300 lignes au plus.",
    inputSchema: ListCompaniesInput.shape,
  }, wrap(t.listCompanies));

  server.registerTool("rate_companies", {
    description: "Pose le potentiel de linge de chaque entreprise d'un lot (fort, possible, faible, ecarte), avec le fait qui le justifie. Jusqu'à 50 par appel. Dans le doute, ne pas écarter.",
    inputSchema: RateCompaniesInput.shape,
  }, wrap(t.rateCompanies));

  server.registerTool("find_company_emails", {
    description: "Cherche l'e-mail professionnel PUBLIÉ sur le site des entreprises (accueil, page de contact, mentions légales ; même nom de domaine que le site) et l'enregistre avec la page où il est lu. Par company_ids, ou à défaut un lot d'entreprises qui ont un site et pas d'e-mail (25 par défaut, 50 au plus). N'invente ni ne devine jamais d'adresse : sans adresse publiée, la fiche reste vide. N'écrase pas un e-mail saisi à la main. Coût nul. Ne contacte personne : l'envoi reste soumis à la validation d'un associé.",
    inputSchema: FindCompanyEmailsInput.shape,
  }, wrap((ctx, input) => t.findCompanyEmails(ctx, input)));

  server.registerTool("find_linkedin_industries", {
    description: "Trouve le nom exact des secteurs de LinkedIn (en anglais) à partir d'un mot, pour le filtre industries de search_linkedin_profiles. Exemple : « restaurant » rend « Restaurants » et ses voisins.",
    inputSchema: FindLinkedinIndustriesInput.shape,
  }, wrap(t.findLinkedinIndustries));

  server.registerTool("fetch_profiles", {
    description: "Tri, étape 1 : lit le profil complet (expériences datées, résumé) d'un lot de prospects pas encore triés et rend les faits calculés (mois comme fondateur, poste salarié en cours, années de carrière). Coût déclaré par l'outil. Ensuite, noter chaque prospect avec triage_prospects.",
    inputSchema: FetchProfilesInput.shape,
  }, wrap((ctx, input) => t.fetchProfiles(ctx, input)));

  server.registerTool("triage_prospects", {
    description: "Tri, étape 2 : note l'adéquation au persona de chaque prospect lu (A cœur de cible, B dans la cible, C à la marge, selon la grille du brief) ou l'écarte (discard), avec le fait du profil qui le justifie. Jusqu'à 50 prospects par appel.",
    inputSchema: TriageProspectsInput.shape,
  }, wrap(t.triageProspects));

  server.registerTool("fetch_posts", {
    description: "Qualification fine : lit les publications récentes (fenêtre du brief, 10 au plus par personne, sans les simples repartages) des prospects triés, A par défaut, et les rend avec leurs faits. Coût déclaré par l'outil. Ensuite add_signals pour les publications utiles et qualify_prospect pour la chaleur.",
    inputSchema: FetchPostsInput.shape,
  }, wrap((ctx, input) => t.fetchPosts(ctx, input)));

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
      "Soumet un lot de 1 à 20 pubs pour une plateforme (texte, brief visuel, sur quoi chacune s'appuie). Un carrousel (format carousel, Meta ou LinkedIn) porte ses 2 à 10 diapositives dans slides, la première étant la couverture ; chacune a son image. Le lot part dans « À valider » : un associé approuve, corrige ou refuse chaque pub. " +
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

  server.registerTool("get_brand_kit", {
    description: "Charte de marque courante d'une venture : logo (et son emplacement), palette, polices, ton (vouvoiement ou tutoiement), mots et formules interdits, formats par canal, cible, positionnement, mentions obligatoires. Ses règles sont contraignantes : à lire avant de créer des pubs ou des posts.",
    inputSchema: { ...token, ...slug },
  }, wrap(t.getBrandKit));

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
    description: "Enveloppe de pilotage des pubs Meta d'une venture (budget total, dates, coût visé, active ou en pause) et pubs approuvées à diffuser, avec leur texte complet, leur visuel (adresse, et image_hash quand l'app l'a déjà déposé dans la bibliothèque d'images du compte Meta) et leur état chez Meta. Un carrousel (format carousel) a une liste cards : une carte par diapositive, avec son texte, son titre, son visuel et son image_hash ; cards_ready dit si toutes ont un visuel. À lire avant toute action sur un compte publicitaire : may_act dit si tu as le droit d'agir.",
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
