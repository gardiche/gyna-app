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

export const AGENTS = ["gyna", "sourcing", "qualification", "redaction"] as const;
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

export const ReportCostInput = z.object({
  mission_token: z.string(),
  amount_eur: z.number().nonnegative().max(1000),
  source: z.enum(["apify", "model"]),
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
