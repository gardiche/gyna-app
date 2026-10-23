import "server-only";
import { createHash, randomInt } from "node:crypto";
import { SignJWT } from "jose";
import type { MissionClaimsInput } from "@gyna/schemas";
import { env } from "./env";

// Sans 0, o, 1, l ni i : les caractères qu'on confond en recopiant.
const KEY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
/** Durée de vie d'un jeton de mission : une mission close depuis longtemps ne doit plus pouvoir écrire. */
export const MISSION_KEY_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Clé de mission courte, « gm-xxxxx-xxxxx-xxxxx-xxxxx » : c'est elle que les agents recopient d'un appel à l'autre.
 * La base n'en garde que l'empreinte ; le serveur MCP retrouve la mission par cette empreinte.
 */
export function newMissionKey(): { key: string; hash: string; expiresAt: string } {
  const group = () => Array.from({ length: 5 }, () => KEY_ALPHABET[randomInt(KEY_ALPHABET.length)]).join("");
  const key = `gm-${group()}-${group()}-${group()}-${group()}`;
  return { key, hash: createHash("sha256").update(key).digest("hex"), expiresAt: new Date(Date.now() + MISSION_KEY_TTL_MS).toISOString() };
}

/** Ancien jeton signé, encore accepté par le serveur MCP (même secret, même audience). */
export function signMissionToken(claims: MissionClaimsInput): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("gyna-mcp")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(env.missionJwtSecret()));
}
