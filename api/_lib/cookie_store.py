"""Upstash Redis REST wrapper for Gemini cookie persistence.

Uses env vars KV_REST_API_URL + KV_REST_API_TOKEN (auto-injected by Vercel's
Redis/Upstash integration, which is what @vercel/kv also reads).
No npm dependencies; pure httpx.
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
    rotated_at: float


def _upstash_creds() -> Optional[tuple[str, str]]:
    url = os.environ.get("KV_REST_API_URL")
    token = os.environ.get("KV_REST_API_TOKEN")
    if not url or not token:
        return None
    return url.rstrip("/"), token


async def load() -> Optional[Cookies]:
    creds = _upstash_creds()
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
    creds = _upstash_creds()
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
    psid = os.environ.get("GEMINI_PSID")
    psidts = os.environ.get("GEMINI_PSIDTS")
    if not psid or not psidts:
        return None
    return {"psid": psid, "psidts": psidts, "rotated_at": 0.0}
