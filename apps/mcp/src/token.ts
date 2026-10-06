import { jwtVerify, SignJWT } from "jose";
import { MissionClaims } from "@gyna/schemas";

const enc = (secret: string) => new TextEncoder().encode(secret);

export async function verifyMissionToken(token: string, secret: string): Promise<MissionClaims> {
  const { payload } = await jwtVerify(token, enc(secret), { algorithms: ["HS256"], audience: "gyna-mcp" });
  return MissionClaims.parse(payload);
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
