# Phase 4: Daily Fusion Cron Uses Nano Banana Pro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** Swap the Pollinations.ai image call in the daily champion-fusion cron for our cookie-authenticated Nano Banana Pro endpoint, with both splash images passed as visual references.

**Architecture:** Extend `api/generate-image.py` to accept an optional `reference_images: string[]` field (array of base64 data URLs). The Python handler writes them to `/tmp`, passes them as `files=...` to `client.generate_content()`. The existing Node cron (`app/api/cron/generate/route.ts`) keeps its text-refinement flow with `gemini-3-flash-preview` (that path stays on the official API key), but replaces the Pollinations URL fetch with a POST to our own endpoint. Everything downstream — Blob upload, KV state — is unchanged.

**Tech stack:** Next.js Node serverless (existing cron) calling Python serverless (our endpoint) via internal HTTPS on the same Vercel deployment. `VERCEL_URL` env var gives the host.

**Why this split and not a full Python rewrite:** Blob upload, KV writes, and DDragon fetch are already working from Node. Porting them to Python adds dependencies (no first-party Vercel Blob Python SDK) with zero user-visible benefit. One internal HTTP call is the smaller delta.

---

## File map

**Modify:**
- `api/generate-image.py` — accept optional `reference_images` in POST body; write bytes to tmp; pass to `generate_content(files=...)`.
- `app/api/cron/generate/route.ts` — delete the Pollinations block, call `/api/generate-image` instead, decode base64 response, keep Blob/KV writes as-is.

**Unchanged:** `vercel.json`, `requirements.txt`, `app/generate/page.tsx`, cookie store, docs.

---

## Task 1: Extend Python handler with reference images

**Files:** modify `api/generate-image.py`.

- [ ] **Step 1: Update the request parsing and `_generate` signature**

In `do_POST`, after the existing `prompt` parse, add:

```python
refs = body.get("reference_images") or []
if not isinstance(refs, list) or not all(isinstance(x, str) for x in refs):
    _json_response(self, 400, {"ok": False, "kind": "bad_request", "error": "reference_images must be string[]"})
    return
```

Change the call site:

```python
result = asyncio.run(_generate(prompt, refs))
```

Change the function signature:

```python
async def _generate(prompt: str, reference_images: list[str] = None) -> dict[str, Any]:
```

- [ ] **Step 2: Decode reference images and pass to generate_content**

Inside `_generate`, just before `client.generate_content`, decode each data URL into bytes and write to tmp:

```python
    ref_paths: list[str] = []
    tmpdir_obj = None
    if reference_images:
        tmpdir_obj = tempfile.TemporaryDirectory()
        tmpdir = tmpdir_obj.name
        for i, data_url in enumerate(reference_images):
            # Accept both "data:image/...;base64,XXXX" and raw base64
            _, _, b64 = data_url.rpartition(",")
            b64 = b64 or data_url
            try:
                raw = base64.b64decode(b64, validate=False)
            except Exception:
                if tmpdir_obj:
                    tmpdir_obj.cleanup()
                return {
                    "ok": False,
                    "kind": "bad_request",
                    "error": f"reference_images[{i}] is not valid base64",
                }
            p = Path(tmpdir) / f"ref_{i}.jpg"
            p.write_bytes(raw)
            ref_paths.append(str(p))

    try:
        response = await client.generate_content(
            prompt,
            model=Model.BASIC_PRO,
            files=ref_paths or None,
        )
    except Exception as e:
        if tmpdir_obj:
            tmpdir_obj.cleanup()
        return {"ok": False, "kind": "generate", "error": f"{type(e).__name__}: {e}"}
    finally:
        if tmpdir_obj:
            tmpdir_obj.cleanup()
```

Note: keep the rest of `_generate` (image extraction, base64 encode, return) unchanged.

- [ ] **Step 3: Commit**

```bash
git add api/generate-image.py
git commit -m "feat: accept reference_images for multimodal image generation"
```

- [ ] **Step 4: Local smoke test with two reference images**

```bash
set -a; source .env; set +a
.venv-gemini/bin/python -c "
import asyncio, base64, sys
sys.path.insert(0, 'api')
import importlib
mod = importlib.import_module('generate-image')

# Grab two public images for the test
import urllib.request
def fetch_b64(url):
    data = urllib.request.urlopen(url).read()
    return 'data:image/jpeg;base64,' + base64.b64encode(data).decode('ascii')

a = fetch_b64('https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_0.jpg')
b = fetch_b64('https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg')
r = asyncio.run(mod._generate('Generate a splash art fusion of these two champions.', [a, b]))
print({k: (f'<{len(v)} chars>' if k == 'image_base64' else v) for k, v in r.items()})
"
```

Expected: `ok: True`, `kind: "base64"`, fresh image produced.

---

## Task 2: Swap cron from Pollinations to our endpoint

**Files:** modify `app/api/cron/generate/route.ts`.

- [ ] **Step 1: Remove the Pollinations block and call the Python endpoint**

Find the block starting with `// 5. Image Generation (Pollinations.ai )` and replace it (through the `const imageBuffer = ...` line) with:

```ts
    // 5. Image Generation (Nano Banana Pro via cookie-authenticated endpoint)
    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    console.log("Calling /api/generate-image...");
    const genRes = await fetch(`${origin}/api/generate-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: refinedPrompt.slice(0, 4000),
        reference_images: [
          `data:image/jpeg;base64,${base64A}`,
          `data:image/jpeg;base64,${base64B}`,
        ],
      }),
    });

    if (!genRes.ok) {
      const errBody = await genRes.text();
      throw new Error(`generate-image failed: ${genRes.status} ${errBody.slice(0, 500)}`);
    }

    const genJson = (await genRes.json()) as
      | { ok: true; kind: "base64"; image_base64: string }
      | { ok: true; kind: "url"; image_url: string }
      | { ok: false; kind: string; error: string };

    if (!genJson.ok) {
      throw new Error(`generate-image kind=${genJson.kind}: ${genJson.error}`);
    }

    let imageBuffer: Buffer;
    if (genJson.kind === "base64") {
      const comma = genJson.image_base64.indexOf(",");
      const b64 = comma >= 0 ? genJson.image_base64.slice(comma + 1) : genJson.image_base64;
      imageBuffer = Buffer.from(b64, "base64");
    } else {
      const imgRes = await fetch(genJson.image_url);
      if (!imgRes.ok) throw new Error(`Fetching image_url failed: ${imgRes.status}`);
      imageBuffer = Buffer.from(await imgRes.arrayBuffer());
    }
```

Note: the Blob upload block that follows (`const blob = await put(...)`) already uses `imageBuffer`, so nothing else needs to change in that path.

- [ ] **Step 2: Delete the now-unused `IMAGE_MODEL` constant and Pollinations env**

At the top of the file, remove `const IMAGE_MODEL = "gptimage";`. The `POLLINATIONS_API_KEY` env var reference is inside the block we already deleted, so nothing to do.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/generate/route.ts
git commit -m "feat: daily fusion cron uses nano banana pro instead of pollinations"
```

---

## Task 3: Manual-trigger the cron and verify

The cron endpoint accepts a `?secret=<CRON_SECRET or ADMIN_SECRET>` query param for auth. We'll push to preview, trigger manually, check Blob.

- [ ] **Step 1: Push branch**

```bash
git push -u origin phase4-cron-nano-banana
```

- [ ] **Step 2: Manually trigger on preview**

```bash
# From your browser (since preview has deployment protection), OR from terminal with ADMIN_SECRET:
curl -sS "https://<preview-url>/api/cron/generate?secret=<ADMIN_SECRET>" \
  --max-time 300 | python3 -m json.tool
```

Expected shape:

```json
{
  "success": true,
  "data": {
    "champA": "...",
    "champB": "...",
    "theme": "...",
    "imageUrl": "https://<blob-host>/fusion-2026-04-20.png?t=...",
    "date": "2026-04-20"
  }
}
```

Open `imageUrl` in a browser. It should be a Nano Banana Pro fusion of the two champions in the chosen theme.

- [ ] **Step 3: If failing, check the `kind`**

- `kind: "bad_request"` → reference image encoding bug (Task 1 Step 2)
- `kind: "auth"` → Upstash cookies expired; hit `/generate` once from the browser to rotate
- `kind: "generate"` → prompt routed to text-only response again; re-check refinement output in Vercel logs
- Throw from the fetch itself → `VERCEL_URL` or internal routing issue; fall back to hardcoded preview host for the test

- [ ] **Step 4: Merge**

After one successful manual trigger on preview, merge to main. The scheduled `0 1 * * *` cron will run on its own that night and you can verify the next morning.

---

## What we deliberately didn't build

- **Internal auth on `/api/generate-image`.** The endpoint is still open to the internet on the deployment URL. Fine for a prototype, but if abuse shows up, add a shared-secret header check that the cron passes and the browser `/generate` page doesn't need. Small follow-up.
- **Retries when `kind: "empty"`.** If Gemini routes to text-only, we just fail the cron. In practice the refined prompt from `gemini-3-flash-preview` is already image-oriented. If we see this fire in production logs, auto-retry with `"Generate an image: "` prepended once.
- **Tests.** Same reason as Phase 2: strict TDD against a live cookie-authenticated, geo-sensitive service doesn't produce useful tests. Manual trigger + Blob inspection is the verification loop.
- **Rollback path.** If Nano Banana Pro starts failing mid-week, the revert is `git revert <commit>` on this one commit. Pollinations code comes back intact. No data migration.

---

## Self-review

- Spec coverage: "wire Nano Banana Pro into the existing daily champion-fusion cron (replacing Pollinations)" — covered by Task 2. Reference-image conditioning (which is the whole reason to use Nano Banana Pro over Pollinations) — covered by Task 1. ✓
- Type consistency: `reference_images` typed as `list[str]` in Python, `string[]` in TypeScript. Response union matches what `_generate` actually returns. ✓
- Placeholder scan: every code block is complete. `VERCEL_URL` usage concrete. ✓
