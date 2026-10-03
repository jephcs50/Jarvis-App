import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { AccessCode, Config } from "./config.ts";
import { RateLimiter } from "./rateLimit.ts";

export interface Deps {
  fetch: typeof fetch;
  log: (line: string) => void;
  now?: () => number;
}

type ErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "not_found_error"
  | "request_too_large"
  | "rate_limit_error"
  | "api_error";

/** Request headers passed through to Anthropic. Everything else (incl. the access code) is dropped. */
const FORWARDED_REQUEST_HEADERS = ["anthropic-version", "anthropic-beta", "content-type"];
/** Response headers passed back to the app. */
const FORWARDED_RESPONSE_HEADERS = ["content-type", "request-id", "retry-after"];
/** Top-level request fields the app never needs and that can run up costs. */
const BLOCKED_FIELDS = ["mcp_servers", "container", "speed"];

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time lookup of the presented code against every configured code. */
export function findUser(codes: AccessCode[], presented: string | undefined): AccessCode | null {
  if (!presented) return null;
  const given = digest(presented);
  let match: AccessCode | null = null;
  for (const entry of codes) {
    if (timingSafeEqual(given, digest(entry.code))) match = entry;
  }
  return match;
}

/** Returns a reason the request should be refused, or null if it's acceptable. */
export function validateMessageRequest(body: unknown, config: Config): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return "Body must be a JSON object.";
  const req = body as Record<string, unknown>;
  if (typeof req.model !== "string" || !config.allowedModels.includes(req.model)) {
    return `Model must be one of: ${config.allowedModels.join(", ")}.`;
  }
  if (typeof req.max_tokens !== "number" || req.max_tokens > config.maxTokens) {
    return `max_tokens must be a number no greater than ${config.maxTokens}.`;
  }
  for (const field of BLOCKED_FIELDS) {
    if (field in req) return `"${field}" is not allowed through this server.`;
  }
  if (req.tools !== undefined) {
    if (!Array.isArray(req.tools)) return "tools must be an array.";
    // Only the app's own (client) tools; no server tools such as web search or code execution.
    for (const tool of req.tools) {
      const type = (tool as { type?: unknown } | null)?.type;
      if (type !== undefined && type !== "custom") return `Tool type "${String(type)}" is not allowed.`;
    }
  }
  return null;
}

class BodyTooLarge extends Error {}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function setCors(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  // The SDK sends a set of x-stainless-* headers; reflect whatever the browser asks for.
  res.setHeader(
    "access-control-allow-headers",
    req.headers["access-control-request-headers"] ?? "content-type, x-api-key, anthropic-version, anthropic-beta",
  );
  res.setHeader("access-control-max-age", "86400");
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

/** Errors in the Anthropic API's shape, so the app's SDK raises the matching typed error. */
function sendError(res: ServerResponse, status: number, type: ErrorType, message: string, headers?: Record<string, string>) {
  sendJson(res, status, { type: "error", error: { type, message } }, headers);
}

function presentedCode(req: IncomingMessage): string | undefined {
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey) return apiKey;
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return undefined;
}

export function createHandler(config: Config, deps: Deps) {
  const limiter = new RateLimiter(config.requestsPerMinute, config.requestsPerDay, deps.now);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const started = Date.now();
    const url = new URL(req.url ?? "/", "http://localhost");
    let user = "-";
    res.on("finish", () => {
      deps.log(`${req.method} ${url.pathname} ${res.statusCode} user=${user} ${Date.now() - started}ms`);
    });

    setCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    const isMessages = req.method === "POST" && url.pathname === "/v1/messages";
    const isAuthCheck = req.method === "GET" && url.pathname === "/auth/check";
    if (!isMessages && !isAuthCheck) {
      sendError(res, 404, "not_found_error", "Not found.");
      return;
    }

    const account = findUser(config.accessCodes, presentedCode(req));
    if (!account) {
      sendError(res, 401, "authentication_error", "Invalid access code.");
      return;
    }
    user = account.name;

    if (isAuthCheck) {
      sendJson(res, 200, { ok: true, name: account.name });
      return;
    }

    const wait = limiter.take(account.name);
    if (wait !== null) {
      sendError(res, 429, "rate_limit_error", `Too many requests. Try again in ${wait}s.`, {
        "retry-after": String(wait),
      });
      return;
    }

    let raw: Buffer;
    try {
      raw = await readBody(req, config.maxBodyBytes);
    } catch (e) {
      if (e instanceof BodyTooLarge) {
        sendError(res, 413, "request_too_large", "Request body is too large.");
      } else {
        sendError(res, 400, "invalid_request_error", "Could not read request body.");
      }
      return;
    }

    let body: unknown;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      sendError(res, 400, "invalid_request_error", "Body must be valid JSON.");
      return;
    }
    const problem = validateMessageRequest(body, config);
    if (problem) {
      sendError(res, 400, "invalid_request_error", problem);
      return;
    }

    const headers: Record<string, string> = { "x-api-key": config.anthropicApiKey };
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = req.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    headers["content-type"] ??= "application/json";
    headers["anthropic-version"] ??= "2023-06-01";

    let upstream: Response;
    try {
      upstream = await deps.fetch(`${config.anthropicBaseUrl}/v1/messages${url.search}`, {
        method: "POST",
        headers,
        body: new Uint8Array(raw),
      });
    } catch (e) {
      deps.log(`upstream error: ${e instanceof Error ? e.message : String(e)}`);
      sendError(res, 502, "api_error", "Could not reach the Anthropic API.");
      return;
    }

    const outHeaders: Record<string, string> = {};
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) outHeaders[name] = value;
    }
    res.writeHead(upstream.status, outHeaders);
    if (!upstream.body) {
      res.end();
      return;
    }
    // Stream the response through as it arrives (works for streaming and non-streaming requests).
    Readable.fromWeb(upstream.body as WebReadableStream<Uint8Array>)
      .on("error", () => res.destroy())
      .pipe(res);
  };
}
