import { createServer } from "node:http";
import { createHandler } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const handler = createHandler(config, {
  fetch,
  log: (line) => console.log(`${new Date().toISOString()} ${line}`),
});

const server = createServer((req, res) => {
  handler(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "Internal error." } }));
  });
});

server.listen(config.port, () => {
  console.log(
    `Jarvis server listening on :${config.port} · ${config.accessCodes.length} access code(s) · models: ${config.allowedModels.join(", ")}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
