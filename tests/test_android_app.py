"""The Android wrapper: its web copy is built from the unchanged web UI, and the server's CORS switch works."""
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from scenepilot.app import add_cors

ROOT = Path(__file__).parent.parent
APP = ROOT / "android-app"
WEB = ROOT / "src" / "scenepilot" / "static"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_www_is_built_from_the_web_ui_with_only_app_additions():
    run = subprocess.run(
        ["node", "build-www.mjs"], cwd=APP, capture_output=True, text=True, encoding="utf-8", timeout=60,
        env={**__import__("os").environ, "SCENEPILOT_API_BASE": "https://example.test/"},
    )
    assert run.returncode == 0, run.stderr + run.stdout
    www = APP / "www"
    for name in ("app.js", "speech.js", "geo.js", "ko.js", "style.css"):
        assert (www / name).read_bytes() == (WEB / name).read_bytes(), f"{name} must be copied unchanged"
    html = (www / "index.html").read_text(encoding="utf-8")
    assert "/static/" not in html and 'src="./app.js"' in html
    assert html.index("app-config.js") < html.index("api-shim.js") < html.index("geo.js")
    assert html.index("speech.js") < html.index("native-speech.js") < html.index("native-tts.js") < html.index("app.js")
    assert (www / "app-config.js").read_text(encoding="utf-8").strip() == 'window.SCENEPILOT_API_BASE = "https://example.test";'


def test_android_manifest_declares_the_permissions_the_app_uses():
    manifest = (APP / "android" / "app" / "src" / "main" / "AndroidManifest.xml").read_text(encoding="utf-8")
    assert "android.intent.action.TTS_SERVICE" in manifest, "without it Android 11+ hides the speech engines and the app is silent"
    for permission in ("INTERNET", "RECORD_AUDIO", "ACCESS_FINE_LOCATION", "CAMERA"):
        assert f"android.permission.{permission}" in manifest
    assert "android.speech.RecognitionService" in manifest
    assert 'android:allowBackup="false"' in manifest


def test_cors_is_off_by_default_and_opt_in_per_origin():
    plain = FastAPI()
    add_cors(plain, ())
    plain.get("/x")(lambda: {"ok": True})
    assert "access-control-allow-origin" not in TestClient(plain).get("/x", headers={"Origin": "https://localhost"}).headers

    open_for_app = FastAPI()
    add_cors(open_for_app, ("https://localhost",))
    open_for_app.get("/x")(lambda: {"ok": True})
    client = TestClient(open_for_app)
    assert client.get("/x", headers={"Origin": "https://localhost"}).headers["access-control-allow-origin"] == "https://localhost"
    assert "access-control-allow-origin" not in client.get("/x", headers={"Origin": "https://evil.test"}).headers


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_native_speech_adapter_with_a_fake_android_plugin():
    run = subprocess.run(["node", str(Path(__file__).parent / "native_speech_check.js")], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr + run.stdout
    assert "native speech checks passed" in run.stdout


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_native_tts_shim_reports_the_end_and_stays_quiet_when_cancelled():
    run = subprocess.run(["node", str(Path(__file__).parent / "native_tts_check.js")], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr + run.stdout
    assert "native tts checks passed" in run.stdout
