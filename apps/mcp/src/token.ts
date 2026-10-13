import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { Sql } from "postgres";
import { MissionClaims } from "@gyna/schemas";

const enc = (secret: string) => new TextEncoder().encode(secret);

export async function verifyMissionToken(token: string, secret: string): Promise<MissionClaims> {
  const { payload } = await jwtVerify(token, enc(secret), { algorithms: ["HS256"], audience: "gyna-mcp" });
  return MissionClaims.parse(payload);
}

export class MissionTokenError extends Error {}

export const hashMissionKey = (key: string) => createHash("sha256").update(key).digest("hex");

/**
 * Retrouve la mission d'un jeton. Clé courte « gm-… » (donnée par l'app, retrouvée par son empreinte) ou,
 * pour les missions plus anciennes, jeton signé. Les guillemets, espaces et majuscules ajoutés en recopiant sont tolérés.
 */
export async function resolveMission(sql: Sql, token: unknown, secret: string): Promise<MissionClaims> {
  const raw = String(token ?? "").trim().replace(/^[`'"«\s]+|[`'"»\s.,;]+$/g, "");
  if (/^gm-/i.test(raw)) {
    const key = raw.toLowerCase().replace(/\s+/g, "");
    const [m] = await sql`
      select org_id, id as mission_id, conversation_id, venture_id, budget_cap_eur::float as budget_cap_eur
      from missions where token_hash = ${hashMissionKey(key)} and token_expires_at > now()`;
    if (!m) throw new MissionTokenError("Jeton de mission inconnu ou expiré. Recopie-le caractère pour caractère depuis le bloc [Mission Gyna].");
    return MissionClaims.parse(m);
  }
  try {
    return await verifyMissionToken(raw, secret);
  } catch {
    throw new MissionTokenError("Jeton de mission invalide ou expiré. Recopie-le caractère pour caractère depuis le bloc [Mission Gyna].");
  }
}

/** Utilisé par les tests ; l'app signe avec la même logique. */
export async function signMissionToken(claims: MissionClaims, secret: string, ttl = "2h"): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("gyna-mcp")
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(enc(secret));
}
