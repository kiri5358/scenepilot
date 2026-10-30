"""Korea edition: the insurance hand-over (what was hit, what was reported, the call card, later notes) and the new coaching situations."""
import pytest
from fastapi.testclient import TestClient

from scenepilot import coach, guard, kr, prompt_audio, watch_hints
from scenepilot import session as sm
from scenepilot.app import app
from scenepilot.coach import ModelReading
from scenepilot.schemas import PhotoAnalysis

client = TestClient(app)


def analysis():
    return PhotoAnalysis(scene_type="wide_scene", sharpness="clear", plate="readable", visible_damage="minor", vehicle_count=2,
                         observations=[], unknown=[], retake_hint=None)


def at_summary(country="KR") -> sm.Session:
    s = sm.new_session(country)
    sm.accept_consent(s)
    sm.answer_safety(s, "다친 사람 없어요"); sm.answer_safety(s, "움직일 수 있어요") if country == "KR" else sm.answer_safety(s, "no")
    sm.guide(s, "skip")
    for _ in range(3):
        sm.submit_photo(s, analysis())
    sm.go_to(s, "summary")
    return s


# ---------- what was hit, what was reported ----------

def test_the_record_starts_empty_and_every_row_is_offered():
    summary = sm.build_summary(at_summary())
    assert [r["id"] for r in summary.hit_rows] == list(kr.HIT_ITEMS) and {r["state"] for r in summary.hit_rows} == {"unknown"}
    assert [r["id"] for r in summary.coverage_rows] == list(kr.COVERAGE_ITEMS) and {r["state"] for r in summary.coverage_rows} == {"unknown"}


def test_a_choice_is_recorded_by_hand_and_nothing_else_changes():
    s = at_summary()
    sm.set_coverage(s, "my_insurer", "confirmed"); sm.set_hit(s, "person", "yes")
    rows = {r["id"]: r["state"] for r in sm.build_summary(s).coverage_rows}
    assert rows["my_insurer"] == "confirmed" and rows["injury_claim"] == "unknown"   # a report to one insurer says nothing about the injury
    assert {r["id"]: r["state"] for r in sm.build_summary(s).hit_rows}["person"] == "yes"


@pytest.mark.parametrize("item,state", [("bogus", "yes"), ("vehicle", "maybe")])
def test_unknown_items_and_states_are_refused(item, state):
    with pytest.raises(ValueError):
        sm.set_hit(at_summary(), item, state)
    with pytest.raises(ValueError):
        sm.set_coverage(at_summary(), item, "confirmed" if state == "yes" else state)


def test_the_english_edition_has_none_of_it():
    s = at_summary("US")
    with pytest.raises(ValueError):
        sm.set_coverage(s, "my_insurer", "confirmed")
    with pytest.raises(ValueError):
        sm.add_followup(s, "x")
    summary = sm.build_summary(s)
    assert summary.call_card == [] and summary.coverage_rows == [] and summary.uninsured is None and summary.titles == {}
    assert "접수" not in sm.render_summary_text(summary)


# ---------- the call card ----------

def test_the_call_card_is_filled_only_from_the_record_and_says_when_it_does_not_know():
    s = at_summary()
    card = sm.build_summary(s).call_card
    assert "부딪힌 대상은 아직 확인하지 못했습니다." in card and "현재 다친 사람은 없다고 답했습니다." in card
    assert "현장 사진은 3장 찍었고, 사진 분석은 참고용입니다." in card and card[-2:] == list(kr.CALL_CARD_END)
    assert "상대방 정보는 아직 확인하지 못했습니다." in card
    sm.set_hit(s, "vehicle", "yes"); sm.set_hit(s, "person", "yes")
    sm.go_to(s, "info"); sm.set_info(s, "other_plate", "12가3456"); sm.go_to(s, "summary")
    card = sm.build_summary(s).call_card
    assert "부딪힌 대상은 상대 차량, 사람입니다." in card and "상대 차량번호는 12가3456입니다." in card


def test_an_unconfirmed_ai_suggestion_never_goes_into_the_call_card():
    s = at_summary()
    sm.suggest_info(s, "other_plate", "99나9999")
    assert not any("99나9999" in line for line in sm.build_summary(s).call_card)


def test_the_fixed_sentences_of_the_hand_over_pass_the_forbidden_output_guard():
    texts = [kr.COVERAGE_NOTE, kr.CALL_CARD_NOTE, *kr.CALL_CARD_END, *kr.UNINSURED, kr.FOLLOWUP_NOTE, *kr.COVERAGE_ITEMS.values(), kr.CLEANUP]
    for text in texts:
        assert guard.is_safe(text), text


def test_the_uninsured_card_never_promises_repair_money_from_the_government():
    text = " ".join(kr.UNINSURED)
    assert "물적 피해만 있으면 대상이 아니에요" in text and kr.UNINSURED_SOURCE["url"].startswith("https://tacss.or.kr")


# ---------- later notes ----------

def test_a_later_note_is_added_with_a_time_and_the_first_record_is_kept():
    s = at_summary()
    before = sm.build_summary(s).sections
    sm.add_followup(s, "  다음 날 아침 목이 아프다고   했어요 ")
    summary = sm.build_summary(s)
    assert summary.followups[0]["text"] == "다음 날 아침 목이 아프다고 했어요" and summary.followups[0]["time"].endswith("KST")
    assert summary.sections == before
    assert "다음 날 아침 목이 아프다고 했어요" in sm.render_summary_text(summary) and kr.FOLLOWUP_TITLE in sm.render_summary_text(summary)


def test_later_notes_are_limited():
    s = at_summary()
    for bad in ("", "   ", "가" * (kr.FOLLOWUP_CHARS + 1)):
        with pytest.raises(ValueError):
            sm.add_followup(s, bad)
    for i in range(kr.FOLLOWUP_MAX):
        sm.add_followup(s, f"메모 {i}")
    with pytest.raises(ValueError):
        sm.add_followup(s, "하나 더")


def test_the_copy_text_lists_what_was_recorded():
    s = at_summary()
    sm.set_coverage(s, "vehicle_claim", "asked"); sm.set_hit(s, "vehicle", "yes")
    text = sm.render_summary_text(sm.build_summary(s))
    assert kr.COVERAGE_ITEMS["vehicle_claim"] + ": 물어봤어요" in text and "상대 차량 예" in text


# ---------- API ----------

def test_the_api_records_and_returns_the_summary():
    sid = client.post("/api/sessions", json={"country": "KR"}).json()["session"]["id"]
    assert client.post(f"/api/sessions/{sid}/coverage", json={"item": "number", "state": "confirmed"}).status_code == 409   # not at the summary yet
    s = sm.new_session("KR")
    from scenepilot.app import SESSIONS
    s = at_summary()
    SESSIONS[s.id] = s
    r = client.post(f"/api/sessions/{s.id}/coverage", json={"item": "number", "state": "confirmed"}).json()
    assert {x["id"]: x["state"] for x in r["summary"]["coverage_rows"]}["number"] == "confirmed"
    assert client.post(f"/api/sessions/{s.id}/hit", json={"item": "facility", "state": "yes"}).status_code == 200
    assert client.post(f"/api/sessions/{s.id}/hit", json={"item": "x", "state": "yes"}).status_code == 422
    r = client.post(f"/api/sessions/{s.id}/followup", json={"text": "추가 파손을 발견했어요"}).json()
    assert r["summary"]["followups"][0]["text"] == "추가 파손을 발견했어요"
    assert client.post(f"/api/sessions/{s.id}/followup", json={"text": "가" * 700}).status_code == 422


# ---------- new coaching situations ----------

@pytest.mark.parametrize("text,ids", [
    ("보험 접수했어요 이제 가시죠", ["coverage"]),
    ("그쪽 대인접수는 안 해준대요", ["refuse"]),
    ("저 보험이 없어요", ["uninsured"]),
    ("견인 무료예요 제가 견인차 부를게요", ["tow"]),
    ("안녕하세요 괜찮으세요", []),
])
def test_the_new_phrase_rules(text, ids):
    assert [r.id for r in watch_hints.match(text, "KR")] == ids


def test_each_new_situation_has_a_fixed_reminder_with_a_prerecorded_clip_and_a_safe_wording():
    prompts = set(prompt_audio.fixed_prompts("KR"))
    for rule in ("coverage", "refuse", "uninsured", "tow"):
        hint = next(r.hint for r in watch_hints.RULES_KR if r.id == rule)
        assert rule in kr.COACH_RISK_ORDER and prompt_audio.normalize(hint) in prompts and guard.is_safe(hint), rule


def test_the_coach_picks_the_fixed_reminder_for_a_filed_claim():
    s = at_summary()
    hints = coach.decide(s, ModelReading(risks=["coverage"]), 0).hints
    assert [h["id"] for h in hints] == ["coverage"] and "다친 분 접수를 각각 확인" in hints[0]["hint"]


@pytest.mark.parametrize("risk", ["coverage", "refuse", "uninsured", "tow"])
def test_an_insurance_situation_gets_the_exact_fixed_reminder_not_a_free_sentence(risk):
    s = at_summary()
    hints = coach.decide(s, ModelReading(risks=[risk], advice="경찰에 신고하고 보험사에 연락해 주세요."), 0).hints
    assert [h["id"] for h in hints] == [risk] and not any(h.get("free") for h in hints)


def test_a_threat_still_comes_before_the_insurance_reminders():
    s = at_summary()
    hints = coach.decide(s, ModelReading(risks=["coverage", "hostile", "tow"]), 0).hints
    assert [h["id"] for h in hints] == ["hostile", "tow"]


# ---------- the record of the call to the insurer ----------

def test_the_call_record_starts_at_before_and_keeps_only_what_the_user_typed():
    s = at_summary()
    assert sm.build_summary(s).contact["state"] == "before" and sm.build_summary(s).contact["number"] == ""
    sm.set_contact(s, state="connected"); sm.set_contact(s, number="  2026-1234  ", agent="김 담당 010-0000-0000")
    c = sm.build_summary(s).contact
    assert c["state"] == "connected" and c["number"] == "2026-1234" and c["agent"].startswith("김 담당")
    text = sm.render_summary_text(sm.build_summary(s))
    assert kr.CONTACT_TITLE in text and "접수번호: 2026-1234" in text


def test_pressing_call_or_a_filled_number_never_marks_the_claim_as_confirmed():
    s = at_summary()
    sm.set_contact(s, state="trying", number="12345")
    assert {r["id"]: r["state"] for r in sm.build_summary(s).coverage_rows}["number"] == "unknown"


def test_a_hurt_person_without_a_confirmed_injury_claim_gets_a_warning_on_the_call_record():
    s = at_summary()
    assert sm.build_summary(s).contact["warning"] is None
    sm.set_hit(s, "person", "yes")
    assert sm.build_summary(s).contact["warning"] == kr.CONTACT_WARNING
    sm.set_coverage(s, "injury_claim", "confirmed")
    assert sm.build_summary(s).contact["warning"] is None


def test_the_call_record_refuses_bad_input_and_the_english_edition():
    s = at_summary()
    for kwargs in ({"state": "done"}, {"number": "가" * 41}):
        with pytest.raises(ValueError):
            sm.set_contact(s, **kwargs)
    with pytest.raises(ValueError):
        sm.set_contact(at_summary("US"), state="trying")
    assert guard.is_safe(kr.CONTACT_NOTE) and guard.is_safe(kr.CONTACT_WARNING)


def test_the_call_record_api():
    from scenepilot.app import SESSIONS
    s = at_summary(); SESSIONS[s.id] = s
    r = client.post(f"/api/sessions/{s.id}/contact", json={"state": "told", "number": "A-1"}).json()
    assert r["summary"]["contact"]["state"] == "told" and r["summary"]["contact"]["number"] == "A-1"
    assert client.post(f"/api/sessions/{s.id}/contact", json={"state": "nope"}).status_code == 422


# ---------- the coaching screens: what to say, how urgent ----------

def test_every_reminder_the_coach_can_give_has_a_severity_and_every_risk_a_sentence_to_say():
    ids = {r.id for r in watch_hints.RULES_KR} | set(kr.COACH_HINTS)
    assert ids <= set(kr.COACH_SEVERITY) and set(kr.COACH_SEVERITY.values()) <= {1, 2, 3}
    for rid in ids - {"hostile", "drunk"}:   # a threat or drinking gets a safety instruction, not a line to say
        assert rid in kr.SAY_THIS, rid
    for text in [*kr.SAY_THIS.values(), kr.COACH_TELL_FIRST]:
        assert guard.is_safe(text), text


def test_danger_gets_three_pulses_and_a_missing_detail_gets_one():
    assert kr.COACH_SEVERITY["hostile"] == kr.COACH_SEVERITY["drunk"] == 3
    assert {kr.COACH_SEVERITY[i] for i in ("ask_contact", "ask_insurance", "ask_plate")} == {1}


def test_the_watch_rules_carry_the_sentences_for_the_korean_screen_only():
    r = client.get("/api/watch-rules?country=KR").json()
    assert r["say"] == kr.SAY_THIS and r["severity"] == kr.COACH_SEVERITY and r["tell_first"] == kr.COACH_TELL_FIRST
    assert "say" not in client.get("/api/watch-rules").json()
