"""Conversation watch: the phrase rules (watch_hints.py), their audio, and the browser matcher (static/watch.js)."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scenepilot import app as app_module
from scenepilot import prompt_audio, watch_hints

ROOT = Path(__file__).parent.parent
SCRIPT = Path(__file__).parent / "watch_check.js"
client = TestClient(app_module.app)

CASES = [
    ("It was my fault, I'm sorry", ["fault"]),
    ("I'm so sorry about this", []),                       # courtesy alone is never flagged
    ("I didn’t see you there", ["fault"]),                 # a curly apostrophe from the recognizer still matches
    ("Honestly I didn't see you", ["fault"]),
    ("Please don't call the police", ["police"]),
    ("Let's settle this here, I'll pay cash", ["deal"]),
    ("Sorry, I have to go now", ["leaving"]),
    ("Just sign here", ["sign"]),
    ("Or I'll sue you", ["hostile"]),
    ("Don't worry, I'm fine", ["pain"]),
    ("My back hurts a little", ["pain"]),
    ("my faulty brake light", []),                          # whole words only
    ("nothing to see here", []),
    ("I was texting and it's my fault", ["fault"]),         # one reminder per rule, not per phrase
    ("I'm fine, no police, pay cash", ["police", "deal", "pain"]),
]


def test_every_rule_has_phrases_and_a_short_unique_reminder():
    ids = [r.id for r in watch_hints.RULES]
    hints = watch_hints.hints()
    assert len(ids) == len(set(ids)) == len(hints) == len(set(hints))
    for r in watch_hints.RULES:
        assert r.phrases and len(r.hint.split()) <= 16, r.id
        assert "’" not in r.hint  # straight apostrophes only, so the clip lookup text matches exactly


def test_matching_rules():
    for text, want in CASES:
        assert [r.id for r in watch_hints.match(text)] == want, text


def test_reminders_are_in_the_audio_list():
    fixed = set(prompt_audio.fixed_prompts())
    for hint in watch_hints.hints():
        assert prompt_audio.normalize(hint) in fixed


def test_rules_endpoint_serves_what_the_browser_needs():
    r = client.get("/api/watch-rules")
    assert r.status_code == 200
    body = r.json()
    assert body["cooldown_seconds"] == watch_hints.COOLDOWN_SECONDS
    assert [x["hint"] for x in body["rules"]] == watch_hints.hints()
    assert all(x["phrases"] for x in body["rules"])


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_browser_matcher_agrees_and_respects_the_cooldown():
    cases = [[text, [r.id for r in watch_hints.match(text)]] for text, _ in CASES]
    payload = {**watch_hints.public_rules(), "cases": cases}
    run = subprocess.run(["node", str(SCRIPT)], input=json.dumps(payload), capture_output=True, text=True,
                         encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr + run.stdout
    assert "watch checks passed" in run.stdout


def test_watch_js_stores_and_sends_nothing_itself():
    source = (ROOT / "src" / "scenepilot" / "static" / "watch.js").read_text(encoding="utf-8")
    for forbidden in ("fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "localStorage", "sessionStorage", "indexedDB"):
        assert forbidden not in source, forbidden
