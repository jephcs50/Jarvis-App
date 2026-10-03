import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";
import { createHandler } from "../src/app.ts";
import { loadConfig, parseAccessCodes, type Config } from "../src/config.ts";
import { RateLimiter } from "../src/rateLimit.ts";

const CODE = "test-code-0123456789abcdef";
const REAL_KEY = "sk-ant-real-secret";

interface Seen {
  url: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

let upstream: Server;
let proxy: Server;
let proxyUrl: string;
let upstreamUrl: string;
let seen: Seen[] = [];
let logs: string[] = [];

function listen(server: Server): Promise<string> {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)),
  );
}

function config(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig({ ANTHROPIC_API_KEY: REAL_KEY, ACCESS_CODES: `jeph:${CODE}` }),
    ...overrides,
  };
}

before(async () => {
  // Stand-in for api.anthropic.com that records what it receives.
  upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    seen.push({ url: req.url ?? "", headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
    res.writeHead(200, { "content-type": "application/json", "request-id": "req_123" });
    res.end(
      JSON.stringify({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: "At your service." }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 3, output_tokens: 4 },
      }),
    );
  });
  upstreamUrl = await listen(upstream);
  const handler = createHandler(config({ anthropicBaseUrl: upstreamUrl, requestsPerMinute: 5 }), {
    fetch,
    log: (l) => logs.push(l),
  });
  proxy = createServer((req, res) => void handler(req, res));
  proxyUrl = await listen(proxy);
});

after(() => {
  upstream.close();
  proxy.close();
});

beforeEach(() => {
  seen = [];
  logs = [];
});

const client = (apiKey = CODE) => new Anthropic({ apiKey, baseURL: proxyUrl, maxRetries: 0 });

const request = {
  model: "claude-opus-5-5",
  max_tokens: 1000,
  messages: [{ role: "user" as const, content: "Hello" }],
};

describe("proxy", () => {
  test("forwards an SDK beta request with the real key, never the access code", async () => {
    const message = await client().beta.messages.create({
      ...request,
      betas: ["compact-2026-01-12"],
      tools: [{ name: "remember", input_schema: { type: "object", properties: {} } }],
    });
    assert.equal(message.content[0].type === "text" && message.content[0].text, "At your service.");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "/v1/messages?beta=true");
    assert.equal(seen[0].headers["x-api-key"], REAL_KEY);
    assert.equal(seen[0].headers["anthropic-beta"], "compact-2026-01-12");
    assert.ok(seen[0].headers["anthropic-version"]);
    assert.ok(!JSON.stringify(seen[0].headers).includes(CODE));
    assert.ok(logs.some((l) => l.includes("user=jeph")));
  });

  test("rejects a wrong access code as an authentication error", async () => {
    await assert.rejects(client("wrong-code-wrong-code-wrong").messages.create(request), Anthropic.AuthenticationError);
    assert.equal(seen.length, 0);
  });

  test("rejects models outside the allowlist", async () => {
    await assert.rejects(
      client().messages.create({ ...request, model: "claude-fable-5-1" }),
      (e) => e instanceof Anthropic.BadRequestError && /Model must be one of/.test(e.message),
    );
    assert.equal(seen.length, 0);
  });

  test("caps max_tokens", async () => {
    // Raw request: the SDK itself refuses very large non-streaming max_tokens before sending.
    const res = await fetch(`${proxyUrl}/v1/messages`, {
      method: "POST",
      headers: { "x-api-key": CODE, "content-type": "application/json" },
      body: JSON.stringify({ ...request, max_tokens: 64000 }),
    });
    assert.equal(res.status, 400);
    assert.equal(seen.length, 0);
  });

  test("blocks server tools", async () => {
    await assert.rejects(
      client().messages.create({ ...request, tools: [{ type: "web_search_20260209", name: "web_search" }] }),
      Anthropic.BadRequestError,
    );
    assert.equal(seen.length, 0);
  });

  test("only proxies /v1/messages", async () => {
    const res = await fetch(`${proxyUrl}/v1/models`, { headers: { "x-api-key": CODE } });
    assert.equal(res.status, 404);
  });

  test("/auth/check reports who the code belongs to", async () => {
    const ok = await fetch(`${proxyUrl}/auth/check`, { headers: { "x-api-key": CODE } });
    assert.deepEqual(await ok.json(), { ok: true, name: "jeph" });
    const bad = await fetch(`${proxyUrl}/auth/check`, { headers: { "x-api-key": "nope" } });
    assert.equal(bad.status, 401);
  });

  test("answers CORS preflight", async () => {
    const res = await fetch(`${proxyUrl}/v1/messages`, {
      method: "OPTIONS",
      headers: { "access-control-request-headers": "x-api-key,x-stainless-os" },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-headers"), "x-api-key,x-stainless-os");
  });

  test("rate limits per user", async () => {
    const handler = createHandler(config({ anthropicBaseUrl: upstreamUrl, requestsPerMinute: 2 }), {
      fetch,
      log: () => {},
    });
    const limited = createServer((req, res) => void handler(req, res));
    const limitedUrl = await listen(limited);
    try {
      const c = new Anthropic({ apiKey: CODE, baseURL: limitedUrl, maxRetries: 0 });
      await c.messages.create(request);
      await c.messages.create(request);
      await assert.rejects(c.messages.create(request), (e) => e instanceof Anthropic.RateLimitError && e.headers.get("retry-after") !== null);
    } finally {
      limited.close();
    }
  });
});

describe("config", () => {
  test("parses name:code pairs and rejects short or duplicate codes", () => {
    assert.deepEqual(parseAccessCodes(`a:${CODE}, b:${CODE}x`), [
      { name: "a", code: CODE },
      { name: "b", code: `${CODE}x` },
    ]);
    assert.throws(() => parseAccessCodes("a:short"), /at least 16/);
    assert.throws(() => parseAccessCodes(`a:${CODE},b:${CODE}`), /same code/);
    assert.throws(() => parseAccessCodes("nocolon"), /name:code/);
  });

  test("requires the API key and at least one access code", () => {
    assert.throws(() => loadConfig({ ACCESS_CODES: `a:${CODE}` }), /ANTHROPIC_API_KEY/);
    assert.throws(() => loadConfig({ ANTHROPIC_API_KEY: "k" }), /ACCESS_CODES/);
  });
});

describe("rate limiter", () => {
  test("enforces the daily cap and resets the next UTC day", () => {
    let now = Date.parse("2026-10-03T12:00:00Z");
    const limiter = new RateLimiter(100, 2, () => now);
    assert.equal(limiter.take("a"), null);
    assert.equal(limiter.take("a"), null);
    assert.equal(limiter.take("a"), 12 * 3600);
    assert.equal(limiter.take("b"), null, "other users are unaffected");
    now = Date.parse("2026-10-04T00:00:01Z");
    assert.equal(limiter.take("a"), null);
  });
});
