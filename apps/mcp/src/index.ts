import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import postgres from "postgres";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "./server.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

const sql = postgres(required("DATABASE_URL"), { max: 5, prepare: false });
const jwtSecret = required("MISSION_JWT_SECRET");
const accessToken = process.env.MCP_ACCESS_TOKEN;
const port = Number(process.env.PORT ?? 8791);
const host = process.env.HOST ?? "127.0.0.1";

function authorized(header: string | undefined): boolean {
  if (!accessToken) return true;
  const given = Buffer.from(header?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(accessToken);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const http = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
    return;
  }
  if (!req.url?.startsWith("/mcp")) {
    res.writeHead(404).end();
    return;
  }
  if (!authorized(req.headers.authorization)) {
    res.writeHead(401).end();
    return;
  }
  // Mode sans état : un serveur et un transport par requête.
  const server = buildMcpServer(sql, jwtSecret);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "mcp_request_failed", err: (err as Error).message }));
    if (!res.headersSent) res.writeHead(500).end();
  }
});

http.listen(port, host, () => {
  console.log(JSON.stringify({ level: "info", msg: "gyna_mcp_listening", host, port }));
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    http.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}
