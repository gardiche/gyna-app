import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { BRIDGE_MAX_SKEW_MS, BRIDGE_SIG_HEADER, BRIDGE_TS_HEADER } from "@gyna/schemas";
import { env } from "./env";

function sign(secret: string, ts: string, method: string, path: string, body: string): string {
  return createHmac("sha256", secret).update(`${ts}.${method.toUpperCase()}.${path}.${body}`).digest("hex");
}

export function verifyBridgeSignature(req: Request, path: string, body: string): boolean {
  const ts = req.headers.get(BRIDGE_TS_HEADER);
  const sig = req.headers.get(BRIDGE_SIG_HEADER);
  if (!ts || !sig || Math.abs(Date.now() - Number(ts)) > BRIDGE_MAX_SKEW_MS) return false;
  const expected = Buffer.from(sign(env.bridgeSecret(), ts, "POST", path, body), "hex");
  const given = Buffer.from(sig, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Appel signé vers le pont Gyna. */
export async function bridgeFetch(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}) {
  const method = init.method ?? (init.body ? "POST" : "GET");
  const body = init.body === undefined ? "" : JSON.stringify(init.body);
  const ts = String(Date.now());
  const url = new URL(path, env.bridgeUrl());
  return fetch(url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      [BRIDGE_TS_HEADER]: ts,
      [BRIDGE_SIG_HEADER]: sign(env.bridgeSecret(), ts, method, url.pathname, body),
    },
    body: body || undefined,
    signal: init.signal,
    cache: "no-store",
  });
}
