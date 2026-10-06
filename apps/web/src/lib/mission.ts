import "server-only";
import { SignJWT } from "jose";
import type { MissionClaims } from "@gyna/schemas";
import { env } from "./env";

/** Jeton de mission vérifié par le serveur MCP (même secret, même audience). */
export function signMissionToken(claims: MissionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("gyna-mcp")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(env.missionJwtSecret()));
}
