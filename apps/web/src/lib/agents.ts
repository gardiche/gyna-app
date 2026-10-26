import { AGENTS, type AgentName } from "@gyna/schemas";
import gynaMd from "../../../../infra/hermes/agents/gyna.md";
import sourcingMd from "../../../../infra/hermes/agents/sourcing.md";
import qualificationMd from "../../../../infra/hermes/agents/qualification.md";
import redactionMd from "../../../../infra/hermes/agents/redaction.md";
import veilleMd from "../../../../infra/hermes/agents/veille.md";
import adsMd from "../../../../infra/hermes/agents/ads.md";
import campagnesMd from "../../../../infra/hermes/agents/campagnes.md";

export const AGENT_LABEL: Record<AgentName | "all", string> = {
  all: "Tous les agents",
  gyna: "Gyna (orchestration)",
  sourcing: "Sourcing",
  qualification: "Qualification",
  redaction: "Rédaction",
  veille: "Veille",
  ads: "Ads",
  campagnes: "Campagnes",
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
      { name: "get_venture_stats", detail: "Lit l'entonnoir d'une venture pour faire le point sur l'objectif" },
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
  veille: {
    key: "veille",
    name: "Veille",
    tag: "Concurrents et pubs",
    summary: "Analyse les concurrents d'une venture et leurs publicités, pour comprendre ce qu'ils mettent en avant.",
    tools: [
      { name: "Apify", detail: "Bibliothèques publicitaires de Meta, LinkedIn et Google, sans cookies" },
      { name: "Recherche web", detail: "Sites et pages publics des concurrents" },
      { name: "Vision", detail: "Lit les visuels des pubs : image, texte incrusté, mise en scène" },
      { name: "list_competitors", detail: "Concurrents déjà connus et date de leur fiche" },
      { name: "upsert_competitor", detail: "Enregistre un concurrent et sa fiche" },
      { name: "add_competitor_ads", detail: "Enregistre les pubs observées et leur analyse" },
      { name: "save_watch_summary", detail: "Enregistre la synthèse de la veille" },
    ],
    sheet: veilleMd.trim(),
  },
  ads: {
    key: "ads",
    name: "Ads",
    tag: "Pubs et posts",
    summary: "Crée des publicités et des posts LinkedIn et Instagram à partir du brief, de la veille et de votre matière : texte, accroche et brief du visuel, à valider par un associé.",
    tools: [
      { name: "get_brief", detail: "Offre, promesse, persona, ton et interdits" },
      { name: "get_watch_summary", detail: "Synthèse de la veille concurrentielle" },
      { name: "get_competitor_ads", detail: "Pubs des concurrents, les plus durables d'abord" },
      { name: "get_brand_kit", detail: "Charte de marque : logo, palette, ton, interdits, formats, mentions" },
      { name: "get_ad_references", detail: "Logo, photos réelles et inspirations déposés par les associés" },
      { name: "Vision", detail: "Regarde les images de la bibliothèque avant d'écrire les briefs" },
      { name: "get_ad_feedback", detail: "Pubs refusées, corrigées et approuvées par les associés" },
      { name: "submit_ads", detail: "Soumet un lot de pubs à validation, rien n'est publié" },
      { name: "submit_posts", detail: "Soumet un lot de posts LinkedIn ou Instagram à validation" },
    ],
    sheet: adsMd.trim(),
  },
  campagnes: {
    key: "campagnes",
    name: "Campagnes",
    tag: "Pilotage des pubs",
    summary: "Prépare la mesure et la structure des campagnes, lit les résultats et propose où mettre le budget. Un associé décide et applique.",
    tools: [
      { name: "get_brief", detail: "Offre, prix et objectif de la venture" },
      { name: "get_approved_ads", detail: "Pubs validées par les associés, les seules à diffuser" },
      { name: "get_campaign_docs", detail: "Plan de mesure, plan de campagne et bilans en cours" },
      { name: "save_campaign_doc", detail: "Enregistre un plan ou un bilan, sans toucher aux comptes publicitaires" },
      { name: "get_watch_summary", detail: "Contexte concurrentiel" },
      { name: "Recherche web", detail: "Documentation des plateformes" },
    ],
    sheet: campagnesMd.trim(),
  },
};

export const TEAM = AGENTS.map((a) => AGENT_PROFILES[a]);
