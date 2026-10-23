from fastapi.testclient import TestClient

from scenepilot import app as app_module
from scenepilot.schemas import PhotoAnalysis
from scenepilot.vision import VisionResult

client = TestClient(app_module.app)

QUEUE: list[PhotoAnalysis] = []


async def fake_analyze(image, mime, **kw):
    return VisionResult(QUEUE.pop(0), "fake-model", 1)


def pa(**kw) -> PhotoAnalysis:
    base = dict(
        scene_type="wide_scene", sharpness="clear", plate="not_readable", visible_damage="unclear",
        vehicle_count=2, observations=["Two vehicles are visible.", "The rear driver is clearly at fault."], unknown=[], retake_hint=None,
    )
    base.update(kw)
    return PhotoAnalysis(**base)


def post_photo(sid):
    return client.post(f"/api/sessions/{sid}/photo", files={"file": ("a.jpg", b"\xff\xd8fake", "image/jpeg")})


def test_api_flow(monkeypatch):
    monkeypatch.setattr(app_module, "analyze_photo", fake_analyze)
    r = client.post("/api/sessions", json={"country": "US"})
    sid = r.json()["session"]["id"]
    assert r.json()["prompt"]["kind"] == "consent"

    assert post_photo(sid).status_code == 409  # wrong stage, so it is rejected before the model is called

    client.post(f"/api/sessions/{sid}/consent")
    r = client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": "Yes, my passenger is hurt"})
    assert r.json()["prompt"]["kind"] == "emergency"
    assert post_photo(sid).status_code == 409
    client.post(f"/api/sessions/{sid}/ack-emergency")
    for ans in ("No", "Yes", "No"):
        r = client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": ans})
    assert r.json()["session"]["stage"] == "photos"  # an emergency goes straight on: 911 is the guidance

    QUEUE.append(pa(sharpness="blurry", retake_hint="Hold still and try again."))
    r = post_photo(sid).json()
    assert r["verdict"]["accepted"] is False and r["verdict"]["message"] == "Hold still and try again."

    QUEUE.append(pa())
    r = post_photo(sid).json()
    assert r["verdict"]["accepted"] is True
    assert r["removed_by_guard"] == 1  # the 'fault' sentence was filtered out
    assert r["analysis"]["observations"] == ["Two vehicles are visible."]

    for _ in range(2):  # skipping the 2 remaining core photos (other vehicle, damage) leads to the hub
        r = client.post(f"/api/sessions/{sid}/skip", json={"reason": "No time"})
    assert r.json()["session"]["stage"] == "hub" and r.json()["prompt"]["kind"] == "hub"
    assert r.json()["photo_progress"]["core_done"] == 3
    assert client.post(f"/api/sessions/{sid}/goto", json={"target": "info"}).json()["session"]["stage"] == "info"
    r = client.post(f"/api/sessions/{sid}/info", json={"field": "statement", "value": "Rear-ended at a light."})
    assert r.json()["session"]["stage"] == "info"
    r = client.post(f"/api/sessions/{sid}/finish").json()
    assert r["session"]["stage"] == "summary"
    assert "[Your statement]" in r["summary_text"] and "[AI observation, unverified]" in r["summary_text"]


def test_errors():
    assert client.get("/api/sessions/nope").status_code == 404
    assert client.post("/api/sessions", json={"country": "ZZ"}).status_code == 422
    sid = client.post("/api/sessions").json()["session"]["id"]
    assert client.post(f"/api/sessions/{sid}/finish").status_code == 409
    assert client.post(f"/api/sessions/{sid}/info", json={"field": "x", "value": "y"}).status_code == 409


def test_ui_is_served_and_view_has_screen_data():
    r = client.get("/")
    assert r.status_code == 200 and "ScenePilot" in r.text and "/static/app.js" in r.text
    assert client.get("/static/app.js").status_code == 200
    assert client.get("/static/style.css").status_code == 200
    v = client.post("/api/sessions").json()
    assert [c["id"] for c in v["checklist"]][0] == "scene_wide" and v["checklist"][0]["title"]
    assert v["safety_progress"] == {"answered": 0, "total": 7}
    assert "statement" in v["info_fields"]


def test_guide_endpoint_flow():
    sid = client.post("/api/sessions").json()["session"]["id"]
    assert client.post(f"/api/sessions/{sid}/guide", json={"action": "next"}).status_code == 409  # wrong stage
    client.post(f"/api/sessions/{sid}/consent")
    for ans in ("No", "No", "No", "No", "No", "Yes", "No"):
        r = client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": ans}).json()
    assert r["session"]["stage"] == "guide" and r["prompt"]["kind"] == "guide"
    assert r["prompt"]["step_index"] == 0 and len(r["prompt"]["steps"]) >= 6
    assert client.post(f"/api/sessions/{sid}/guide", json={"action": "fly"}).status_code == 422
    r = client.post(f"/api/sessions/{sid}/guide", json={"action": "next"}).json()
    assert r["prompt"]["step_index"] == 1
    r = client.post(f"/api/sessions/{sid}/guide", json={"action": "skip"}).json()
    assert r["session"]["stage"] == "photos" and r["safety_progress"]["total"] == 7


def test_states_endpoint_and_state_step():
    r = client.get("/api/states").json()
    assert {s["code"] for s in r["states"]} == {"FL", "NY"} and r["reviewed"] is False

    sid = client.post("/api/sessions").json()["session"]["id"]
    assert client.post(f"/api/sessions/{sid}/state", json={"state": "FL"}).status_code == 409  # wrong stage
    client.post(f"/api/sessions/{sid}/consent")
    for ans in ("No", "No", "No", "No", "No", "Yes", "No"):
        client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": ans})
    for _ in range(7):
        r = client.post(f"/api/sessions/{sid}/guide", json={"action": "next"}).json()
    assert r["prompt"]["step_kind"] == "state" and len(r["prompt"]["states"]) == 2
    assert client.post(f"/api/sessions/{sid}/guide", json={"action": "next"}).status_code == 409
    assert client.post(f"/api/sessions/{sid}/state", json={"state": "TX"}).status_code == 422
    r = client.post(f"/api/sessions/{sid}/state", json={"state": "NY"}).json()
    assert r["session"]["accident_state"] == "NY" and r["prompt"]["step_kind"] == "state_note"
    assert r["prompt"]["sources"][0]["url"].startswith("https://www.nysenate.gov/")
    assert "Not legal advice" in r["prompt"]["state_disclaimer"]


def test_state_via_location_is_recorded_and_shown_in_the_summary():
    sid = client.post("/api/sessions").json()["session"]["id"]
    client.post(f"/api/sessions/{sid}/consent")
    for ans in ("No", "No", "No", "No", "No", "Yes", "No"):
        client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": ans})
    for _ in range(7):
        client.post(f"/api/sessions/{sid}/guide", json={"action": "next"})
    assert client.post(f"/api/sessions/{sid}/state", json={"state": "FL", "via": "gps-secret"}).status_code == 422
    r = client.post(f"/api/sessions/{sid}/state", json={"state": "FL", "via": "location"}).json()
    assert r["session"]["accident_state_via"] == "location"
    assert not [k for k in r["session"] if k in ("lat", "lon", "latitude", "longitude", "coordinates", "position")]
    client.post(f"/api/sessions/{sid}/guide", json={"action": "skip"})
    for _ in range(3):
        client.post(f"/api/sessions/{sid}/skip", json={"reason": "Not safe"})
    r = client.post(f"/api/sessions/{sid}/finish").json()
    items = {i["label"]: i["value"] for sec in r["summary"]["sections"] for i in sec["items"]}
    assert items["State where the accident happened"] == "Florida (suggested by your phone's location, confirmed by you)"


def test_emergency_state_from_location_is_set_without_a_question():
    sid = client.post("/api/sessions").json()["session"]["id"]
    client.post(f"/api/sessions/{sid}/consent")
    # not an emergency yet: refused (the user is asked instead)
    assert client.post(f"/api/sessions/{sid}/state", json={"state": "NY", "via": "location_auto"}).status_code == 409
    r = client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": "Yes, my passenger is hurt"}).json()
    assert r["session"]["stage"] == "emergency"
    assert client.post(f"/api/sessions/{sid}/state", json={"state": "TX", "via": "location_auto"}).status_code == 422
    r = client.post(f"/api/sessions/{sid}/state", json={"state": "NY", "via": "location_auto"}).json()
    assert r["session"]["accident_state"] == "NY" and r["session"]["accident_state_via"] == "location_auto"
    assert r["session"]["stage"] == "emergency"  # the screen does not change: nobody has to do anything


def test_static_files_are_never_served_from_a_stale_cache():
    for path in ("/static/app.js", "/static/style.css", "/static/speech.js", "/static/geo.js"):
        r = client.get(path)
        assert r.status_code == 200 and r.headers["cache-control"] == "no-cache", path
