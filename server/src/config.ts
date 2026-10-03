export interface AccessCode {
  /** Who this code belongs to; shown in logs and returned by /auth/check. */
  name: string;
  code: string;
}

export interface Config {
  port: number;
  anthropicApiKey: string;
  anthropicBaseUrl: string;
  accessCodes: AccessCode[];
  /** Models the app may request. */
  allowedModels: string[];
  maxTokens: number;
  /** Largest request body accepted, in bytes. Conversation history is resent on every turn. */
  maxBodyBytes: number;
  requestsPerMinute: number;
  requestsPerDay: number;
}

/**
 * ACCESS_CODES is a comma-separated list of name:code pairs, e.g. "jeph:k3J9...,sam:Qp2x...".
 * Codes must be at least 16 characters so they can't be guessed.
 */
export function parseAccessCodes(raw: string): AccessCode[] {
  const codes = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const sep = entry.indexOf(":");
      if (sep <= 0) throw new Error(`ACCESS_CODES entry "${entry}" must look like name:code`);
      return { name: entry.slice(0, sep).trim(), code: entry.slice(sep + 1).trim() };
    });
  for (const { name, code } of codes) {
    if (code.length < 16) throw new Error(`Access code for "${name}" must be at least 16 characters`);
  }
  if (new Set(codes.map((c) => c.code)).size !== codes.length) {
    throw new Error("ACCESS_CODES contains the same code twice");
  }
  return codes;
}

function int(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const anthropicApiKey = env.ANTHROPIC_API_KEY ?? "";
  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is required");
  const accessCodes = parseAccessCodes(env.ACCESS_CODES ?? "");
  if (accessCodes.length === 0) throw new Error("ACCESS_CODES is required (e.g. ACCESS_CODES=me:<long random code>)");

  return {
    port: int(env, "PORT", 8787),
    anthropicApiKey,
    anthropicBaseUrl: (env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/+$/, ""),
    accessCodes,
    allowedModels: (env.ALLOWED_MODELS ?? "claude-opus-5-5")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    maxTokens: int(env, "MAX_TOKENS", 16000),
    maxBodyBytes: int(env, "MAX_BODY_BYTES", 8 * 1024 * 1024),
    requestsPerMinute: int(env, "REQUESTS_PER_MINUTE", 20),
    requestsPerDay: int(env, "REQUESTS_PER_DAY", 500),
  };
}
