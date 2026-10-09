import { z } from "zod";

/* ---------- Énumérations ---------- */

export const HEAT = ["cold", "warm", "hot"] as const;
export type Heat = (typeof HEAT)[number];

export const PROSPECT_STATUS = [
  "to_review",
  "qualified",
  "contacted",
  "replied",
  "enrolled",
  "discarded",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUS)[number];

export const AGENTS = ["gyna", "sourcing", "qualification", "redaction", "veille"] as const;
export type AgentName = (typeof AGENTS)[number];

export const HEAT_LABEL: Record<Heat, string> = { cold: "Froid", warm: "Tiède", hot: "Chaud" };
export const STATUS_LABEL: Record<ProspectStatus, string> = {
  to_review: "À examiner",
  qualified: "Qualifié",
  contacted: "Contacté",
  replied: "A répondu",
  enrolled: "Inscrit",
  discarded: "Écarté",
};

/* ---------- LinkedIn ---------- */

/**
 * Normalise une URL de profil LinkedIn en clé de dédoublonnage :
 * "https://www.LinkedIn.com/in/Claire-Martin/?utm=x" -> "linkedin.com/in/claire-martin".
 * Renvoie null si l'URL n'est pas un profil /in/.
 */
export function normalizeLinkedinUrl(input: string): string | null {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^([a-z]{2,3}\.)?www\./, "").replace(/^[a-z]{2}\./, "");
  s = s.split(/[?#]/)[0] ?? "";
  s = s.replace(/\/+$/, "");
  const m = s.match(/^linkedin\.com\/in\/([^/]+)/);
  if (!m || !m[1]) return null;
  return `linkedin.com/in/${decodeURIComponent(m[1])}`;
}

/* ---------- Brief GTM ---------- */

export const BriefContent = z.object({
  persona: z.string().default(""),
  offre: z.string().default(""),
  promesse: z.string().default(""),
  objections: z.string().default(""),
  ton: z.string().default(""),
  signaux_chauds: z.string().default(""),
  interdits: z.string().default(""),
});
export type BriefContent = z.infer<typeof BriefContent>;

/* ---------- Entrées des outils MCP ---------- */

const linkedinUrl = z
  .string()
  .url()
  .refine((u) => normalizeLinkedinUrl(u) !== null, "URL de profil LinkedIn (/in/) attendue");

export const ProspectInput = z.object({
  linkedin_url: linkedinUrl,
  full_name: z.string().min(1).max(200),
  headline: z.string().max(300).optional(),
  location: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  segment: z.string().max(100).optional(),
});
export type ProspectInput = z.infer<typeof ProspectInput>;

export const SignalInput = z.object({
  kind: z.enum(["post", "comment", "event"]),
  url: z.string().url(),
  excerpt: z.string().max(500),
  published_at: z.string().datetime({ offset: true }),
});
export type SignalInput = z.infer<typeof SignalInput>;

export const UpsertProspectsInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  prospects: z.array(ProspectInput).min(1).max(50),
});

export const AddSignalsInput = z.object({
  mission_token: z.string(),
  prospect_id: z.string().uuid(),
  venture_slug: z.string(),
  signals: z.array(SignalInput).min(1).max(20),
});

export const QualifyProspectInput = z.object({
  mission_token: z.string(),
  prospect_id: z.string().uuid(),
  venture_slug: z.string(),
  heat: z.enum(HEAT),
  heat_reason: z.string().min(10).max(1000),
  signal_ids: z.array(z.string().uuid()).max(20).default([]),
});

export const DiscardProspectInput = z.object({
  mission_token: z.string(),
  prospect_id: z.string().uuid(),
  venture_slug: z.string(),
  reason: z.string().min(3).max(500),
});

export const SubmitDraftInput = z.object({
  mission_token: z.string(),
  prospect_id: z.string().uuid(),
  venture_slug: z.string(),
  body: z.string().min(20).max(3000),
});

export const ProposeSkillUpdateInput = z.object({
  mission_token: z.string(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug en minuscules, chiffres et tirets")
    .max(80)
    .describe("Identifiant du skill à modifier (tel que renvoyé par get_agent_skills), ou d'un nouveau skill"),
  name: z.string().min(3).max(120).optional().describe("Nom lisible ; obligatoire pour un nouveau skill"),
  agent: z.enum(AGENTS).nullable().optional().describe("Agent qui chargera le skill ; null = tous les agents. Obligatoire pour un nouveau skill"),
  description: z
    .string()
    .min(20)
    .max(1024)
    .optional()
    .describe("Ce que fait le skill et quand l'utiliser, à la troisième personne ; obligatoire pour un nouveau skill"),
  content: z.string().min(20).max(20000).describe("Contenu complet de la nouvelle version, pas seulement la différence"),
  rationale: z.string().min(10).max(1000).describe("Pourquoi ce changement, en une ou deux phrases, pour l'associé qui valide"),
});

/* ---------- Veille concurrentielle ---------- */

export const AD_PLATFORMS = ["meta", "linkedin", "google", "tiktok", "other"] as const;
export const AD_FORMATS = ["image", "video", "carousel", "text", "document", "other"] as const;

const optUrl = z.string().url().max(1000).optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date au format AAAA-MM-JJ").optional();

export const UpsertCompetitorInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  name: z.string().min(2).max(200).describe("Nom du concurrent ; sert de clé, sans tenir compte des majuscules"),
  kind: z.enum(["direct", "indirect"]).optional().describe("direct : même offre, même public ; indirect : autre réponse au même besoin"),
  website: optUrl,
  linkedin_url: optUrl,
  facebook_url: optUrl,
  instagram_url: optUrl,
  summary: z.string().max(400).optional().describe("Positionnement en une phrase"),
  profile: z.string().min(50).max(20000).optional().describe("Fiche complète en markdown, au format du skill « Profiler un concurrent »"),
});

export const CompetitorAdInput = z.object({
  platform: z.enum(AD_PLATFORMS),
  url: z.string().url().max(1000).describe("Lien vers la pub dans la bibliothèque publicitaire"),
  library_id: z.string().max(200).optional(),
  started_at: day.describe("Début de diffusion, AAAA-MM-JJ"),
  last_seen_at: day.describe("Dernier jour de diffusion connu, AAAA-MM-JJ"),
  active: z.boolean().optional(),
  format: z.enum(AD_FORMATS).optional(),
  headline: z.string().max(300).optional(),
  body: z.string().max(3000).optional().describe("Texte de la pub, tel quel"),
  cta: z.string().max(100).optional(),
  landing_url: optUrl,
  angle: z.string().max(200).optional().describe("Raison de cliquer mise en avant (douleur, résultat, preuve, identité…)"),
  hook: z.string().max(300).optional().describe("Première phrase ou accroche visuelle"),
  promise: z.string().max(300).optional(),
  audience: z.string().max(300).optional().describe("Public visé, déduit du texte et du visuel"),
  reach: z.string().max(100).optional().describe("Fourchette de portée publiée par la bibliothèque"),
  notes: z.string().max(1000).optional(),
});

export const AddCompetitorAdsInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  competitor_id: z.string().uuid(),
  ads: z.array(CompetitorAdInput).min(1).max(30),
});

export const GetCompetitorAdsInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  competitor_id: z.string().uuid().optional(),
  platform: z.enum(AD_PLATFORMS).optional(),
  active_only: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const SaveWatchSummaryInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  content: z.string().min(100).max(20000).describe("Synthèse complète en markdown, au format du skill « Synthèse de la veille »"),
});

export const ReportCostInput = z.object({
  mission_token: z.string(),
  amount_eur: z.number().nonnegative().max(1000),
  source: z.enum(["apify", "model"]),
  agent: z.enum(AGENTS).default("gyna").describe("Agent qui a engagé la dépense (sourcing, qualification…)"),
});

export const LogActionInput = z.object({
  mission_token: z.string(),
  agent: z.enum(AGENTS),
  tool: z.string().max(100),
  summary: z.string().max(1000),
  status: z.enum(["ok", "error"]).default("ok"),
});

/* ---------- Jeton de mission ---------- */

export const MissionClaims = z.object({
  org_id: z.string().uuid(),
  mission_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  venture_id: z.string().uuid().nullable(),
  budget_cap_eur: z.number(),
});
export type MissionClaims = z.infer<typeof MissionClaims>;

/* ---------- Événements du pont vers l'app (SSE) ---------- */

export type BridgeEvent =
  | { type: "start" }
  | { type: "delta"; text: string }
  | { type: "tool_start"; id: string; name: string; summary?: string }
  | { type: "tool_complete"; id: string; name: string; summary?: string; ok: boolean }
  | { type: "complete"; text: string; status: string }
  | { type: "error"; message: string };

/* ---------- Signature HMAC app <-> pont ---------- */

export const BRIDGE_TS_HEADER = "x-gyna-ts";
export const BRIDGE_SIG_HEADER = "x-gyna-signature";
export const BRIDGE_MAX_SKEW_MS = 5 * 60 * 1000;
