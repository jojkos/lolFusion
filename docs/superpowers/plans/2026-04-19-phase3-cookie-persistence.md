# Phase 3: Cookie Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist rotated `__Secure-1PSIDTS` cookies in Upstash Redis so the endpoint keeps working across low-traffic periods without manual re-pasting of env vars.

**Architecture:** Every request reads cookies from Upstash (via the REST API already wired up through `@vercel/kv`). If the stored PSIDTS is older than ~8 minutes, we rotate it synchronously using the library's `rotate_1psidts` primitive and write the fresh value back. Env vars (`GEMINI_PSID` / `GEMINI_PSIDTS`) become the *seed* — used only when Upstash is empty (first ever call, after a wipe).

**Tech stack:** same as Phase 2, plus direct HTTP calls to Upstash REST API from Python via `httpx` (already a transitive dep of `gemini-webapi`). No new npm/pip packages.

**Why this design:**
- `@vercel/kv` is Node-only; calling Upstash REST over HTTP is the portable path from Python.
- Upstash REST uses `KV_REST_API_URL` + `KV_REST_API_TOKEN` — env vars Vercel already injects because the project uses `@vercel/kv`.
- Synchronous rotation (not a background cron) means one request rarely does extra work, and we never have to reason about serverless cron timing. The 60s local-file dedup in `rotate_1psidts` won't apply on serverless (no shared fs), but rotating ~every 8 min from a single region is well under Google's rate limits.
- Storing a single JSON blob under one key is simpler than Redis hashes and good enough for this scale (one cookie set, one writer pattern).

---

## File Map

**Create:**
- `api/_lib/cookie_store.py` — tiny module: `load()`, `save()`, plus Upstash REST wrappers.

**Modify:**
- `api/generate-image.py` — swap env-var reads for `cookie_store.load()`; after successful `init()`, conditionally rotate and call `cookie_store.save()`.

**Unchanged:** `vercel.json`, `app/generate/page.tsx`, `requirements.txt`, existing cron.

**Top-level structure:** Vercel Python picks up `api/**/*.py` but treats files with leading underscore as *not* routes (Python import convention). So `api/_lib/cookie_store.py` is imported by `api/generate-image.py` but NOT deployed as its own HTTP endpoint.

---

## Task 1: Cookie store module

**Files:**
- Create: `api/_lib/__init__.py` (empty)
- Create: `api/_lib/cookie_store.py`

- [ ] **Step 1: Verify Upstash REST env vars are available on Vercel**

Check Vercel project → Settings → Environment Variables. You should see `KV_REST_API_URL` and `KV_REST_API_TOKEN` already populated (they were set when `@vercel/kv` was first attached). If not, connect the Redis marketplace integration from the Vercel dashboard.

- [ ] **Step 2: Create the module**

```python
# api/_lib/__init__.py
```

```python
# api/_lib/cookie_store.py
"""Tiny async wrapper around Upstash Redis REST API for cookie persistence.

Uses env vars KV_REST_API_URL + KV_REST_API_TOKEN (auto-injected by Vercel's
Redis/Upstash integration). No npm dependencies; pure httpx.
"""

import json
import os
import time
from typing import Optional, TypedDict

import httpx


KEY = "gemini:cookies"


class Cookies(TypedDict):
    psid: str
    psidts: str
    rotated_at: float  # unix epoch seconds


def _upstash_base() -> Optional[tuple[str, str]]:
    url = os.environ.get("KV_REST_API_URL")
    token = os.environ.get("KV_REST_API_TOKEN")
    if not url or not token:
        return None
    return url.rstrip("/"), token


async def load() -> Optional[Cookies]:
    """Return cached cookies from Upstash, or None if unavailable/empty."""
    creds = _upstash_base()
    if not creds:
        return None
    url, token = creds
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{url}/get/{KEY}",
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code != 200:
        return None
    raw = resp.json().get("result")
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict) or "psid" not in data or "psidts" not in data:
        return None
    return {
        "psid": data["psid"],
        "psidts": data["psidts"],
        "rotated_at": float(data.get("rotated_at", 0)),
    }


async def save(psid: str, psidts: str) -> bool:
    """Persist current cookies with rotated_at=now. Returns True on success."""
    creds = _upstash_base()
    if not creds:
        return False
    url, token = creds
    payload = json.dumps({"psid": psid, "psidts": psidts, "rotated_at": time.time()})
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{url}/set/{KEY}",
            headers={"Authorization": f"Bearer {token}"},
            content=payload,
        )
    return resp.status_code == 200


def seed_from_env() -> Optional[Cookies]:
    """Bootstrap path: read env vars when Upstash is empty."""
    psid = os.environ.get("GEMINI_PSID")
    psidts = os.environ.get("GEMINI_PSIDTS")
    if not psid or not psidts:
        return None
    return {"psid": psid, "psidts": psidts, "rotated_at": 0.0}
```

Rationale: no lock, no TTL — the cookies never expire on our side; we rely on Google's rotation endpoint to invalidate. One canonical key. 10s timeout is generous for a Redis REST call.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/__init__.py api/_lib/cookie_store.py
git commit -m "feat: add upstash-backed cookie persistence module"
```

---

## Task 2: Wire rotation into the generate handler

**Files:**
- Modify: `api/generate-image.py`

- [ ] **Step 1: Update imports and add rotation helper**

At the top, add:

```python
import sys
from pathlib import Path

# Allow "from _lib import ..." when Vercel runs this file
sys.path.insert(0, str(Path(__file__).parent))

from _lib import cookie_store

from gemini_webapi.utils import rotate_1psidts
```

- [ ] **Step 2: Replace the cookie-loading block in `_generate`**

Find:

```python
    psid = os.environ.get("GEMINI_PSID")
    psidts = os.environ.get("GEMINI_PSIDTS")
    if not psid or not psidts:
        return {"ok": False, "kind": "config", "error": "GEMINI_PSID/GEMINI_PSIDTS not set"}
```

Replace with:

```python
    stored = await cookie_store.load() or cookie_store.seed_from_env()
    if not stored:
        return {
            "ok": False,
            "kind": "config",
            "error": "No cookies in Upstash and GEMINI_PSID/GEMINI_PSIDTS env vars not set",
        }
    psid = stored["psid"]
    psidts = stored["psidts"]
    age = time.time() - stored["rotated_at"] if stored["rotated_at"] else float("inf")
```

And add `import time` at the top.

- [ ] **Step 3: After successful `init()`, rotate if stale and save back**

Find the block that currently looks like:

```python
    try:
        await client.init(timeout=60, auto_refresh=False)
    except Exception as e:
        return {"ok": False, "kind": "auth", "error": f"{type(e).__name__}: {e}"}
```

Extend it to rotate-and-save after init succeeds. Insert these lines immediately after the `try/except` block:

```python
    ROTATE_AFTER = 8 * 60  # 8 minutes — below Google's typical PSIDTS lifetime
    if age > ROTATE_AFTER:
        try:
            new_psidts = await rotate_1psidts(client.client, verbose=False)
        except Exception as e:
            return {"ok": False, "kind": "auth", "error": f"rotate failed: {type(e).__name__}: {e}"}
        effective_psidts = new_psidts or psidts
        await cookie_store.save(psid, effective_psidts)
    else:
        # still fresh; just make sure Upstash has the current values
        # (cheap on hot path, but avoids needing a separate bootstrap command)
        if stored["rotated_at"] == 0.0:  # seeded-from-env, not yet persisted
            await cookie_store.save(psid, psidts)
```

- [ ] **Step 4: Local verification — seeded path**

```bash
# clear the KV key locally if upstash CLI is available, or just ensure it's empty via Upstash console
# then run:
export GEMINI_PSID='<paste>'
export GEMINI_PSIDTS='<paste>'
export KV_REST_API_URL='<from vercel env pull>'
export KV_REST_API_TOKEN='<from vercel env pull>'
.venv-gemini/bin/python -c "
import asyncio, sys
sys.path.insert(0, 'api')
import importlib
mod = importlib.import_module('generate-image')
r = asyncio.run(mod._generate('a red apple'))
print({k: (f'<{len(v)} chars>' if k == 'image_base64' else v) for k, v in r.items()})
"
```

Expected: `ok: True`, `kind: "base64"`. Check Upstash console → `gemini:cookies` key now populated with a JSON blob containing `rotated_at`.

- [ ] **Step 5: Local verification — persisted path**

Run the same command again immediately. The `rotated_at` is < 8 min, so rotation should be skipped. Still produces an image.

- [ ] **Step 6: Commit**

```bash
git add api/generate-image.py
git commit -m "feat: read cookies from upstash, rotate on stale, persist after init"
```

---

## Task 3: Seed production Upstash

**One-time setup.** After deploying Phase 3, the first production request will bootstrap from env vars. If you ever wipe the key, the next request does the same. But you can also seed manually via Upstash console:

- [ ] **Step 1 (optional, for clean first run):** In Upstash console → the Redis DB attached to this Vercel project → CLI tab → run:

```
SET gemini:cookies {"psid":"<paste>","psidts":"<paste>","rotated_at":0}
```

Then the very first request skips the seed-from-env path entirely and rotates immediately.

- [ ] **Step 2: Consider removing env vars later**

Once Upstash has a self-refreshing cookie set and you've confirmed multiple successful generations across days, you can delete `GEMINI_PSID` and `GEMINI_PSIDTS` from Vercel env vars. Not urgent — they're a harmless fallback.

---

## Task 4: Deploy preview and verify persistence

- [ ] **Step 1: Push the branch**

```bash
git checkout -b phase3-cookie-persistence
# (assuming tasks 1-2 were done on main or a feature branch; rebase if needed)
git push -u origin phase3-cookie-persistence
```

- [ ] **Step 2: In the preview deployment, hit `/generate` twice**

First call: should generate an image AND write to `gemini:cookies` in Upstash.
Second call (within 8 min): should generate AND skip rotation (check Vercel function logs for "rotate skipped" — actually there's no explicit log; check Upstash `rotated_at` value is unchanged).

- [ ] **Step 3: Wait 10 min, call again**

Third call: should rotate (PSIDTS changed in Upstash).

- [ ] **Step 4: Verify the full loop in production**

Merge to main. One call right after deploy, one call ~10 min later. If both succeed and Upstash `rotated_at` advanced, persistence works.

---

## What could go wrong

- **Upstash cold-start latency**: REST calls add ~50-200ms per request. Irrelevant vs 30-90s generations.
- **Concurrent rotation**: two overlapping requests could both call `rotate_1psidts`. Google's rotate endpoint returns the same PSIDTS for repeated calls within a short window, and the race is harmless — last writer wins. If we see 429s in logs, add an Upstash `SET NX`-based mutex. Not planning for it preemptively (YAGNI).
- **`rotate_1psidts` returning None**: happens when the response didn't include a fresh PSIDTS. We handle this by keeping the old PSIDTS in the save call. If Google starts rejecting our PSID entirely, every request fails with `kind: "auth"` and you re-seed env vars.
- **Upstash env vars missing**: `cookie_store.load()` silently returns None → falls back to `seed_from_env` → endpoint works but no persistence. This is deliberately degrade-gracefully.

---

## Self-review

- Spec coverage: Phase 3 brief — "Vercel KV (or Upstash) for cookie persistence, small refresh strategy so PSIDTS doesn't expire between low-traffic periods" — covered by the load/rotate/save pipeline in Task 2. ✓
- Type consistency: `Cookies` TypedDict used by both `load()`, `save()`, and `seed_from_env()`. Handler reads `psid`/`psidts`/`rotated_at` fields consistently. ✓
- Placeholder scan: no TODOs or "fill in here". Every code block is complete. ✓
- Failure modes surfaced: auth / config / rotate-failed all produce distinct `kind` values. ✓
