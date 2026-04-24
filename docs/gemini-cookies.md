# Gemini Cookie Setup (Nano Banana Pro)

The `/api/generate-image` endpoint authenticates to gemini.google.com via your personal Google account cookies. There is **no Google API key** — you paste browser cookies into Vercel env vars.

## Picking a provider

The daily fusion cron supports two image backends, selected by the `IMAGE_PROVIDER` env var:

- `pollinations` (default) — fast, text-only, via `gen.pollinations.ai` with `gpt-image-2`. Requires `POLLINATIONS_API_KEY`.
- `gemini` — Nano Banana Pro via cookie auth (this doc). Supports reference images; takes 30–90s per generation.

`/generate` has a radio to pick either one ad-hoc regardless of the env var.

## Grabbing cookies

1. Sign into https://gemini.google.com with a Google account that has **AI Pro** (required for Nano Banana Pro / `gemini-3-pro`).
2. Open Chrome DevTools → **Application** → **Cookies** → `https://gemini.google.com`.
3. Copy the `Value` column for these two cookies:
   - `__Secure-1PSID`
   - `__Secure-1PSIDTS`

## Setting Vercel env vars

Via CLI:

```bash
vercel env add GEMINI_PSID production
vercel env add GEMINI_PSIDTS production
# Repeat with "preview" for preview deployments.
```

Or via dashboard: Vercel project → Settings → Environment Variables → add `GEMINI_PSID` and `GEMINI_PSIDTS`.

## Why no auto-refresh

The `gemini-webapi` library normally spawns a background task to rotate `__Secure-1PSIDTS` every ~10 minutes. That's useless on stateless serverless — the background task dies at the end of each request. We use `auto_refresh=False` and rely on the cookie you pasted remaining valid per request.

Phase 3 of the plan adds Upstash-backed cookie persistence so rotated cookies stick across invocations. Until then, if generation starts failing with `kind: "auth"`, re-grab cookies (after visiting gemini.google.com to trigger a fresh rotation) and update Vercel env vars.

## Failure-mode cheat sheet

The endpoint returns a discriminated `kind` field. Here's how to read it:

| `kind` | HTTP | Meaning | Fix |
|---|---|---|---|
| `config` | 500 | `GEMINI_PSID`/`GEMINI_PSIDTS` not set | Set env vars in Vercel dashboard |
| `auth` | 401 | Google rejected the cookies | Re-grab cookies. If it keeps happening from Vercel but works locally, it's cookie/IP binding — see below. |
| `generate` | 502 | Model call threw (e.g. "unknown model") | Your account may not have AI Pro, or model naming changed upstream |
| `empty` | 502 | Request succeeded but no image came back | Geo-block. Confirm `vercel.json` pins `iad1` and the function actually deployed there |
| `base64` | 200 | Success, image inlined as data URL | — |
| `url` | 200 | Success, but we couldn't save bytes; image URL returned | Fine — the lh3.googleusercontent.com URL is publicly accessible |

## Cookie / IP binding (the big known risk)

Google binds `__Secure-1PSID` to the IP range that minted it. Cookies grabbed from your Czech residential connection and replayed from a Vercel `iad1` IP may be rejected. Mitigations:

1. **Try Vercel Static IP** (paid add-on) — pins egress to a consistent address.
2. **Route through a residential proxy** — QuotaGuard, etc.
3. **Host elsewhere** — Fly.io with a dedicated IPv4 in `ord`/`iad`, or a small VPS.

If the local smoke test ([scripts/smoke-test-gemini-auth.py](../scripts/smoke-test-gemini-auth.py)) works on your laptop but the Vercel deployment returns `kind: "auth"`, you've hit this. Don't try to fix it in code — it's an infrastructure problem.

## Local development

```bash
# One-time setup
python3.13 -m venv .venv-gemini
.venv-gemini/bin/pip install -r requirements.txt

# Per-session
export GEMINI_PSID='<paste>'
export GEMINI_PSIDTS='<paste>'
.venv-gemini/bin/python scripts/smoke-test-gemini-auth.py
```

Successful run prints `SUCCESS: image saved (...)` and exits 0.
