function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  bridgeUrl: () => required("BRIDGE_URL"),
  bridgeSecret: () => required("BRIDGE_SECRET"),
  missionJwtSecret: () => required("MISSION_JWT_SECRET"),
  telegramToken: () => process.env.TELEGRAM_BOT_TOKEN,
  telegramWebhookSecret: () => process.env.TELEGRAM_WEBHOOK_SECRET,
  telegramBotName: () => process.env.TELEGRAM_BOT_USERNAME,
  hooksSecret: () => process.env.APP_HOOKS_SECRET,
  defaultModel: () => process.env.DEFAULT_MODEL ?? "anthropic/claude-sonnet-5",
  defaultProvider: () => process.env.DEFAULT_PROVIDER || undefined,
};
