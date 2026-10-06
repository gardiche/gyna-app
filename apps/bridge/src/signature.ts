import { createHmac, timingSafeEqual } from "node:crypto";
import { BRIDGE_MAX_SKEW_MS } from "@gyna/schemas";

/** Signature partagée app <-> pont : HMAC-SHA256 de "ts.METHOD.path.body". */
export function sign(secret: string, ts: string, method: string, path: string, body: string): string {
  return createHmac("sha256", secret).update(`${ts}.${method.toUpperCase()}.${path}.${body}`).digest("hex");
}

export function verify(
  secret: string,
  ts: string | undefined,
  signature: string | undefined,
  method: string,
  path: string,
  body: string,
  now = Date.now(),
): boolean {
  if (!ts || !signature) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now - t) > BRIDGE_MAX_SKEW_MS) return false;
  const expected = Buffer.from(sign(secret, ts, method, path, body), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
