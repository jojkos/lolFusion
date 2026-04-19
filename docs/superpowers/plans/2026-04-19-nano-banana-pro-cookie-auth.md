# Nano Banana Pro (Cookie-Auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `/api/generate-image` Python serverless function that calls Nano Banana Pro (`gemini-3-pro`) via `gemini-webapi` using the user's personal Google cookies, plus a `/generate` Next.js page that drives it.

**Architecture:** Python serverless function at `/api/generate-image.py` (Vercel auto-detects Python files in top-level `api/`, separate from Next App Router `app/api/*`). Reads `GEMINI_PSID`/`GEMINI_PSIDTS` from env, instantiates `GeminiClient(auto_refresh=False)`, sends prompt to `gemini-3-pro` (passed as raw string since the stable enum doesn't exist yet — GitHub issue #303), returns generated image as base64 data URL. Region-pinned to `iad1`. Next.js client page POSTs `{ prompt }` and renders result.

**Tech Stack:** Python 3.12 (Vercel default), `gemini-webapi==2.0.0`, `httpx` (transitive), Next.js 16 App Router (React 19), Tailwind v4.

**Risk-ordered execution:** We front-load auth verification because the cookie/IP binding issue is the single most likely point of failure. Don't build UI against a backend that can't authenticate.

---

## File Map

**Create:**
- `api/generate-image.py` — Python serverless handler (POST JSON → image base64)
- `requirements.txt` — one line: `gemini-webapi==2.0.0`
- `app/generate/page.tsx` — Next client component: textarea, button, preview, error
- `scripts/smoke-test-gemini-auth.py` — local one-shot auth check (throwaway, will commit but is disposable)
- `docs/gemini-cookies.md` — README section for grabbing cookies and setting Vercel env vars

**Modify:**
- `vercel.json` — add `regions: ["iad1"]` and Python function `maxDuration`

**Leave untouched:** `app/api/cron/generate/route.ts`, `@google/genai` usage, `@google/generative-ai` usage, Pollinations flow.

---

## Task 1: Local auth smoke test (fail fast if cookies don't work)

**Why first:** If the cookies you paste don't authenticate from your own laptop, nothing else matters. We skip Vercel entirely for this step.

**Files:**
- Create: `scripts/smoke-test-gemini-auth.py`

- [ ] **Step 1: Create a Python 3.12 venv at the repo root**

```bash
cd /Users/jonas/Work/lolFusion
python3.12 -m venv .venv-gemini
source .venv-gemini/bin/activate
pip install gemini-webapi==2.0.0
```

Expected: install completes, `gemini-webapi` and `httpx` resolved.

- [ ] **Step 2: Grab cookies from browser**

1. Open gemini.google.com in Chrome while signed in with your AI Pro account
2. DevTools → Application → Cookies → `https://gemini.google.com`
3. Copy the `Value` of `__Secure-1PSID` and `__Secure-1PSIDTS`
4. Export to shell:

```bash
export GEMINI_PSID='<paste __Secure-1PSID>'
export GEMINI_PSIDTS='<paste __Secure-1PSIDTS>'
```

- [ ] **Step 3: Write the smoke test**

```python
# scripts/smoke-test-gemini-auth.py
import asyncio
import os
import sys
from gemini_webapi import GeminiClient


async def main() -> int:
    psid = os.environ.get("GEMINI_PSID")
    psidts = os.environ.get("GEMINI_PSIDTS")
    if not psid or not psidts:
        print("ERROR: GEMINI_PSID and GEMINI_PSIDTS must be set", file=sys.stderr)
        return 2

    client = GeminiClient(psid, psidts, proxy=None)
    await client.init(timeout=30, auto_refresh=False)

    print("Authenticated. Available models:")
    try:
        models = await client.list_models()
        for m in models:
            print(f"  - {m}")
    except Exception as e:
        print(f"list_models failed: {e}")

    print("\nSending prompt to gemini-3-pro...")
    chat = client.start_chat(model="gemini-3-pro")
    response = await chat.send_message("Generate an image: a single red apple on a white background")

    images = getattr(response, "images", None) or getattr(response, "generated_images", None) or []
    print(f"Got {len(images)} image(s). Response text: {response.text[:200] if hasattr(response, 'text') else 'n/a'}")
    return 0 if images else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
```

- [ ] **Step 4: Run the smoke test**

```bash
source .venv-gemini/bin/activate
python scripts/smoke-test-gemini-auth.py
```

**Expected outcomes, and what to do:**

| Outcome | Meaning | Next step |
|---|---|---|
| Prints models + "Got 1 image(s)" | Auth works from laptop, Pro tier confirmed | Proceed to Task 2 |
| `Unable to auth with SID/SIDTS` / `Response status code was 401` | Cookies invalid or already rotated | Re-grab cookies, retry once |
| Auth OK, `list_models` works, but `gemini-3-pro` errors with "unknown model" | #303 issue — Pro not exposed via API for your account | **STOP.** Report back — we'd have to either wait on upstream or downgrade to Nano Banana 2. |
| Auth OK, prompt sends, but `images` is empty | Geo-block (CZ) hitting text-gen path | Model worked but image path is geo-gated. **STOP.** |
| Anything else | — | Report full stderr back |

- [ ] **Step 5: Commit the smoke test**

```bash
git add scripts/smoke-test-gemini-auth.py
git commit -m "chore: add gemini cookie-auth smoke test"
```

**CHECKPOINT: Do not proceed to Task 2 until Step 4 prints "Got 1 image(s)".**

---

## Task 2: Vercel config — region pin and Python function duration

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Update vercel.json**

Replace entire contents of `vercel.json` with:

```json
{
  "regions": ["iad1"],
  "functions": {
    "api/generate-image.py": {
      "maxDuration": 300,
      "memory": 1024
    }
  },
  "crons": [
    {
      "path": "/api/cron/generate",
      "schedule": "0 1 * * *"
    }
  ]
}
```

Rationale: `regions` at top level pins all functions to IAD (US East) so we never execute from `fra1`/`arn1` where Gemini image-gen is blocked. `functions."api/generate-image.py"` scopes duration and memory to only the Python handler. 300s covers 60s generations plus retry headroom.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: pin region to iad1, scope python function limits"
```

---

## Task 3: Python serverless handler

**Files:**
- Create: `api/generate-image.py`
- Create: `requirements.txt`

- [ ] **Step 1: Create requirements.txt**

```
gemini-webapi==2.0.0
```

- [ ] **Step 2: Create the handler**

```python
# api/generate-image.py
import asyncio
import base64
import json
import os
from http.server import BaseHTTPRequestHandler
from typing import Any

from gemini_webapi import GeminiClient
from gemini_webapi.exceptions import AuthError


MODEL_NAME = "gemini-3-pro"


def _json_response(handler: BaseHTTPRequestHandler, status: int, body: dict[str, Any]) -> None:
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


async def _generate(prompt: str) -> dict[str, Any]:
    psid = os.environ.get("GEMINI_PSID")
    psidts = os.environ.get("GEMINI_PSIDTS")
    if not psid or not psidts:
        return {"ok": False, "kind": "config", "error": "GEMINI_PSID/GEMINI_PSIDTS not set"}

    client = GeminiClient(psid, psidts, proxy=None)
    try:
        await client.init(timeout=30, auto_refresh=False)
    except AuthError as e:
        return {"ok": False, "kind": "auth", "error": str(e)}
    except Exception as e:
        return {"ok": False, "kind": "init", "error": f"{type(e).__name__}: {e}"}

    try:
        chat = client.start_chat(model=MODEL_NAME)
        response = await chat.send_message(prompt)
    except Exception as e:
        return {"ok": False, "kind": "generate", "error": f"{type(e).__name__}: {e}"}

    images = getattr(response, "images", None) or getattr(response, "generated_images", None) or []
    if not images:
        text_preview = (getattr(response, "text", "") or "")[:300]
        return {"ok": False, "kind": "empty", "error": "No images returned", "response_text": text_preview}

    img = images[0]
    # gemini-webapi image objects expose .save() / .url; fetch bytes via its save to BytesIO or url
    # We use the public url if available, otherwise .save returns bytes
    try:
        img_bytes = await img.save(path=None, filename=None, cookies=client.cookies)  # returns bytes when path=None
    except TypeError:
        # Some versions require a path; fall back to url passthrough
        return {"ok": True, "kind": "url", "image_url": getattr(img, "url", None)}

    b64 = base64.b64encode(img_bytes).decode("ascii")
    return {"ok": True, "kind": "base64", "image_base64": f"data:image/png;base64,{b64}"}


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length") or "0")
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            _json_response(self, 400, {"ok": False, "kind": "bad_request", "error": "invalid JSON"})
            return

        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            _json_response(self, 400, {"ok": False, "kind": "bad_request", "error": "prompt is required"})
            return

        result = asyncio.run(_generate(prompt))
        status = 200 if result.get("ok") else (401 if result.get("kind") == "auth" else 500)
        _json_response(self, status, result)

    def do_GET(self) -> None:
        _json_response(self, 405, {"ok": False, "error": "POST only"})
```

Note on the Vercel Python runtime convention: exporting a `handler` class that subclasses `BaseHTTPRequestHandler` is the documented pattern (see vercel.com/docs/functions/runtimes/python). The file location `api/generate-image.py` (top-level `api/`, not `app/api/`) is how Vercel co-locates Python functions with a Next.js project without conflicting with App Router routes.

- [ ] **Step 3: Structured error taxonomy — verify the `kind` field**

The response always includes a `kind` so the frontend and you can distinguish failure modes:
- `config` — env vars missing (your problem, local)
- `auth` — cookies rejected by Google (likely cookie-IP binding from `iad1`)
- `init` — library couldn't bootstrap (timeout, other)
- `generate` — send_message threw (model not available, rate limit, geo-block)
- `empty` — call succeeded but no image came back (often geo/text-only)
- `base64` / `url` — success paths

This is what you asked for in Phase 1 verdict.

- [ ] **Step 4: Commit**

```bash
git add api/generate-image.py requirements.txt
git commit -m "feat: add python serverless handler for nano banana pro"
```

---

## Task 4: Local Vercel-dev verification (before deploying)

- [ ] **Step 1: Install Vercel CLI if not present**

```bash
which vercel || npm i -g vercel
```

- [ ] **Step 2: Link project and pull env vars**

```bash
cd /Users/jonas/Work/lolFusion
vercel link
vercel env add GEMINI_PSID
vercel env add GEMINI_PSIDTS
# Paste values when prompted. Select "Development, Preview, Production" (all three).
vercel env pull .env.local
```

- [ ] **Step 3: Run vercel dev**

```bash
vercel dev
```

Expected: Vercel CLI starts the Next app on :3000 AND picks up the Python function. First request to the Python function installs `requirements.txt` into a virtualenv (takes ~30s the first time).

- [ ] **Step 4: Smoke test the deployed-like handler**

In a second terminal:

```bash
curl -sS -X POST http://localhost:3000/api/generate-image \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a red apple on a white background"}' | python -m json.tool | head -40
```

Expected: JSON with `"ok": true` and `"image_base64": "data:image/png;base64,..."`.

If this works locally but fails from Vercel once deployed, that's the cookie-IP issue — report back before trying to fix.

- [ ] **Step 5: No commit needed here (verification only).**

**CHECKPOINT: Do not proceed to Task 5 until Step 4 returns a base64 image.**

---

## Task 5: Next.js client page

**Files:**
- Create: `app/generate/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// app/generate/page.tsx
"use client";

import { useState } from "react";

type ApiResponse =
  | { ok: true; kind: "base64"; image_base64: string }
  | { ok: true; kind: "url"; image_url: string }
  | { ok: false; kind: string; error: string; response_text?: string };

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json()) as ApiResponse;
      setResult(data);
    } catch (err) {
      setResult({
        ok: false,
        kind: "network",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  const imageSrc =
    result && result.ok
      ? result.kind === "base64"
        ? result.image_base64
        : result.image_url
      : null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Nano Banana Pro</h1>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want..."
          rows={4}
          className="w-full rounded border border-gray-300 p-3 font-mono text-sm"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="self-start rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Generating (up to 60s)..." : "Generate"}
        </button>
      </form>

      {result && !result.ok && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">
          <div className="font-semibold">Error: {result.kind}</div>
          <div className="mt-1 text-red-900">{result.error}</div>
          {result.response_text && (
            <pre className="mt-2 overflow-auto text-xs text-gray-700">
              {result.response_text}
            </pre>
          )}
        </div>
      )}

      {imageSrc && (
        <img
          src={imageSrc}
          alt="Generated"
          className="w-full rounded border border-gray-200"
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify locally**

With `vercel dev` still running, open http://localhost:3000/generate, type "a red apple on white background", click Generate, wait ~30-60s. Image should render inline.

- [ ] **Step 3: Commit**

```bash
git add app/generate/page.tsx
git commit -m "feat: add /generate page for nano banana pro"
```

---

## Task 6: README / cookie-setup docs

**Files:**
- Create: `docs/gemini-cookies.md`

- [ ] **Step 1: Write the docs**

```markdown
# Gemini Cookie Setup (Nano Banana Pro)

The `/api/generate-image` endpoint authenticates to gemini.google.com via your personal Google account cookies. There is no Google API key — you paste browser cookies into Vercel env vars.

## Grabbing cookies

1. Sign into https://gemini.google.com with a Google account that has **AI Pro** (required for Nano Banana Pro / `gemini-3-pro`).
2. Open Chrome DevTools → **Application** → **Cookies** → `https://gemini.google.com`.
3. Copy the `Value` column for these two cookies:
   - `__Secure-1PSID`
   - `__Secure-1PSIDTS`

## Setting Vercel env vars

```bash
vercel env add GEMINI_PSID production
vercel env add GEMINI_PSIDTS production
# Repeat for "preview" and "development" if you want previews to work.
```

Or via the dashboard: Vercel project → Settings → Environment Variables → add `GEMINI_PSID` and `GEMINI_PSIDTS`.

## When generation starts failing

`__Secure-1PSIDTS` rotates every few minutes on Google's side. `auto_refresh=False` means we won't try to track that rotation — we rely on the cookie you pasted staying valid long enough for each request.

If the endpoint starts returning `{ "ok": false, "kind": "auth" }`, re-grab both cookies from the browser (after visiting gemini.google.com to trigger a fresh rotation) and update Vercel env vars.

Phase 3 of the plan is to persist rotated cookies in Upstash Redis so this step becomes automatic.

## Known failure modes

- `kind: "auth"` with fresh cookies → Google is rejecting the cookies from Vercel's IP range (known cookie/IP binding behavior). Options: enable Vercel Static IP, route through a residential proxy, or redeploy to a host where you can bring a consistent egress IP (Fly.io with dedicated IPv4).
- `kind: "empty"` with success → request reached Google but image generation was suppressed (usually a geo-block). Check that `vercel.json` `regions` is `iad1` and the function actually deployed there (see Vercel dashboard → Deployments → function logs).
- `kind: "generate"` with "unknown model" → your account doesn't have AI Pro, or the library's raw-string model selection isn't honored for your tier yet (GitHub issue HanaokaYuzu/Gemini-API#303).
```

- [ ] **Step 2: Commit**

```bash
git add docs/gemini-cookies.md
git commit -m "docs: add gemini cookie setup guide"
```

---

## Task 7: Deploy to Vercel preview and test

- [ ] **Step 1: Push to a preview branch**

```bash
git checkout -b nano-banana-pro
git push -u origin nano-banana-pro
```

Wait for Vercel preview deploy.

- [ ] **Step 2: Verify env vars exist on preview**

```bash
vercel env ls
```

Both `GEMINI_PSID` and `GEMINI_PSIDTS` should be listed for Preview.

- [ ] **Step 3: Hit the preview URL**

Open the preview URL → `/generate` → enter "a red apple on a white background" → Generate.

**Expected outcomes:**

| Result | Meaning | Action |
|---|---|---|
| Image renders | Cookie/IP binding not enforced for you, or lucky | Proceed |
| `kind: "auth"` | Cookies rejected from Vercel IP (the known risk) | **STOP.** Report back. Options: Static IP, proxy, or move to Fly.io. |
| `kind: "empty"` | Region not actually iad1, or model gated | Check deployment region in Vercel logs |
| `kind: "generate"` "unknown model" | #303 bites | **STOP.** Downgrade to Nano Banana 2 (`nano-banana` model string) or wait on upstream. |

- [ ] **Step 4: If successful, merge**

```bash
# Don't merge until I confirm — but the command is:
# git checkout main && git merge --ff-only nano-banana-pro && git push
```

**CHECKPOINT: Stop after Step 3. Report back with outcome before merging.**

---

## What we deliberately didn't build

- **No KV-backed cookie rotation.** Phase 3. We're checking if auth works at all first.
- **No tests.** Strict TDD against a cookie-authenticated, geo-sensitive, cloud-IP-suspicious external service produces tests that lie (mocks) or flake (real calls from CI). Verification here is by actual curl/browser check at each checkpoint.
- **No integration with the existing daily fusion cron.** The cron already uses Pollinations — leave it alone. If Nano Banana Pro works out, a separate plan swaps it in.
- **No image upload to Vercel Blob.** v1 inlines base64 since the image is produced, rendered, and discarded in the same request. Blob adds a round-trip with no user-visible benefit yet.

---

## Self-review

- Spec coverage: all of Phase 2 requirements (endpoint, env-var cookies, `auto_refresh=False`, React UI, `vercel.json`, README) mapped to tasks 1–7. ✓
- Placeholder scan: every code step has complete code. Expected command outputs listed. ✓
- Type consistency: `ApiResponse` shape in `page.tsx` matches the `kind` taxonomy returned by `generate-image.py`. ✓

---

## Execution options

1. **Subagent-driven** — I dispatch one subagent per task, review output between each.
2. **Inline execution** — I run through tasks in this session with checkpoints.

For this plan I'd recommend **inline** because every task has a human-verification checkpoint (browser cookies, smoke test output, preview URL) that a subagent can't do for you anyway.
