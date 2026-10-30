"""Display language must not change Korean jurisdiction, personal facts or safety decisions."""
import asyncio
import json
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from scenepilot import app as app_module, assistant, coach, kr, session as sm, states, watch_hints
from scenepilot.config import Settings
from scenepilot.schemas import PhotoAnalysis
from scenepilot.vision import VisionResult

SETTINGS = Settings(api_key="test", base_url="http://test/", vision_model="fake", max_image_bytes=1024,
                    vision_max_tokens=100, request_timeout=5, assistant_model="fake", assistant_max_tokens=100, cors_origins=())


class FakeModel:
    def __init__(self, content):
        self.content, self.calls = content, []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=self.content, tool_calls=None))])


def korea_session():
    s = sm.new_session("KR")
    sm.accept_consent(s)
    return s


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_current_korean_protocol_is_translated_without_mutating_accident():
    s = korea_session()
    views = [app_module._view(s)]
    sm.answer_safety(s, "no")
    views.append(app_module._view(s))
    sm.answer_safety(s, "yes")
    while s.stage is sm.Stage.GUIDE:
        views.append(app_module._view(s))
        sm.guide(s, "next")
    views.append(app_module._view(s))
    while s.stage is sm.Stage.PHOTOS:
        sm.skip_item(s, "해당 없어요")
    views.append(app_module._view(s))
    sm.go_to(s, "info")
    sm.set_info(s, "statement", "사실만 말하세요.")
    sm.finish(s)
    sm.set_contact(s, "told", "QA-EN-001", "김담당")
    sm.add_followup(s, "처음 기록은 그대로 보관")
    views.append(app_module._view(s))
    danger = korea_session()
    sm.answer_safety(danger, "yes")
    views.append(app_module._view(danger))
    protocol = watch_hints.public_rules("KR")
    fixed = [*kr.QUESTIONS.values(), *kr.LEAVE_INFO.values(), *kr.EMERGENCY_ACTIONS, kr.CAUTION_ACTION,
             *kr.PHOTO_MESSAGES.values(), *kr.COACH_HINTS.values(), *kr.SAY_THIS.values(), kr.CONTACT_WARNING]
    for note in states.ui_notes("KR"):
        fixed.extend([note.title, note.text])
        fixed.extend(value for src in note.sources for value in (src.title, src.version))
    fixture = {"views": views, "fixed": fixed, "hints": [{"text": r["hint"], "say": protocol["say"].get(r["id"])} for r in protocol["rules"]]}
    run = subprocess.run(["node", str(Path(__file__).with_name("app_language_check.mjs"))],
                         input=json.dumps(fixture, ensure_ascii=False), capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stdout + run.stderr


def test_english_assistant_keeps_korean_sources_and_emergency_numbers():
    s = korea_session()
    model = FakeModel("Exchange contact details and photograph the vehicles from a safe place.")
    answer = asyncio.run(assistant.ask(s, "What should I do next?", language="en", client=model, settings=SETTINGS))
    assert answer.kind == "answer" and answer.answer.startswith("Exchange")
    prompt = model.calls[0]["messages"][0]["content"]
    assert "South Korea" in prompt and 'state "KR"' in prompt and "plain English only" in prompt
    assert s.country == "KR"
    model = FakeModel("must not be called")
    result = asyncio.run(assistant.ask(s, "There is smoke", language="en", client=model))
    assert result.kind == "safety" and "119" in result.answer and "911" not in result.answer
    assert {b.number for b in result.call_buttons} == {"119", "112"}
    assert not model.calls


def test_english_coaching_still_vets_advice_and_preserves_heard_values():
    s = korea_session()
    model = FakeModel(json.dumps({"risks": [], "heated": False, "heard": {"other_contact": "김테스트"},
                                  "advice": "Ask for the other driver’s insurer and contact details."}, ensure_ascii=False))
    result = asyncio.run(coach.coach(s, "My name is 김테스트", language="en", client=model, settings=SETTINGS))
    assert result.hints[0]["id"] == "ai"
    assert s.info["other_contact"].value == "김테스트" and not s.info["other_contact"].confirmed
    prompt = model.calls[0]["messages"][0]["content"]
    assert "in Korea" in prompt and "plain English sentences" in prompt
    for text in ("Pay the other driver now.", "Before leaving, pay them cash.", "Sign the document.", "The repairs cost $300.", "Call 911.", "<b>Call 119</b>"):
        assert coach.vet_advice(text, "en") is None
    assert coach.vet_advice("Move to a safe place and call 119.", "en")


def test_language_option_reaches_models_without_replacing_the_session(monkeypatch):
    client = TestClient(app_module.app)
    sid = client.post("/api/sessions", json={"country": "KR"}).json()["session"]["id"]
    client.post(f"/api/sessions/{sid}/consent")
    calls = []

    async def fake_ask(s, question, *, language):
        calls.append((s.id, s.country, language))
        return assistant.AssistantAnswer("Ready.", "answer")

    monkeypatch.setattr(assistant, "ask", fake_ask)
    assert client.post(f"/api/sessions/{sid}/ask", json={"question": "next", "language": "en"}).status_code == 200
    assert calls == [(sid, "KR", "en")]
    assert client.get(f"/api/sessions/{sid}").json()["session"]["stage"] == "safety"
    rules = client.get("/api/watch-rules?country=KR&language=en").json()
    coverage = next(r for r in rules["rules"] if r["id"] == "coverage")
    assert "ifiledaclaim" in coverage["phrases"]
    assert rules["say"]["coverage"] == kr.SAY_THIS["coverage"]
    assert client.post(f"/api/sessions/{sid}/ask", json={"question": "next", "language": "fr"}).status_code == 422


def test_english_photo_observations_keep_the_korean_photo_flow(monkeypatch):
    client = TestClient(app_module.app)
    sid = client.post("/api/sessions", json={"country": "KR"}).json()["session"]["id"]
    client.post(f"/api/sessions/{sid}/consent")
    client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": "no"})
    client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": "yes"})
    client.post(f"/api/sessions/{sid}/guide", json={"action": "skip"})
    languages = []

    async def fake_vision(image, mime, **kwargs):
        languages.append(kwargs["language"])
        return VisionResult(PhotoAnalysis(scene_type="damage_closeup", sharpness="clear", plate="not_readable",
                           visible_damage="minor", vehicle_count=1, observations=["A dent is visible."], unknown=[], retake_hint=None), "fake", 1)

    monkeypatch.setattr(app_module, "analyze_photo", fake_vision)
    result = client.post(f"/api/sessions/{sid}/photo?language=en", files={"file": ("test.jpg", b"fake", "image/jpeg")})
    assert result.status_code == 200, result.text
    assert languages == ["English"]
    assert result.json()["session"]["country"] == "KR"
    assert result.json()["analysis"]["observations"] == ["A dent is visible."]
