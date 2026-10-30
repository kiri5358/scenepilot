"""The Korea edition (country KR): Korean answers, 112/119, Korean guidance, summary, free questions, watch rules and clips."""
import asyncio
import json
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from scenepilot import assistant, checklist, guard, kr, playbooks, prompt_audio, states, watch_hints
from scenepilot import session as sm
from scenepilot.app import app
from scenepilot.config import Settings
from scenepilot.emergency import Answer, danger_signals, evaluate, parse_answer, safety_questions
from scenepilot.schemas import PhotoAnalysis

ROOT = Path(__file__).parent.parent
SCRIPT = Path(__file__).parent / "korea_check.js"
client = TestClient(app)


# ---------- Answers in Korean ----------

DANGER = [
    ("다친 사람 없어요", Answer.NO),
    ("아무도 안 다쳤어요", Answer.NO),
    ("연기는 안 나요", Answer.NO),
    ("연기도 안 나고 다친 사람도 없어요", Answer.NO),
    ("다들 괜찮아요", Answer.NO),
    ("괜찮아요", Answer.NO),
    ("아니요", Answer.NO),
    ("다친 사람 있어요", Answer.YES),
    ("허리가 아파요", Answer.YES),
    ("다리를 못 움직여요", Answer.YES),
    ("다친 사람은 없는데 연기가 나요", Answer.YES),   # a danger sign that is not denied wins
    ("불이 났어요", Answer.YES),
    ("네", Answer.YES),
    ("모르겠어요", Answer.UNSURE),
    ("잘 모르겠는데요", Answer.UNSURE),
]
MOVABLE = [
    ("움직일 수 있어요", Answer.YES),
    ("안전한 곳으로 옮길 수 있어요", Answer.YES),   # "안전" must not read as the negative "안"
    ("네", Answer.YES),
    ("못 움직여요", Answer.NO),
    ("시동이 안 걸려요", Answer.NO),
    ("움직일 수 없어요", Answer.NO),
    ("아니요", Answer.NO),
]


@pytest.mark.parametrize("text,expected", DANGER)
def test_danger_answers_in_korean(text, expected):
    assert parse_answer(text, "danger") == expected


@pytest.mark.parametrize("text,expected", MOVABLE)
def test_movable_answers_in_korean(text, expected):
    assert parse_answer(text, "movable") == expected


def test_unclear_korean_is_asked_again_and_the_buttons_still_work():
    assert parse_answer("음...", "danger") is None
    assert parse_answer("yes", "danger") == Answer.YES and parse_answer("unsure", "movable") == Answer.UNSURE


def test_danger_signals_in_korean_ignore_denials():
    assert danger_signals("다친 사람이 있어요") == ["injury"]
    assert danger_signals("불이 났어요") == ["fire"]
    assert danger_signals("다친 사람 없어요") == []
    assert danger_signals("보험 접수는 어떻게 해요") == []


# ---------- Emergency numbers and wording ----------

def test_emergency_uses_119_and_112_in_korean():
    d = evaluate({"danger": Answer.YES}, "KR")
    assert d.level == "emergency" and d.title == kr.TITLES["emergency"]
    assert [b.number for b in d.call_buttons] == ["119", "112"]
    assert any("119" in a for a in d.actions) and not any("911" in a for a in d.actions)


def test_a_vehicle_that_cannot_move_is_caution_without_a_call_button():
    d = evaluate({"danger": Answer.NO, "movable": Answer.NO}, "KR")
    assert d.level == "caution" and d.call_buttons == [] and d.actions == [kr.CAUTION_ACTION]
    assert evaluate({"danger": Answer.NO, "movable": Answer.YES}, "KR").level == "none"


def test_unsure_counts_as_danger_in_korean_too():
    assert evaluate({"danger": Answer.UNSURE}, "KR").level == "emergency"


def test_korean_questions_cover_the_same_ids():
    assert [q.id for q in safety_questions("KR")] == [q.id for q in safety_questions("US")] == ["danger", "movable"]


# ---------- Guidance ----------

def test_korean_guidance_has_one_list_and_notes_but_no_state_question():
    steps = playbooks.guide_steps("none", {"movable": Answer.NO}, states.KR, "KR")
    assert [s.kind for s in steps] == ["list"] + ["state_note"] * len(states.ui_notes("KR"))
    assert len(states.ui_notes("KR")) == 6
    assert steps[0].items[0] == kr.FIRST_STEP_STUCK and "112" in steps[0].items[3]
    assert all(s.sources and s.note_title for s in steps[1:])
    assert playbooks.guide_steps("emergency", {}, states.KR, "KR") == []


def test_the_korea_notes_are_a_draft_with_sources_and_the_us_picker_never_lists_korea():
    assert states.supported("KR") == [] and "KR" not in {s["code"] for s in states.supported("US")}
    assert states.valid_choice_for("KR", "KR") and not states.valid_choice_for("FL", "KR")
    assert not states.valid_choice_for("KR", "US") and states.valid_choice_for("FL", "US")
    assert states.name_of("KR") == "대한민국" and states.disclaimer_for("KR") == states.load().disclaimer_kr
    for note in states.ui_notes("KR"):
        assert note.sources and all(src.url.startswith("https://") for src in note.sources)


# ---------- A whole Korean session ----------

def analysis(**kw):
    base = dict(scene_type="wide_scene", sharpness="clear", plate="readable", visible_damage="minor", vehicle_count=2,
                observations=["두 대의 차량이 보입니다."], unknown=[], retake_hint=None)
    return PhotoAnalysis(**{**base, **kw})


def test_a_korean_session_from_consent_to_summary():
    s = sm.new_session("KR")
    assert s.accident_state == states.KR and s.accident_state_via == "system"
    p = sm.next_prompt(s)
    assert p.kind == "consent" and p.options == ["동의하고 시작"]
    sm.accept_consent(s)
    p = sm.next_prompt(s)
    assert p.text == kr.QUESTIONS["danger"] and p.options == ["예", "아니요", "모르겠어요"]
    assert sm.answer_safety(s, "다친 사람 없어요") and sm.answer_safety(s, "움직일 수 있어요")
    assert s.stage is sm.Stage.GUIDE and s.emergency.level == "none"
    p = sm.next_prompt(s)
    assert p.step_kind == "list" and p.text == kr.LIST_HEADING and p.options == ["다음", "사진 촬영으로 건너뛰기"]
    sm.guide(s, "skip")
    p = sm.next_prompt(s)
    assert p.kind == "photo" and p.text == kr.ITEM_TEXT["damage"][1]   # my own damage comes first in Korea
    assert [sl.item_id for sl in s.slots][:3] == ["damage", "other_vehicle", "scene_wide"]
    verdict = sm.submit_photo(s, analysis(sharpness="blurry"))
    assert not verdict.accepted and verdict.message == kr.PHOTO_MESSAGES["not_clear"]
    assert sm.next_prompt(s).retake_message == kr.PHOTO_MESSAGES["not_clear"]
    sm.submit_photo(s, analysis())
    sm.skip_item(s, "상대 운전자가 거절했어요")
    sm.skip_item(s, "")
    assert s.stage is sm.Stage.HUB
    hub = sm.next_prompt(s)
    assert hub.text == kr.HUB_TEXT and hub.options[0] == kr.HUB_CREATE and "3장" in hub.options[1]
    sm.go_to(s, "info")
    assert sm.next_prompt(s).options == list(kr.INFO_FIELDS.values())
    sm.set_info(s, "statement", "뒤차가 부딪혔어요")
    sm.finish(s)
    summary = sm.build_summary(s)
    titles = [sec.title for sec in summary.sections]
    assert titles == [kr.SUMMARY[k] for k in ("basic", "safety", "statement", "photos", "ai", "others")]
    basic = summary.sections[0].items
    assert [i.label for i in basic] == ["시각"] and basic[0].value.endswith("KST")   # no state row in Korea
    assert summary.disclaimer == kr.DISCLAIMER and summary.country == "KR"
    ai_labels = [i.label for i in summary.sections[4].items]
    assert "내 차 손상 부위 - 눈에 보이는 손상" in ai_labels and "내 차 손상 부위 - 관찰" in ai_labels
    text = sm.render_summary_text(summary)
    assert "[내 진술]" in text and "확인되지 않은 항목" in text and kr.DISCLAIMER in text
    assert any("(이유: 이유 없음)" in m for m in summary.missing)


def test_a_korean_emergency_goes_straight_to_photos_after_the_call():
    s = sm.new_session("KR")
    sm.accept_consent(s)
    sm.answer_safety(s, "불이 났어요")
    assert s.stage is sm.Stage.EMERGENCY
    p = sm.next_prompt(s)
    assert p.text == "안전이 먼저입니다." and p.options == ["알겠어요"] and [b.number for b in p.call_buttons] == ["119", "112"]
    sm.acknowledge_emergency(s)
    assert s.stage is sm.Stage.PHOTOS and sm.next_prompt(s).warning == kr.PHOTO_WARNING


def test_the_english_session_is_unchanged():
    s = sm.new_session("US")
    sm.accept_consent(s)
    assert sm.next_prompt(s).text == "Is anyone hurt, or do you see smoke, fire, or fuel?"
    assert checklist.item_title(checklist.ITEMS[0], "US") == "Wide shot of the scene"


# ---------- Forbidden output in Korean ----------

@pytest.mark.parametrize("text", [
    "상대방 과실입니다.", "이 사고는 당신 잘못이에요.", "수리비는 50만원 정도 나옵니다.", "골절일 수 있어요.",
    "변호사를 선임하세요.", "합의금을 받으세요.", "여기에 서명하지 마세요.", "사과하지 마세요.",
])
def test_the_guard_blocks_korean_judgments(text):
    assert not guard.is_safe(text), text


@pytest.mark.parametrize("text", ["두 대의 차량이 보입니다.", "번호판이 잘 보이지 않아요.", "도로에 표지판이 있습니다."])
def test_the_guard_lets_plain_observations_through(text):
    assert guard.is_safe(text)


def test_the_answer_check_blocks_korean_judgments_but_allows_declining():
    notes = "도로교통법 제54조"
    assert not assistant.check_answer("이 사고는 상대방 과실입니다.", notes)
    assert not assistant.check_answer("수리비는 50만원이 나올 거예요.", notes)
    assert not assistant.check_answer("신고하지 않아도 됩니다.", notes)
    assert assistant.check_answer("저는 과실을 판단할 수 없어요. 과실은 경찰이나 보험사가 결정해요.", notes)
    assert assistant.check_answer("사고가 나면 바로 차를 멈추고 구호 조치를 하세요.", notes)
    # a Korean answer with stray foreign words, or a law article the notes do not name, is not shown
    assert not assistant.check_answer("외국인도 동일한 의무가 적용됩니다. duly reporting is required.", notes)
    assert not assistant.check_answer("사고 후 조치 항参照을 보세요.", notes)
    assert not assistant.check_answer("무면허 운전은 도로교통법 제152조에 따라 처벌받습니다.", notes)
    assert assistant.check_answer("자세한 내용은 law.go.kr 에서 확인하세요.", notes)
    assert assistant.check_answer("도로교통법 제54조를 확인하세요.", notes + " 도로교통법 제54조 (사고 발생 시의 조치)")


# ---------- Free questions ----------

def ask(question, s=None):
    s = s or sm.new_session("KR")
    sm.accept_consent(s)
    settings = Settings(api_key=None, base_url="http://x/", vision_model="v", max_image_bytes=1, vision_max_tokens=1,
                        request_timeout=5, assistant_model="fake-model", assistant_max_tokens=100, cors_origins=())
    return asyncio.run(assistant.ask(s, question, settings=settings))


def test_a_danger_question_gets_the_fixed_119_answer_without_the_model():
    r = ask("다친 사람이 있어요 어떡해요")
    assert r.kind == "safety" and r.answer == kr.SAFETY_ANSWER and r.note == kr.NOTE
    assert [b.number for b in r.call_buttons] == ["119", "112"]


def test_without_a_key_the_korean_helper_says_it_is_unavailable_in_korean():
    r = ask("보험 접수는 어떻게 하나요?")
    assert r.kind == "unavailable" and r.answer == kr.UNAVAILABLE_ANSWER


def test_the_korean_tools_know_only_korea():
    s = sm.new_session("KR")
    out = assistant.run_tool("lookup_state_notes", {"state": "FL"}, s, [])
    assert out["state"] == "대한민국" and out["caveat"] == states.load().disclaimer_kr
    assert assistant.tools_for("KR")[0]["function"]["parameters"]["properties"]["state"]["enum"] == ["KR"]
    assert assistant.run_tool("emergency_numbers", {}, s, []) == kr.NUMBERS
    steps = assistant.run_tool("what_to_do_now", {}, s, [])["steps"]
    assert steps and all(any("가" <= ch <= "힣" for ch in step) for step in steps)
    us = sm.new_session("US")
    assert assistant.run_tool("lookup_state_notes", {"state": "KR"}, us, [])["error"]


# ---------- Conversation watch ----------

WATCH = [
    ("제 잘못이에요 죄송합니다", ["fault"]),
    ("제가 못 봤어요", ["fault"]),
    ("그냥 현금으로 해결하죠", ["deal"]),
    ("경찰은 부르지 마세요", ["police"]),
    ("저 먼저 가봐야 해서요", ["leaving"]),
    ("여기 서명해 주세요", ["sign"]),
    ("고소하겠습니다", ["hostile"]),
    ("저는 괜찮아요 근데 목이 아파요", ["pain"]),
    ("안녕하세요 괜찮으세요", []),            # a greeting alone is never flagged
    ("사고 났네요 연락처 주세요", []),
]


@pytest.mark.parametrize("text,ids", WATCH)
def test_korean_watch_rules(text, ids):
    assert [r.id for r in watch_hints.match(text, "KR")] == ids


def test_the_korean_rules_are_served_compact_and_each_has_a_clip_sentence():
    r = client.get("/api/watch-rules?country=KR").json()
    assert r["compact"] is True and r["cooldown_seconds"] == kr.WATCH_COOLDOWN_SECONDS
    for rule in r["rules"]:
        assert all(" " not in p for p in rule["phrases"])
    assert [x["hint"] for x in r["rules"]] == watch_hints.hints("KR")
    assert client.get("/api/watch-rules").json()["compact"] is False
    ids = [r.id for r in watch_hints.RULES_KR]
    english = [r.id for r in watch_hints.RULES]
    assert ids[:len(english)] == english and ids[len(english):] == ["coverage", "refuse", "uninsured", "tow"]   # the Korean ones add insurance situations


# ---------- Spoken clips ----------

def test_the_korean_clip_list_is_complete_and_the_shipped_clips_exist():
    prompts = prompt_audio.fixed_prompts("KR")
    assert 40 <= len(prompts) <= 80 and len(prompts) == len(set(prompts))
    for text in [kr.RETRY_PREFIX, kr.CONSENT_TEXT, kr.QUESTIONS["danger"], kr.QUESTIONS["movable"], kr.LIST_HEADING,
                 *kr.EMERGENCY_ACTIONS, kr.CAUTION_ACTION, *kr.LIST_ITEMS, *watch_hints.hints("KR")]:
        assert prompt_audio.normalize(text) in prompts, text
    manifest = prompt_audio.KR_AUDIO_DIR / prompt_audio.MANIFEST
    if manifest.exists():  # clips are optional, but if they are shipped they must cover every sentence
        items = json.loads(manifest.read_text(encoding="utf-8"))["items"]
        assert set(prompts) <= set(items)
        for name in items.values():
            assert (manifest.parent / name).exists(), name
    assert prompt_audio.KR_VOICE.startswith("Magpie-Multilingual.KO-KR.")


def test_the_english_clip_list_is_untouched_by_the_korean_one():
    assert not any("가" <= ch <= "힣" for text in prompt_audio.fixed_prompts("US") for ch in text)


# ---------- API ----------

def test_the_api_serves_a_korean_session():
    r = client.post("/api/sessions", json={"country": "KR"}).json()
    sid = r["session"]["id"]
    assert r["session"]["country"] == "KR" and r["prompt"]["options"] == ["동의하고 시작"]
    assert r["info_fields"]["statement"] == "무슨 일이 있었나요" and r["checklist"][0]["title"] == "내 차 손상 부위"
    client.post(f"/api/sessions/{sid}/consent")
    r = client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": "다친 사람이 있어요"}).json()
    assert r["session"]["stage"] == "emergency" and [b["number"] for b in r["prompt"]["call_buttons"]] == ["119", "112"]
    assert client.get("/api/states?country=KR").json()["states"] == []
    assert client.post("/api/sessions", json={"country": "ZZ"}).status_code == 422


def test_the_korean_session_refuses_a_us_state():
    sid = client.post("/api/sessions", json={"country": "KR"}).json()["session"]["id"]
    client.post(f"/api/sessions/{sid}/consent")
    client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": "아니요"})
    client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": "네"})
    assert client.post(f"/api/sessions/{sid}/state", json={"state": "FL"}).status_code == 422


# ---------- The browser side ----------

@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_korean_commands_watch_matching_and_translation_in_the_browser_code():
    run = subprocess.run(["node", str(SCRIPT)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr + run.stdout
    assert "korea checks passed" in run.stdout
