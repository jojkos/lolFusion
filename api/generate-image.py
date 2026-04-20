"""Vercel Python serverless handler for Nano Banana Pro (gemini-3-pro).

POST /api/generate-image   body: {"prompt": "..."}
Returns JSON with a discriminated "kind" so the frontend can distinguish
auth failures from geo-blocks from empty responses.

Cookie persistence is inlined rather than imported from a sibling module:
Vercel's Python builder bundles each api/*.py independently and does not
reliably include api/_lib/ subdirectory helpers.
"""

import asyncio
import base64
import json
import os
import tempfile
import time
import traceback
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any, Optional, TypedDict

import httpx

from gemini_webapi import GeminiClient
from gemini_webapi.constants import Model
from gemini_webapi.utils import rotate_1psidts


# ---------------------------------------------------------------------------
# Cookie store (Upstash Redis REST, same creds @vercel/kv uses)
# ---------------------------------------------------------------------------

COOKIE_KEY = "gemini:cookies"


class Cookies(TypedDict):
    psid: str
    psidts: str
    rotated_at: float


def _upstash_creds() -> Optional[tuple[str, str]]:
    url = os.environ.get("KV_REST_API_URL")
    token = os.environ.get("KV_REST_API_TOKEN")
    if not url or not token:
        return None
    return url.rstrip("/"), token


async def _load_cookies() -> Optional[Cookies]:
    creds = _upstash_creds()
    if not creds:
        return None
    url, token = creds
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{url}/get/{COOKIE_KEY}",
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


async def _save_cookies(psid: str, psidts: str) -> bool:
    creds = _upstash_creds()
    if not creds:
        return False
    url, token = creds
    payload = json.dumps({"psid": psid, "psidts": psidts, "rotated_at": time.time()})
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{url}/set/{COOKIE_KEY}",
            headers={"Authorization": f"Bearer {token}"},
            content=payload,
        )
    return resp.status_code == 200


def _seed_cookies_from_env() -> Optional[Cookies]:
    psid = os.environ.get("GEMINI_PSID")
    psidts = os.environ.get("GEMINI_PSIDTS")
    if not psid or not psidts:
        return None
    return {"psid": psid, "psidts": psidts, "rotated_at": 0.0}


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------


def _json_response(handler: BaseHTTPRequestHandler, status: int, body: dict[str, Any]) -> None:
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


# ---------------------------------------------------------------------------
# Core generation
# ---------------------------------------------------------------------------

ROTATE_AFTER_SECONDS = 8 * 60


async def _generate(prompt: str, reference_images: list[str] | None = None) -> dict[str, Any]:
    stored = await _load_cookies() or _seed_cookies_from_env()
    if not stored:
        return {
            "ok": False,
            "kind": "config",
            "error": "No cookies in Upstash and GEMINI_PSID/GEMINI_PSIDTS env vars not set",
        }
    psid = stored["psid"]
    psidts = stored["psidts"]
    age = time.time() - stored["rotated_at"] if stored["rotated_at"] else float("inf")

    client = GeminiClient(psid, psidts, proxy=None)
    try:
        await client.init(timeout=60, auto_refresh=False)
    except Exception as e:
        return {"ok": False, "kind": "auth", "error": f"{type(e).__name__}: {e}"}

    if age > ROTATE_AFTER_SECONDS:
        try:
            new_psidts = await rotate_1psidts(client.client, verbose=False)
        except Exception as e:
            return {"ok": False, "kind": "auth", "error": f"rotate failed: {type(e).__name__}: {e}"}
        effective_psidts = new_psidts or psidts
        await _save_cookies(psid, effective_psidts)
    elif not stored["rotated_at"]:
        await _save_cookies(psid, psidts)

    tmpdir_obj = None
    ref_paths: list[str] = []
    if reference_images:
        tmpdir_obj = tempfile.TemporaryDirectory()
        for i, data_url in enumerate(reference_images):
            _, _, b64 = data_url.rpartition(",")
            b64 = b64 or data_url
            try:
                raw = base64.b64decode(b64, validate=False)
            except Exception:
                tmpdir_obj.cleanup()
                return {
                    "ok": False,
                    "kind": "bad_request",
                    "error": f"reference_images[{i}] is not valid base64",
                }
            p = Path(tmpdir_obj.name) / f"ref_{i}.jpg"
            p.write_bytes(raw)
            ref_paths.append(str(p))

    try:
        response = await client.generate_content(
            prompt,
            model=Model.BASIC_PRO,
            files=ref_paths or None,
        )
    except Exception as e:
        return {"ok": False, "kind": "generate", "error": f"{type(e).__name__}: {e}"}
    finally:
        if tmpdir_obj is not None:
            tmpdir_obj.cleanup()

    images = list(response.images or [])
    if not images:
        text_preview = (response.text or "")[:300]
        return {
            "ok": False,
            "kind": "empty",
            "error": "No images returned",
            "response_text": text_preview,
        }

    img = images[0]
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            saved = await img.save(
                path=tmpdir,
                filename="out.png",
                verbose=False,
                full_size=True,
            )
            data = Path(saved).read_bytes()
    except Exception as e:
        fallback_url = img.url
        if "=s1024-rj" in fallback_url:
            fallback_url = fallback_url.replace("=s1024-rj", "=s2048-rj")
        elif "=s2048-rj" not in fallback_url and "=" not in fallback_url.rsplit("/", 1)[-1]:
            fallback_url = f"{fallback_url}=s2048-rj"
        return {
            "ok": True,
            "kind": "url",
            "image_url": fallback_url,
            "note": f"save failed, returning url: {type(e).__name__}: {e}",
        }

    b64 = base64.b64encode(data).decode("ascii")
    return {
        "ok": True,
        "kind": "base64",
        "image_base64": f"data:image/png;base64,{b64}",
        "image_url": img.url,
        "byte_size": len(data),
    }


# ---------------------------------------------------------------------------
# HTTP entry point
# ---------------------------------------------------------------------------


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

        refs = body.get("reference_images") or []
        if not isinstance(refs, list) or not all(isinstance(x, str) for x in refs):
            _json_response(
                self,
                400,
                {"ok": False, "kind": "bad_request", "error": "reference_images must be string[]"},
            )
            return

        try:
            result = asyncio.run(_generate(prompt, refs))
        except Exception as e:
            _json_response(
                self,
                500,
                {
                    "ok": False,
                    "kind": "internal",
                    "error": f"{type(e).__name__}: {e}",
                    "traceback": traceback.format_exc(),
                },
            )
            return

        if result.get("ok"):
            status = 200
        elif result.get("kind") == "auth":
            status = 401
        elif result.get("kind") == "config":
            status = 500
        else:
            status = 502
        _json_response(self, status, result)

    def do_GET(self) -> None:
        _json_response(self, 405, {"ok": False, "kind": "method_not_allowed", "error": "POST only"})
