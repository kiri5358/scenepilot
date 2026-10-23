"""The phone-side state lookup (static/geo.js) is plain JavaScript, so it is checked with node when node is installed."""
import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parent / "geo_check.js"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_geo_outlines_against_known_places():
    run = subprocess.run(["node", str(SCRIPT)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr + run.stdout
    assert "geo checks passed" in run.stdout


def test_geo_js_never_sends_coordinates_anywhere():
    """The lookup must stay on the phone: no network calls in the location code."""
    source = (Path(__file__).parent.parent / "src" / "scenepilot" / "static" / "geo.js").read_text(encoding="utf-8")
    for forbidden in ("fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "localStorage", "sessionStorage"):
        assert forbidden not in source, forbidden
