"""Local smoke test for gemini-webapi cookie auth + Nano Banana Pro image gen.

Usage:
    export GEMINI_PSID='<paste __Secure-1PSID>'
    export GEMINI_PSIDTS='<paste __Secure-1PSIDTS>'
    .venv-gemini/bin/python scripts/smoke-test-gemini-auth.py

Exits 0 on success (image produced), nonzero on any failure.
"""

import asyncio
import os
import sys
import tempfile
from pathlib import Path

from gemini_webapi import GeminiClient
from gemini_webapi.constants import Model


async def main() -> int:
    psid = os.environ.get("GEMINI_PSID")
    psidts = os.environ.get("GEMINI_PSIDTS")
    if not psid or not psidts:
        print("ERROR: GEMINI_PSID and GEMINI_PSIDTS must be set", file=sys.stderr)
        return 2

    client = GeminiClient(psid, psidts, proxy=None)
    try:
        await client.init(timeout=30, auto_refresh=False)
    except Exception as e:
        print(f"init failed: {type(e).__name__}: {e}", file=sys.stderr)
        return 3

    print(f"Authenticated. Account status: {client.account_status}")
    print(f"Available models from list_models(): {client.list_models()}")
    print()

    print("Sending prompt to Model.BASIC_PRO (gemini-3-pro / Nano Banana Pro)...")
    try:
        response = await client.generate_content(
            "Generate an image: a single red apple on a white background, studio lighting",
            model=Model.BASIC_PRO,
        )
    except Exception as e:
        print(f"generate_content failed: {type(e).__name__}: {e}", file=sys.stderr)
        return 4

    print(f"Response text (preview): {response.text[:200]!r}")
    print(f"Images returned: {len(response.images)}")

    if not response.images:
        print("FAILURE: response had no images (likely geo-block or text-only fallback)", file=sys.stderr)
        return 5

    img = response.images[0]
    with tempfile.TemporaryDirectory() as tmpdir:
        saved = await img.save(path=tmpdir, filename="smoke.png", verbose=False)
        size = Path(saved).stat().st_size
    print(f"SUCCESS: image saved ({size} bytes) from url {img.url[:80]}...")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
