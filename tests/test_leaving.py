"""Korea edition: the check before leaving, the next steps, the photo order and clearing the record."""
from fastapi.testclient import TestClient

from scenepilot import guard, kr, prompt_audio
from scenepilot import session as sm
from scenepilot.app import SESSIONS, app
from scenepilot.schemas import PhotoAnalysis

client = TestClient(app)


def analysis(**kw):
    base = dict(scene_type="wide_scene", sharpness="clear", plate="readable", visible_damage="minor", vehicle_count=2,
                observations=[], unknown=[], retake_hint=None)
    return PhotoAnalysis(**{**base, **kw})


def at_summary(skip_all=False) -> sm.Session:
    s = sm.new_session("KR")
    sm.accept_consent(s)
    sm.answer_safety(s, "다친 사람 없어요"); sm.answer_safety(s, "움직일 수 있어요")
    sm.guide(s, "skip")
    for _ in range(3):
        sm.skip_item(s, "x") if skip_all else sm.submit_photo(s, analysis())
    sm.go_to(s, "summary")
    return s


def test_korean_photos_are_taken_in_the_new_order_and_english_ones_are_not():
    assert [sl.item_id for sl in sm.new_session("KR").slots][:3] == ["damage", "other_vehicle", "scene_wide"]
    assert sm.new_session("KR").slots[0].item_id == "damage"
    assert [sl.item_id for sl in sm.new_session("US").slots][:3] == ["scene_wide", "other_vehicle", "damage"]
    assert {sl.item_id for sl in sm.new_session("KR").slots} == {sl.item_id for sl in sm.new_session("US").slots}


def test_the_leave_check_lists_what_is_missing_and_never_blocks():
    s = at_summary(skip_all=True)
    lines = sm.leave_check(s)
    assert lines[0] == kr.LEAVE_LEAD and set(kr.LEAVE_ALWAYS) <= set(lines)
    assert "내 차 손상 부위: 아직 찍지 않았어요." in lines and "상대 차량과 번호판: 아직 찍지 않았어요." in lines
    assert all(sentence in lines for sentence in kr.LEAVE_INFO.values())
    assert s.stage is sm.Stage.SUMMARY   # it only warns


def test_the_leave_check_shrinks_as_things_are_filled_in():
    s = at_summary()
    assert not any("아직 찍지 않았어요" in x for x in sm.leave_check(s))
    for field, value in (("other_contact", "홍길동 010 1111 2222"), ("other_insurance", "삼성화재"), ("other_plate", "12가3456")):
        sm.go_to(s, "info"); sm.set_info(s, field, value); sm.go_to(s, "summary")
    assert sm.leave_check(s) == [kr.LEAVE_LEAD, kr.LEAVE_NOTHING, *kr.LEAVE_ALWAYS]
    # an AI suggestion that the user has not confirmed does not count as done
    s2 = at_summary()
    sm.suggest_info(s2, "other_insurance", "현대해상")
    assert kr.LEAVE_INFO["other_insurance"] in sm.leave_check(s2)


def test_the_summary_prompt_reads_the_check_and_the_summary_carries_the_lists():
    s = at_summary()
    p = sm.next_prompt(s)
    assert p.kind == "summary" and p.text == kr.SUMMARY_READY and p.items == sm.leave_check(s)
    summary = sm.build_summary(s)
    assert summary.leave_check == p.items and summary.next_steps == list(kr.NEXT_STEPS) and summary.cleanup == kr.CLEANUP


def test_the_english_edition_has_none_of_it():
    s = sm.new_session("US")
    assert sm.leave_check(s) == []
    sm.accept_consent(s)
    s.stage = sm.Stage.SUMMARY
    summary = sm.build_summary(s)
    assert summary.leave_check == [] and summary.next_steps == [] and summary.cleanup is None
    assert sm.next_prompt(s).items == []


def test_every_sentence_in_these_lists_passes_the_forbidden_output_guard():
    texts = [kr.LEAVE_LEAD, kr.LEAVE_NOTHING, kr.LEAVE_WARNING, kr.CLEANUP, *kr.LEAVE_INFO.values(), *kr.LEAVE_ALWAYS, *kr.NEXT_STEPS, *kr.LIST_ITEMS]
    texts += [kr.LEAVE_PHOTO.format(title=kr.ITEM_TEXT[i][0]) for i in ("damage", "other_vehicle", "scene_wide")]
    for text in texts:
        assert guard.is_safe(text), text


def test_every_sentence_of_the_check_has_a_prerecorded_clip():
    wanted = {prompt_audio.normalize(t) for t in prompt_audio.fixed_prompts("KR")}
    for s in (at_summary(), at_summary(skip_all=True)):
        for line in sm.leave_check(s):
            assert prompt_audio.normalize(line) in wanted, line


def test_the_blackbox_reminder_is_in_the_first_list():
    assert any("블랙박스" in item for item in kr.LIST_ITEMS)


def test_a_record_can_be_cleared_from_the_server():
    sid = client.post("/api/sessions", json={"country": "KR"}).json()["session"]["id"]
    assert sid in SESSIONS and client.delete(f"/api/sessions/{sid}").json() == {"ok": True}
    assert sid not in SESSIONS
    assert client.get(f"/api/sessions/{sid}").status_code == 404
    assert client.delete(f"/api/sessions/{sid}").status_code == 404
