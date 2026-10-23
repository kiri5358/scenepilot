"""Spoken-command matching and the speech test mode (static/speech.js) are plain JavaScript, checked with node."""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent
SCRIPT = Path(__file__).parent / "speech_check.js"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_speech_commands_and_test_mode():
    run = subprocess.run(["node", str(SCRIPT)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr + run.stdout
    assert "speech checks passed" in run.stdout


def test_speech_js_stores_and_sends_nothing_itself():
    source = (ROOT / "src" / "scenepilot" / "static" / "speech.js").read_text(encoding="utf-8")
    for forbidden in ("fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "localStorage", "sessionStorage", "indexedDB"):
        assert forbidden not in source, forbidden
