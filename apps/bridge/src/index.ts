import { loadConfig } from "./config.js";
import { HermesClient } from "./hermes.js";
import { SessionStore } from "./sessions.js";
import { buildServer } from "./server.js";

const cfg = loadConfig();
const hermes = new HermesClient(cfg.hermesUrl, cfg.hermesToken);
const sessions = new SessionStore(cfg.dataDir, hermes, cfg.hermesProfile);
const app = buildServer(cfg, hermes, sessions);

hermes.start();
await app.listen({ port: cfg.port, host: cfg.host });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    hermes.stop();
    await app.close();
    process.exit(0);
  });
}
