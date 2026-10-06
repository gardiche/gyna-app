function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export interface BridgeConfig {
  port: number;
  host: string;
  secret: string;
  hermesUrl: string;
  hermesToken: string | undefined;
  hermesProfile: string | undefined;
  callbackUrl: string | undefined;
  dataDir: string;
  turnTimeoutMs: number;
}

export function loadConfig(): BridgeConfig {
  return {
    port: Number(process.env.PORT ?? 8790),
    host: process.env.HOST ?? "127.0.0.1",
    secret: required("BRIDGE_SECRET"),
    hermesUrl: process.env.HERMES_WS_URL ?? "ws://127.0.0.1:9119/api/ws",
    hermesToken: process.env.HERMES_TOKEN || undefined,
    hermesProfile: process.env.HERMES_PROFILE ?? "gyna",
    callbackUrl: process.env.APP_CALLBACK_URL || undefined,
    dataDir: process.env.DATA_DIR ?? "./data",
    turnTimeoutMs: Number(process.env.TURN_TIMEOUT_MS ?? 15 * 60 * 1000),
  };
}
