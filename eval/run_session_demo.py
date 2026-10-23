"""Run the session flow end to end with the real model (uses 4 photos). Run: uv run python eval/run_session_demo.py"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from scenepilot import session as sm
from scenepilot.guard import sanitize_analysis
from scenepilot.vision import analyze_photo

P = Path(__file__).parent / "photos"
# Follows the checklist order and starts with the blurry photo on purpose, to exercise the retake flow.
SEQUENCE = ["blurred_scene.jpg", "sharp_scene.jpg", "sharp_scene.jpg", "plate_closeup.jpg", "damage_tree.jpg", "sharp_scene.jpg"]


async def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    s = sm.new_session()
    sm.accept_consent(s)
    for ans in ("No", "No", "No", "No", "No", "Yes", "No"):
        sm.answer_safety(s, ans)
    print("stage:", s.stage.value, "(situation level:", s.emergency.level + ")")
    sm.guide(s, "skip")  # skip the spoken "what to do now" steps in this photo demo
    for name in SEQUENCE:
        if s.stage is not sm.Stage.PHOTOS:
            break
        item = sm.current_item_id(s)
        r = await analyze_photo((P / name).read_bytes(), "image/jpeg")
        analysis, removed = sanitize_analysis(r.analysis)
        v = sm.submit_photo(s, analysis)
        print(f"[{item}] {name}: accepted={v.accepted} reason={v.reason.value} "
              f"scene={analysis.scene_type.value} sharp={analysis.sharpness.value} plate={analysis.plate.value} "
              f"cars={analysis.vehicle_count} guard_removed={removed}"
              + (f"\n    -> {v.message}" if v.message else ""))
    print("stage:", s.stage.value, "| next item:", sm.current_item_id(s))


asyncio.run(main())
