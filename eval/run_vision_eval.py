"""Run every photo in eval/photos through analyze_photo and print the structured result.

Run: uv run python eval/run_vision_eval.py
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from scenepilot.vision import VisionError, analyze_photo

PHOTOS = Path(__file__).parent / "photos"
MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


async def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    for path in sorted(PHOTOS.iterdir()):
        mime = MIME.get(path.suffix.lower())
        if not mime:
            continue
        print(f"=== {path.name}")
        try:
            r = await analyze_photo(path.read_bytes(), mime)
        except VisionError as e:
            print(f"  failed: {e}")
            continue
        print(f"  {r.latency_ms}ms")
        print(json.dumps(r.analysis.model_dump(mode="json"), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
