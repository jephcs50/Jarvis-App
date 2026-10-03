# Jarvis server

A small proxy that keeps your Anthropic API key off the phone. The app sends its Claude requests here with a personal **access code**. The server checks the code, applies limits, swaps in the real API key and forwards the request to Anthropic.

- No runtime dependencies. Node 22.18+ runs the TypeScript directly.
- Only `POST /v1/messages` is forwarded, and only for the allowed model(s) with `max_tokens` ≤ 16000. Server tools (web search, code execution), MCP and fast mode are refused, so a leaked code can't run up unusual costs.
- Per-person limits: 20 requests/minute and 500/day by default.
- Each person gets their own code. Remove a code from `ACCESS_CODES` and restart to revoke it.

## Configure

| Variable | Required | Default | |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | | Your key from console.anthropic.com |
| `ACCESS_CODES` | yes | | `name:code` pairs, comma-separated. Codes must be 16+ characters |
| `PORT` | | `8787` | |
| `ALLOWED_MODELS` | | `claude-opus-5-5` | Comma-separated |
| `MAX_TOKENS` | | `16000` | |
| `REQUESTS_PER_MINUTE` | | `20` | Per access code |
| `REQUESTS_PER_DAY` | | `500` | Per access code, resets at midnight UTC |

Generate a code:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Then set e.g. `ACCESS_CODES=jeph:<code>,sam:<another code>`.

## Deploy

**Render (free tier).** In the Render dashboard choose **New → Blueprint**, pick this repo (it uses `render.yaml` at the root), and fill in `ANTHROPIC_API_KEY` and `ACCESS_CODES`. Your server URL will look like `https://jarvis-server-xxxx.onrender.com`. Free instances sleep when idle, so the first message after a quiet spell can take up to a minute.

**Anywhere with Docker** (Fly.io, Railway, a VPS, …):

```bash
docker build -t jarvis-server server
docker run -p 8787:8787 -e ANTHROPIC_API_KEY=sk-ant-... -e ACCESS_CODES=me:<code> jarvis-server
```

Always serve it over **HTTPS** (the hosts above do this for you), because the access code travels in a request header.

## Run locally

```bash
cd server
ANTHROPIC_API_KEY=sk-ant-... ACCESS_CODES=me:<code> npm start
curl localhost:8787/health
```

## Endpoints

- `GET /health`: liveness check, no auth.
- `GET /auth/check`: returns `{ "name": ... }` for a valid code (the app's **Test connection** button uses it).
- `POST /v1/messages`: forwarded to Anthropic.

Errors use the Anthropic API's error format, so the app shows the right message (bad code → authentication error, limits → rate limit error).

## Develop

```bash
npm install
npm test          # node:test suite, drives the proxy with the real Anthropic SDK against a fake upstream
npm run typecheck
```

Usage limits live in memory and reset when the server restarts. That's fine for a handful of people. Move them to Redis or a database if you open it up more widely.
