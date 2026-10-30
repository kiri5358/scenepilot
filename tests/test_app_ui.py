"""The new UI (static/app): its logic is checked with node, and its files are checked for the rules the team agreed on."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scenepilot import app as app_module

ROOT = Path(__file__).parent.parent
APP = ROOT / "src" / "scenepilot" / "static" / "app"
SCRIPT = Path(__file__).parent / "app_core_check.mjs"
client = TestClient(app_module.app)


def js_files() -> list[Path]:
    return sorted((APP / "js").rglob("*.js"))


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_core_logic():
    run = subprocess.run(["node", str(SCRIPT)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr + run.stdout
    assert "app core checks passed" in run.stdout


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_current_backend_coaching_protocol_reaches_the_new_gui():
    protocol = client.get("/api/watch-rules?country=KR").json()
    run = subprocess.run(
        ["node", str(SCRIPT.with_name("app_handover_check.mjs")), "--protocol"],
        input=json.dumps(protocol, ensure_ascii=False), capture_output=True, text=True, encoding="utf-8", timeout=60,
    )
    assert run.returncode == 0, run.stderr + run.stdout
    assert "app handover checks passed" in run.stdout


def test_index_references_existing_files():
    html = (APP / "index.html").read_text(encoding="utf-8")
    refs = re.findall(r'(?:href|src)="(/static/app/[^"]+)"', html)
    assert refs, "index.html should load its own css and script"
    for ref in refs:
        assert (ROOT / "src" / "scenepilot" / ref.removeprefix("/")).is_file(), ref


def test_relative_imports_resolve():
    pattern = re.compile(r'(?:from|import)\s*\(?\s*"(\.{1,2}/[^"]+)"')
    for path in js_files():
        for target in pattern.findall(path.read_text(encoding="utf-8")):
            assert (path.parent / target).resolve().is_file(), f"{path.relative_to(APP)} imports {target}"


def test_server_text_never_becomes_markup():
    """Text from the server may only go in as text. innerHTML is allowed in one file, for fixed icon paths."""
    for path in js_files():
        source = path.read_text(encoding="utf-8")
        rel = path.relative_to(APP / "js").as_posix()
        if rel != "ui/icons.js":
            assert "innerHTML" not in source and "outerHTML" not in source and "insertAdjacentHTML" not in source, rel
        assert "document.write" not in source and "eval(" not in source, rel


def test_core_does_not_touch_the_page():
    """core/ stays free of the DOM so node can test it."""
    for path in sorted((APP / "js" / "core").glob("*.js")):
        source = path.read_text(encoding="utf-8")
        assert "createElement" not in source and "querySelector" not in source and "getElementById" not in source, path.name


def test_korean_and_english_words_match():
    ko = json.loads((APP / "i18n" / "ko.json").read_text(encoding="utf-8"))
    en = json.loads((APP / "i18n" / "en.json").read_text(encoding="utf-8"))
    assert set(ko) == set(en), sorted(set(ko) ^ set(en))
    assert all(isinstance(v, str) and v.strip() for v in {**ko, **en}.values())
    # the same {placeholders} in both languages
    for key in ko:
        assert sorted(re.findall(r"\{(\w+)\}", ko[key])) == sorted(re.findall(r"\{(\w+)\}", en[key])), key


def test_every_translation_key_used_in_code_exists():
    ko = json.loads((APP / "i18n" / "ko.json").read_text(encoding="utf-8"))
    used = set()
    for path in js_files():
        used |= set(re.findall(r'\bt\("([\w.]+)"', path.read_text(encoding="utf-8")))
    missing = sorted(key for key in used if key not in ko)
    assert not missing, missing
    # keys built from a template, such as t(`stage.${stage}`), are checked by their prefix
    for prefix in ("stage.", "nav.", "steps.", "cov.", "home.help.", "consent.", "settings.", "listen.err.", "emergency.say.", "illus.", "stepsheet.", "coach.info.ph.", "danger."):
        assert any(key.startswith(prefix) for key in ko), prefix


def test_translation_keys_named_as_text_exist():
    """Keys kept as plain strings (for example labelKey: "safety.danger.yes") must exist too."""
    ko = json.loads((APP / "i18n" / "ko.json").read_text(encoding="utf-8"))
    pattern = re.compile(r'"((?:safety|photos|guide|hub|emergency|listen|vb|coach|pending|busy|err|action|ask|stepsheet)\.[\w.]+)"')
    named = set()
    for path in js_files():
        if path.relative_to(APP / "js").as_posix() == "screens/index.js":
            continue   # its keys are screen ids ("coach.coach"), not words
        named |= set(pattern.findall(path.read_text(encoding="utf-8")))
    # a name may also be the start of a family of keys ("safety.danger" + ".yes")
    missing = sorted(key for key in named if key not in ko and not any(other.startswith(key + ".") for other in ko))
    assert not missing, missing


def test_new_ui_is_served_with_javascript_types():
    index = client.get("/static/app/index.html")
    assert index.status_code == 200 and "text/html" in index.headers["content-type"]
    main = client.get("/static/app/js/main.js")
    assert main.status_code == 200 and "javascript" in main.headers["content-type"]
    for name in ("ko", "en"):
        assert client.get(f"/static/app/i18n/{name}.json").status_code == 200


def test_the_new_ui_is_the_front_page_and_the_old_one_stays_at_legacy():
    """'/' is the new modular UI; the first UI (index.html + app.js) is kept at /legacy, for the Android build and as a fallback."""
    page = client.get("/")
    assert page.status_code == 200 and "/static/app/js/main.js" in page.text and "/static/app.js" not in page.text
    old = client.get("/legacy")
    assert old.status_code == 200 and "/static/app.js" in old.text and "/static/app/" not in old.text
