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

export const AGENTS = ["gyna", "sourcing", "qualification", "redaction", "veille", "ads", "campagnes"] as const;
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

/* ---------- Charte de marque ---------- */

export const LOGO_CORNERS = ["haut-gauche", "haut-droite", "bas-gauche", "bas-droite"] as const;
export const LOGO_CORNER_LABEL: Record<(typeof LOGO_CORNERS)[number], string> = {
  "haut-gauche": "En haut à gauche",
  "haut-droite": "En haut à droite",
  "bas-gauche": "En bas à gauche",
  "bas-droite": "En bas à droite",
};
export const ADDRESS_FORMS = ["vouvoiement", "tutoiement"] as const;

/** Contenu d'une version de la charte (table brand_kits). Tout est facultatif : une valeur vide veut dire « pas tranché ». */
export const BrandKitContent = z.object({
  /** Emplacement du logo sur les visuels : coin, taille (% de la largeur de l'image), marge (% de la largeur). */
  logo: z
    .object({
      coin: z.enum(LOGO_CORNERS).nullable().default(null),
      taille_pct: z.number().min(3).max(60).nullable().default(null),
      marge_pct: z.number().min(0).max(25).nullable().default(null),
    })
    .default({}),
  palette: z
    .array(
      z.object({
        nom: z.string().trim().min(1).max(60),
        hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur au format #RRGGBB"),
        usage: z.string().max(200).default(""),
      }),
    )
    .max(16)
    .default([]),
  polices: z.object({ titres: z.string().max(120).default(""), texte: z.string().max(120).default("") }).default({}),
  ton: z.object({ adresse: z.enum(ADDRESS_FORMS).nullable().default(null), registre: z.string().max(1000).default("") }).default({}),
  interdits: z
    .object({
      mots: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
      formules: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
      regles: z.array(z.string().trim().min(1).max(400)).max(100).default([]),
      /** Contrôles automatiques des textes (pubs, posts) : refus à la soumission si une case est cochée et la règle enfreinte. */
      sans_exclamation: z.boolean().default(false),
      sans_emoji: z.boolean().default(false),
      sans_tiret_cadratin: z.boolean().default(false),
      sans_prix: z.boolean().default(false),
    })
    .default({}),
  /** Un format par canal : « instagram-carrousel » → « 4:5 ». */
  formats: z
    .array(z.object({ canal: z.string().trim().min(1).max(60), format: z.string().trim().min(1).max(40), note: z.string().max(300).default("") }))
    .max(30)
    .default([]),
  cible: z.string().max(2000).default(""),
  positionnement: z.string().max(2000).default(""),
  /** Textes à faire figurer (pastille « 16 semaines »), avec l'endroit où ils vont. */
  mentions: z.array(z.object({ texte: z.string().trim().min(1).max(200), ou: z.string().max(200).default("") })).max(20).default([]),
});
export type BrandKitContent = z.infer<typeof BrandKitContent>;

const plain = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Textes qui enfreignent les interdits contrôlables de la charte : mots et formules interdits, et les règles cochées
 * (point d'exclamation, émoji, tiret cadratin, prix). Les autres règles, en texte libre, restent à la lecture de l'agent.
 */
export function checkBrandText(kit: BrandKitContent, texts: Array<string | null | undefined>): string[] {
  const text = texts.filter((t): t is string => !!t).join("\n");
  const flat = plain(text);
  const found: string[] = [];
  for (const m of kit.interdits.mots) {
    if (new RegExp(`(?<![\\p{L}])${escapeRe(plain(m))}(?![\\p{L}])`, "u").test(flat)) found.push(`mot interdit « ${m} »`);
  }
  for (const f of kit.interdits.formules) if (flat.includes(plain(f))) found.push(`formule interdite « ${f} »`);
  if (kit.interdits.sans_exclamation && text.includes("!")) found.push("point d'exclamation");
  if (kit.interdits.sans_emoji && /\p{Extended_Pictographic}/u.test(text)) found.push("émoji");
  if (kit.interdits.sans_tiret_cadratin && /\u2014/.test(text)) found.push("tiret cadratin");
  if (kit.interdits.sans_prix && /\d[\d\s.,]*\s?(€|euros?\b|eur\b)|\$\s?\d/i.test(text)) found.push("prix");
  return found;
}

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

/** Tailles d'entreprise que LinkedIn sait filtrer, dans l'ordre. */
export const COMPANY_SIZES = ["independant", "1-10", "11-50", "51-200", "201-500", "501-1000", "1001+"] as const;

export const SearchLinkedinProfilesInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  titles: z.array(z.string().min(2).max(80)).min(1).max(20).describe("Intitulés de poste actuels à chercher, tels qu'ils s'écrivent sur LinkedIn : « fondateur », « founder », « CEO »…"),
  locations: z.array(z.string().min(2).max(80)).min(1).max(10).describe("Lieux tels que LinkedIn les comprend : « Annecy », « Haute-Savoie », « Genève »…"),
  max_profiles: z.number().int().min(10).max(500).describe("Nombre de résultats à rapporter ; 0,10 $ par tranche de 25"),
  recent_only: z.boolean().default(false).describe("Seulement les personnes dans leur entreprise actuelle depuis moins d'un an"),
  small_companies: z.boolean().default(false).describe("Raccourci : entreprises de 10 personnes au plus et indépendants (comme company_sizes [independant, 1-10])"),
  company_sizes: z.array(z.enum(COMPANY_SIZES)).max(7).optional().describe("Tailles de l'entreprise actuelle à garder, par exemple [11-50, 51-200] pour des PME ; vide = toutes"),
  industries: z.array(z.string().min(2).max(120)).max(10).optional().describe("Secteurs de l'entreprise actuelle, par leur nom LinkedIn en anglais (« Restaurants », « Software Development ») ou leur identifiant ; find_linkedin_industries les trouve. Les sous-secteurs sont inclus"),
  keywords: z.string().max(120).optional().describe("Mots-clés libres en plus des titres, facultatif"),
  segment: z.string().max(100).optional().describe("Nom exact du segment du brief, rangé avec chaque profil"),
});

/** Adéquation au persona, posée au tri : A cœur de cible, B dans la cible, C à la marge. */
export const FIT = ["A", "B", "C"] as const;
export type Fit = (typeof FIT)[number];
export const FIT_LABEL: Record<Fit, string> = { A: "A · cœur de cible", B: "B · dans la cible", C: "C · à la marge" };

export const FetchProfilesInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  limit: z.number().int().min(1).max(50).default(25).describe("Nombre de prospects à lire dans ce lot (0,004 $ par profil)"),
  prospect_ids: z.array(z.string().uuid()).max(50).optional().describe("Prospects précis ; sinon les plus récents pas encore triés"),
  found_since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Seulement les prospects trouvés depuis cette date (AAAA-MM-JJ)"),
});

export const TriageProspectsInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  items: z.array(z.object({
    prospect_id: z.string().uuid(),
    fit: z.enum([...FIT, "discard"]).describe("A, B, C selon la grille d'adéquation du brief, ou discard si hors persona"),
    reason: z.string().min(10).max(400).describe("Le fait du profil qui justifie la note, en une phrase"),
  })).min(1).max(50),
});

export const FetchPostsInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  fits: z.array(z.enum(FIT)).min(1).max(3).default(["A"]).describe("Adéquations à lire ; A par défaut"),
  prospect_ids: z.array(z.string().uuid()).max(30).optional().describe("Prospects précis ; sinon les mieux classés pas encore qualifiés"),
  found_since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(30).default(20).describe("Nombre de prospects à lire (au plus 0,02 $ chacun)"),
});

export const FindLinkedinIndustriesInput = z.object({
  mission_token: z.string(),
  query: z.string().min(2).max(80).describe("Un ou deux mots en anglais : « restaurant », « software », « real estate »"),
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

/* ---------- Création de pubs ---------- */

export type AdPlatform = (typeof AD_PLATFORMS)[number];
export type AdTextField = "headline" | "primary_text" | "description";

/**
 * Limites de caractères par plateforme : `max` est refusé par la plateforme, `recommended` est tronqué à l'affichage.
 * Google : une ligne = un titre (headline) et une description (primary_text) de la même annonce responsive.
 */
export const AD_LIMITS: Record<AdPlatform, Partial<Record<AdTextField, { max?: number; recommended?: number }>>> = {
  meta: { primary_text: { recommended: 125, max: 2200 }, headline: { recommended: 40 }, description: { recommended: 30 } },
  linkedin: { primary_text: { recommended: 150, max: 600 }, headline: { recommended: 70, max: 200 }, description: { recommended: 100, max: 300 } },
  google: { headline: { max: 30 }, primary_text: { max: 90 } },
  tiktok: { primary_text: { recommended: 80, max: 100 } },
  other: {},
};

export const AD_FIELD_LABEL: Record<AdTextField, string> = { headline: "titre", primary_text: "texte principal", description: "description" };
export const AWARENESS = ["unaware", "problem", "solution", "product"] as const;

/** Dépassements d'une pub : `errors` bloquent (limite de la plateforme), `warnings` signalent un texte qui sera tronqué. */
export function checkAdLimits(platform: AdPlatform, ad: Partial<Record<AdTextField, string | null | undefined>>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const [field, limit] of Object.entries(AD_LIMITS[platform]) as Array<[AdTextField, { max?: number; recommended?: number }]>) {
    const n = (ad[field] ?? "").length;
    if (limit.max && n > limit.max) errors.push(`${AD_FIELD_LABEL[field]} de ${n} caractères, ${limit.max} au plus`);
    else if (limit.recommended && n > limit.recommended) warnings.push(`${AD_FIELD_LABEL[field]} de ${n} caractères, ${limit.recommended} recommandés`);
  }
  return { errors, warnings };
}

export const AdInput = z.object({
  format: z.enum(AD_FORMATS).optional(),
  template: z.string().max(80).optional().describe("Modèle utilisé, tel que nommé dans le skill « Modèles de pubs »"),
  angle: z.string().min(3).max(200).describe("La raison de cliquer que cette pub teste"),
  awareness: z.enum(AWARENESS).optional().describe("Niveau de conscience visé : unaware, problem, solution ou product"),
  headline: z.string().max(255).optional(),
  primary_text: z.string().min(10).max(2200).describe("Texte principal ; pour Google, la description de 90 caractères au plus"),
  description: z.string().max(300).optional(),
  cta: z.string().max(60).optional().describe("Libellé du bouton, parmi ceux de la plateforme"),
  landing_url: optUrl,
  visual_brief: z.string().max(1500).optional().describe("Ce que montre le visuel, assez précis pour le produire : scène, texte incrusté, style"),
  image_prompt: z.string().max(1500).optional(),
  grounding: z.string().min(10).max(600).describe("Sur quoi la pub s'appuie : champ du brief, pub concurrente, constat de la veille, retour d'associé"),
  hypothesis: z.string().max(300).optional().describe("Ce qu'on apprendra si elle marche ou non"),
});

export const SubmitAdsInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  title: z.string().min(3).max(120).describe("Nom du lot, par exemple « Meta, salariés qui veulent entreprendre, octobre »"),
  platform: z.enum(AD_PLATFORMS),
  objective: z.string().max(300).optional().describe("Ce que le lot cherche à obtenir"),
  audience: z.string().max(400).optional().describe("Public visé et niveau de conscience supposé"),
  rationale: z.string().min(20).max(1500).describe("Pourquoi ces angles : ce qui vient du brief, de la veille, des retours"),
  ads: z.array(AdInput).min(1).max(20),
});

/* ---------- Posts (LinkedIn, Instagram) ---------- */

export const POST_PLATFORMS = ["linkedin", "instagram"] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];
export const POST_FORMATS = ["text", "image", "carousel", "document", "video"] as const;

/** Longueurs d'un post : `max` refusé par le réseau, `visible` affiché avant « voir plus », `ideal` conseillé. */
export const POST_LIMITS: Record<PostPlatform, { max: number; visible: number; ideal?: [number, number]; slides: number }> = {
  linkedin: { max: 3000, visible: 210, ideal: [1200, 1500], slides: 20 },
  instagram: { max: 2200, visible: 125, slides: 20 },
};
export const POST_MAX_HASHTAGS = 5;

export const countHashtags = (text: string) => (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;

/** Dépassements d'un post : `errors` bloquent, `warnings` signalent ce qui nuit à la portée. */
export function checkPostLimits(platform: PostPlatform, post: { primary_text: string; format?: string; slides?: Array<{ text: string }> }) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const limit = POST_LIMITS[platform];
  const n = post.primary_text.length;
  if (n > limit.max) errors.push(`texte de ${n} caractères, ${limit.max} au plus`);
  const tags = countHashtags(post.primary_text);
  if (tags > POST_MAX_HASHTAGS) warnings.push(`${tags} hashtags, ${POST_MAX_HASHTAGS} au plus conseillés`);
  if (platform === "linkedin" && /https?:\/\//.test(post.primary_text)) warnings.push("lien dans le texte : sur LinkedIn, le mettre en premier commentaire");
  const carousel = post.format === "carousel" || post.format === "document";
  if (carousel && (post.slides?.length ?? 0) < 3) errors.push("carrousel sans ses diapositives (3 au moins)");
  if ((post.slides?.length ?? 0) > limit.slides) errors.push(`${post.slides!.length} diapositives, ${limit.slides} au plus`);
  return { errors, warnings };
}

export const PostInput = z.object({
  format: z.enum(POST_FORMATS),
  template: z.string().max(80).optional().describe("Modèle de post ou trame de carrousel, tel que nommé dans les skills"),
  pillar: z.string().min(3).max(120).describe("Pilier éditorial du post"),
  headline: z.string().max(200).optional().describe("Titre de couverture d'un carrousel, ou titre interne du post"),
  primary_text: z.string().min(20).max(3000).describe("Texte du post (légende sur Instagram), hashtags compris"),
  slides: z.array(z.object({ text: z.string().min(2).max(600) })).max(20).optional().describe("Diapositives d'un carrousel ou d'un document, la première est la couverture"),
  first_comment: z.string().max(600).optional().describe("Premier commentaire, par exemple le lien sur LinkedIn"),
  visual_brief: z.string().max(1500).optional(),
  scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date au format AAAA-MM-JJ").optional(),
  grounding: z.string().min(10).max(600).describe("Sur quoi le post s'appuie : champ du brief, matière donnée par un associé, constat de la veille"),
});

export const SubmitPostsInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  title: z.string().min(3).max(120).describe("Nom du lot, par exemple « LinkedIn, semaine du 19 octobre »"),
  platform: z.enum(POST_PLATFORMS),
  author: z.string().min(2).max(80).describe("Qui publie : « Page L'Amorce », ou le prénom de l'associé pour un profil personnel"),
  rationale: z.string().min(20).max(1500).describe("Ligne éditoriale du lot : piliers, répartition, d'où vient la matière"),
  posts: z.array(PostInput).min(1).max(20),
});

export const ASSET_KINDS = ["logo", "photo", "inspiration", "charte"] as const;
export const ASSET_KIND_LABEL: Record<(typeof ASSET_KINDS)[number], string> = {
  logo: "Logo",
  photo: "Photo réelle",
  inspiration: "Inspiration",
  charte: "Charte graphique",
};
export const IMAGE_ASPECTS = ["square", "portrait", "landscape"] as const;

export const DescribeAdReferenceInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  asset_id: z.string().uuid(),
  description: z
    .string()
    .min(20)
    .max(800)
    .describe("Ce que montre l'image, pour quelqu'un qui ne la voit pas : composition, couleurs, typographie, ambiance, texte visible"),
});

export const GetAdFeedbackInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  kind: z.enum(["ad", "post"]).optional().describe("Limiter aux pubs (ad) ou aux posts (post)"),
  limit: z.number().int().min(1).max(40).optional(),
});

/* ---------- Gestion de campagnes ---------- */

export const CAMPAIGN_DOC_KINDS = ["mesure", "plan", "bilan"] as const;
export const CAMPAIGN_DOC_LABEL: Record<(typeof CAMPAIGN_DOC_KINDS)[number], string> = {
  mesure: "Plan de mesure",
  plan: "Plan de campagne",
  bilan: "Bilan",
};

export const SaveCampaignDocInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  kind: z.enum(CAMPAIGN_DOC_KINDS),
  title: z.string().min(3).max(120),
  content: z.string().min(100).max(30000).describe("Document complet en markdown, au gabarit du skill correspondant"),
});

/** État d'une pub chez Meta, tel que l'agent Campagnes le déclare après chaque action. */
export const AD_EXTERNAL_STATUS = ["paused", "active", "stopped"] as const;

export const RecordAdLaunchInput = z.object({
  mission_token: z.string(),
  venture_slug: z.string(),
  ad_ref: z.string().min(8).max(36).describe("Référence de la pub rendue par get_ad_pilot (8 caractères) ou son identifiant complet"),
  external_id: z.string().min(3).max(64).describe("Identifiant de la pub créée chez Meta"),
  status: z.enum(AD_EXTERNAL_STATUS).describe("paused : créée en pause ; active : en diffusion ; stopped : arrêtée pour de bon"),
  note: z.string().max(300).optional().describe("Pourquoi, en une phrase (lancement, coupée car trop chère, etc.)"),
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
  /** « prospection » : mission lancée par une personne qui ne fait que de la prospection (outils limités). */
  scope: z.enum(["full", "prospection"]).default("full"),
});
export type MissionClaims = z.infer<typeof MissionClaims>;
/** Ce qu'on signe : le périmètre peut être omis (« full » par défaut). */
export type MissionClaimsInput = z.input<typeof MissionClaims>;

/** Outils MCP autorisés à une mission « prospection » : trouver, trier, qualifier, rédiger. */
export const PROSPECTION_TOOLS = [
  "get_brief", "get_agent_skills", "get_skill", "get_feedback", "get_venture_stats",
  "list_prospects", "find_prospect", "search_linkedin_profiles", "find_linkedin_industries",
  "fetch_profiles", "triage_prospects", "fetch_posts", "upsert_prospects", "add_signals",
  "qualify_prospect", "discard_prospect", "submit_draft", "report_cost", "log_action",
] as const;

// Clé courte « gm-… », y compris mal recopiée (groupe trop court ou trop long), et ancien jeton signé (JWT).
const MISSION_KEY_RE = /\bgm-[a-z0-9]{2,8}(?:-[a-z0-9]{2,8}){1,5}\b/gi;
const JWT_RE = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g;
export const MASKED_TOKEN = "[jeton masqué]";

/** Retire les jetons de mission d'un texte venu d'un agent, avant de l'enregistrer ou de l'afficher. */
export function maskMissionTokens(text: string): string {
  return text.replace(MISSION_KEY_RE, MASKED_TOKEN).replace(JWT_RE, MASKED_TOKEN);
}

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
