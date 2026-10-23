"""The Korean reading aid (static/ko.js, opened with ?ko) must cover every fixed English line the server can show."""
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

from scenepilot import checklist, playbooks, states
from scenepilot.emergency import SAFETY_QUESTIONS
from scenepilot.session import INFO_FIELDS, SOURCE_LABEL, DISCLAIMER

ROOT = Path(__file__).parent.parent
SCRIPT = Path(__file__).parent / "ko_check.js"


def fixed_lines() -> list[str]:
    lines = [q.text for q in SAFETY_QUESTIONS]
    lines += [i.title for i in checklist.ITEMS] + [i.instruction for i in checklist.ITEMS]
    lines += list(checklist._DEFAULT_MESSAGES.values())
    lines += list(playbooks.SERIOUS_STEPS) + [playbooks.STATE_QUESTION, playbooks.GENERAL_OTHER, playbooks.GENERAL_UNSURE]
    lines += list(INFO_FIELDS.values()) + list(SOURCE_LABEL.values()) + [DISCLAIMER]
    for code in ("FL", "NY"):
        for n in states.ui_notes(code):
            lines += [n.title, n.text]
    lines.append(states.load().disclaimer)
    from scenepilot import assistant
    lines += [assistant.SAFETY_ANSWER, assistant.FALLBACK_ANSWER, assistant.UNAVAILABLE_ANSWER, assistant.NOTE]
    return lines


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_every_fixed_line_has_a_korean_meaning():
    from scenepilot.emergency import Answer

    lines = fixed_lines()
    # the standard guidance steps, for both ways the first step can read
    for movable in (Answer.YES, Answer.NO):
        lines += [s.text for s in playbooks.guide_steps("none", {"movable": movable}, "FL")]
    lines += [s.text for s in playbooks.guide_steps("none", {}, "NY")]
    with tempfile.TemporaryDirectory() as folder:
        dump = Path(folder) / "lines.json"
        dump.write_text(json.dumps(sorted(set(lines))), encoding="utf-8")
        run = subprocess.run(["node", str(SCRIPT), str(dump)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr + run.stdout
    assert "ko checks passed" in run.stdout


def test_ko_js_stores_and_sends_nothing():
    source = (ROOT / "src" / "scenepilot" / "static" / "ko.js").read_text(encoding="utf-8")
    for forbidden in ("fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "localStorage", "sessionStorage", "indexedDB"):
        assert forbidden not in source, forbidden
