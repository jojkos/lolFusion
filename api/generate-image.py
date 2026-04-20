"""Vercel Python serverless handler for Nano Banana Pro (gemini-3-pro).

POST /api/generate-image   body: {"prompt": "..."}
Returns JSON with a discriminated "kind" so the frontend can distinguish
auth failures from geo-blocks from empty responses.
"""

import asyncio
import base64
import json
import os
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))

from _lib import cookie_store

from gemini_webapi import GeminiClient
from gemini_webapi.constants import Model
from gemini_webapi.utils import rotate_1psidts


def _json_response(handler: BaseHTTPRequestHandler, status: int, body: dict[str, Any]) -> None:
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


ROTATE_AFTER_SECONDS = 8 * 60


async def _generate(prompt: str) -> dict[str, Any]:
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
        await cookie_store.save(psid, effective_psidts)
    elif not stored["rotated_at"]:
        # seeded from env but never persisted — write initial state now
        await cookie_store.save(psid, psidts)

    try:
        response = await client.generate_content(prompt, model=Model.BASIC_PRO)
    except Exception as e:
        return {"ok": False, "kind": "generate", "error": f"{type(e).__name__}: {e}"}

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
            saved = await img.save(path=tmpdir, filename="out.png", verbose=False)
            data = Path(saved).read_bytes()
    except Exception as e:
        return {
            "ok": True,
            "kind": "url",
            "image_url": img.url,
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
