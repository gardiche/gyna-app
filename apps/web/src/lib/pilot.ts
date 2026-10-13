import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bridgeFetch } from "./bridge";
import { env } from "./env";
import { newMissionKey } from "./mission";

/** Accès au compte publicitaire, posé par un associé dans les variables d'environnement ; jamais dans le code ni dans le chat. */
const meta = () => ({
  token: process.env.META_ACCESS_TOKEN,
  account: (process.env.META_AD_ACCOUNT_ID ?? "").replace(/^act_/, ""),
  // L'API publicitaire refuse les appels sans version (ils retombent sur une version périmée) : on en fixe une par défaut.
  base: `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v26.0"}`,
});

/** L'app peut-elle lire la dépense et couper les campagnes elle-même, sans passer par un agent ? */
export const pilotGuardReady = () => Boolean(meta().token && meta().account);

async function graph(path: string, params: Record<string, string>, method: "GET" | "POST"): Promise<any> {
  const { token, base } = meta();
  const body = new URLSearchParams({ ...params, access_token: token! });
  const r = await fetch(method === "GET" ? `${base}/${path}?${body}` : `${base}/${path}`, {
    method,
    ...(method === "POST" ? { body } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error?.error_user_msg ?? data.error?.message ?? `Meta a répondu ${r.status}`);
  return data;
}

/**
 * Arrêt d'urgence : met en pause toutes les campagnes en diffusion du compte publicitaire.
 * Fait par l'app elle-même, pour ne dépendre d'aucun agent. Renvoie le nombre de campagnes coupées.
 */
export async function pauseAllCampaigns(): Promise<{ ok: true; paused: number } | { ok: false; error: string }> {
  if (!pilotGuardReady()) return { ok: false, error: "Le compte publicitaire n'est pas relié à l'app : mettez les campagnes en pause dans le gestionnaire de Meta." };
  try {
    const { account } = meta();
    const list = await graph(`act_${account}/campaigns`, { fields: "id", effective_status: '["ACTIVE"]', limit: "200" }, "GET");
    const ids: string[] = (list.data ?? []).map((c: { id: string }) => c.id);
    for (const id of ids) await graph(id, { status: "PAUSED" }, "POST");
    return { ok: true, paused: ids.length };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Dépense du compte publicitaire entre deux dates (AAAA-MM-JJ), en euros. null si Meta ne répond pas. */
export async function accountSpend(since: string, until: string): Promise<number | null> {
  if (!pilotGuardReady()) return null;
  try {
    const { account } = meta();
    const r = await graph(`act_${account}/insights`, { fields: "spend", time_range: JSON.stringify({ since, until }) }, "GET");
    return Number(r.data?.[0]?.spend ?? 0);
  } catch {
    return null;
  }
}

/**
 * Dépose dans la bibliothèque d'images du compte publicitaire le visuel de chaque pub Meta approuvée qui n'y est pas encore,
 * et garde son empreinte : l'agent la donne telle quelle en créant la pub. Renvoie le nombre d'images déposées.
 */
export async function syncAdImages(db: SupabaseClient, ventureId: string): Promise<{ uploaded: number; error?: string }> {
  if (!pilotGuardReady()) return { uploaded: 0 };
  const { data: ads } = await db
    .from("ads")
    .select("id, ad_images(id, url, meta_hash, created_at, slide), ad_batches!inner(venture_id, kind, platform)")
    .eq("ad_batches.venture_id", ventureId)
    .eq("ad_batches.kind", "ad")
    .eq("ad_batches.platform", "meta")
    .eq("status", "approved");
  let uploaded = 0;
  for (const ad of ads ?? []) {
    const image = ((ad as any).ad_images ?? []).filter((i: any) => (i.slide ?? 0) === 0).sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0];
    if (!image || image.meta_hash) continue;
    try {
      const file = await fetch(image.url, { signal: AbortSignal.timeout(30_000) });
      if (!file.ok) throw new Error(`visuel illisible (${file.status})`);
      const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
      const r = await graph(`act_${meta().account}/adimages`, { bytes }, "POST");
      const hash = (Object.values(r.images ?? {})[0] as { hash?: string } | undefined)?.hash;
      if (!hash) throw new Error("Meta n'a pas renvoyé d'empreinte");
      await db.from("ad_images").update({ meta_hash: hash }).eq("id", image.id);
      uploaded++;
    } catch (err) {
      return { uploaded, error: (err as Error).message };
    }
  }
  return { uploaded };
}

export interface Pilot {
  id: string;
  org_id: string;
  venture_id: string;
  status: "active" | "paused";
  total_budget_eur: number;
  target_cost_eur: number | null;
  starts_on: string;
  ends_on: string;
  conversation_id: string | null;
  last_run_on: string | null;
}

/** Jour et heure à Paris : le passage quotidien suit la journée des associés. */
export function parisNow(): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

/** Met l'enveloppe en pause, coupe les campagnes chez Meta et note pourquoi dans le journal. */
export async function stopPilot(db: SupabaseClient, pilot: Pick<Pilot, "id" | "org_id" | "venture_id">, reason: string) {
  await db.from("ad_pilots").update({ status: "paused" }).eq("id", pilot.id);
  const res = await pauseAllCampaigns();
  if (res.ok) {
    const { data: batches } = await db.from("ad_batches").select("id").eq("venture_id", pilot.venture_id).eq("kind", "ad");
    const ids = (batches ?? []).map((b) => b.id);
    if (ids.length) await db.from("ads").update({ external_status: "paused" }).in("batch_id", ids).eq("external_status", "active");
  }
  await db.from("actions").insert({
    org_id: pilot.org_id,
    agent: "associe",
    tool: "pilot_stop",
    result_summary: res.ok ? `Pilotage des pubs en pause (${reason}) : ${res.paused} campagne(s) coupée(s) chez Meta.` : `Pilotage des pubs en pause (${reason}), mais les campagnes n'ont pas pu être coupées : ${res.error}`,
    status: res.ok ? "ok" : "error",
  });
  return res;
}

const DAILY_PROMPT = (name: string) =>
  `Passage quotidien du pilotage des pubs Meta de ${name}, lancé automatiquement par l'app.\n\n` +
  `Délègue à Campagnes, avec sa fiche, en mode pilotage : lire l'enveloppe (get_ad_pilot), lancer les pubs approuvées qui ne sont pas encore chez Meta, ` +
  `lire les résultats depuis le début de la période, couper ou renforcer selon le skill « Piloter en autonomie », déclarer chaque changement, ` +
  `puis enregistrer un bilan court. Si l'enveloppe est en pause ou hors dates, tout mettre en pause et le dire. ` +
  `Rends compte en cinq lignes : dépensé sur l'enveloppe, pré-inscriptions, coût par pré-inscription face au coût visé, ce qui a été changé, ce qui bloque.`;

/**
 * Lance le passage du jour : une mission dans la conversation de pilotage de la venture.
 * Renvoie « busy » si Gyna travaille déjà dans cette conversation (on réessaiera au prochain passage de l'horloge).
 */
export async function startDailyRun(db: SupabaseClient, pilot: Pilot, day: string): Promise<"started" | "busy" | "failed"> {
  const { data: venture } = await db.from("ventures").select("slug, name").eq("id", pilot.venture_id).single();
  if (!venture) return "failed";

  let conversationId = pilot.conversation_id;
  let sessionKey: string | null = null;
  if (conversationId) {
    const { data: conv } = await db.from("conversations").select("hermes_session_key").eq("id", conversationId).maybeSingle();
    sessionKey = conv?.hermes_session_key ?? null;
  }
  if (!sessionKey) {
    // Mêmes réglages de modèle que la dernière conversation ouverte par un associé.
    const { data: last } = await db
      .from("conversations")
      .select("model, provider, reasoning_effort")
      .eq("org_id", pilot.org_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const model = last?.model ?? env.defaultModel();
    const r = await bridgeFetch("/sessions", {
      body: { model, provider: last?.provider ?? undefined, reasoning_effort: last?.reasoning_effort ?? undefined, title: "Gyna" },
    }).catch(() => null);
    if (!r?.ok) return "failed";
    sessionKey = ((await r.json()) as { hermes_session_key: string }).hermes_session_key;
    const { data: conv } = await db
      .from("conversations")
      .insert({
        org_id: pilot.org_id,
        venture_id: pilot.venture_id,
        model,
        provider: last?.provider ?? null,
        reasoning_effort: last?.reasoning_effort ?? null,
        hermes_session_key: sessionKey,
        title: `Pilotage des pubs · ${venture.name}`,
      })
      .select("id")
      .single();
    if (!conv) return "failed";
    conversationId = conv.id;
    await db.from("ad_pilots").update({ conversation_id: conversationId }).eq("id", pilot.id);
  }

  const { data: org } = await db.from("organizations").select("default_mission_budget_eur").eq("id", pilot.org_id).single();
  const budget = Number(org?.default_mission_budget_eur ?? 5);
  const text = DAILY_PROMPT(venture.name);
  const key = newMissionKey();
  const { data: mission } = await db
    .from("missions")
    .insert({ org_id: pilot.org_id, conversation_id: conversationId, venture_id: pilot.venture_id, objective: text.slice(0, 500), budget_cap_eur: budget, token_hash: key.hash, token_expires_at: key.expiresAt })
    .select("id")
    .single();
  if (!mission) return "failed";

  const upstream = await bridgeFetch(`/sessions/${sessionKey}/messages`, {
    body: { text, mission_token: key.key, venture_slug: venture.slug, budget_remaining_eur: budget, callback: { conversation_id: conversationId, mission_id: mission.id } },
  }).catch(() => null);
  if (!upstream?.ok) {
    await db.from("missions").update({ status: upstream?.status === 409 ? "cancelled" : "failed", ended_at: new Date().toISOString() }).eq("id", mission.id);
    return upstream?.status === 409 ? "busy" : "failed";
  }
  // Le pont poursuit le tour et enregistre la réponse par son rappel : inutile de lire le flux ici.
  void upstream.body?.cancel().catch(() => undefined);
  await db.from("messages").insert({ org_id: pilot.org_id, conversation_id: conversationId, mission_id: mission.id, role: "user", content: text });
  await db.from("ad_pilots").update({ last_run_on: day }).eq("id", pilot.id);
  return "started";
}

/** Lecture du compte publicitaire, pour le tableau de bord. */
export { graph as metaGraph, meta as metaAccount };
