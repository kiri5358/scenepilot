import pytest

from scenepilot import session as sm
from scenepilot.checklist import ITEM_BY_ID, ItemStatus, Reason, evaluate_photo
from scenepilot.schemas import PhotoAnalysis


def analysis(**kw) -> PhotoAnalysis:
    base = dict(
        scene_type="wide_scene", sharpness="clear", plate="not_readable", visible_damage="unclear",
        vehicle_count=2, observations=["Two vehicles are visible."], unknown=["Cause of the accident"], retake_hint=None,
    )
    base.update(kw)
    return PhotoAnalysis(**base)


GOOD = {  # in shooting order: 3 core photos, then 2 extras
    "scene_wide": analysis(),
    "other_vehicle": analysis(scene_type="vehicle_full", vehicle_count=1, plate="readable"),
    "damage": analysis(scene_type="damage_closeup", vehicle_count=1, visible_damage="major"),
    "own_vehicle": analysis(scene_type="vehicle_full", vehicle_count=1),
    "road": analysis(scene_type="road_condition", vehicle_count=0),
}
CORE = ["scene_wide", "other_vehicle", "damage"]
EXTRA = ["own_vehicle", "road"]


# danger, movable
SAFE_ANSWERS = ("No", "Yes")


def to_guide(s: sm.Session) -> None:
    sm.accept_consent(s)
    for ans in SAFE_ANSWERS:
        assert sm.answer_safety(s, ans)
    assert s.stage is sm.Stage.GUIDE


def to_photos(s: sm.Session) -> None:
    to_guide(s)
    sm.guide(s, "skip")
    assert s.stage is sm.Stage.PHOTOS


def shoot(s: sm.Session, ids: list[str]) -> None:
    for item_id in ids:
        assert sm.current_item_id(s) == item_id
        assert sm.submit_photo(s, GOOD[item_id]).accepted


def to_hub(s: sm.Session) -> None:
    to_photos(s)
    shoot(s, CORE)
    assert s.stage is sm.Stage.HUB


def test_full_flow_with_source_tags():
    s = sm.new_session()
    assert sm.next_prompt(s).kind == "consent"
    to_photos(s)
    assert s.emergency.level == "none"

    shoot(s, CORE)
    assert s.stage is sm.Stage.HUB and sm.current_item_id(s) is None  # extra photos appear only when the user chooses them
    sm.go_to(s, "photos")
    shoot(s, EXTRA)
    assert sm.current_item_id(s) == "documents"
    sm.skip_item(s, "The other driver said no")
    assert s.stage is sm.Stage.HUB

    sm.go_to(s, "info")
    sm.set_info(s, "statement", "Rear-ended while stopped at a light.")
    sm.set_info(s, "other_plate", "ABC1234", source=sm.Source.AI_OBSERVATION)  # a value read by AI
    assert s.info["other_plate"].confirmed is False
    sm.finish(s)
    summary = sm.build_summary(s)
    text = sm.render_summary_text(summary)

    assert "[Your statement]" in text
    assert "[AI observation, unverified]" in text
    assert "ABC1234 (not yet confirmed) [Unconfirmed]" in text
    assert "Other vehicle license plate: needs your confirmation" in summary.missing
    assert "Other driver's documents (optional): Skipped (reason: The other driver said no)" in summary.missing
    assert "- Other driver's documents (optional): Skipped (reason: The other driver said no) [Unconfirmed]" in text
    assert "does not decide who is at fault" in text


def test_confirming_info_changes_source():
    s = sm.new_session()
    to_hub(s)
    sm.go_to(s, "info")
    sm.set_info(s, "other_plate", "ABC1234", source=sm.Source.AI_OBSERVATION)
    sm.confirm_info(s, "other_plate")
    assert s.info["other_plate"].confirmed is True
    sm.finish(s)
    assert "ABC1234 [Your statement]" in sm.render_summary_text(sm.build_summary(s))


def test_scene_mode_core_only_summary_then_resume():
    """Scene mode: take only the 3 core photos and summarize right away. The rest shows as 'Not taken' and can be added later."""
    s = sm.new_session()
    to_hub(s)
    p = sm.next_prompt(s)
    assert p.kind == "hub" and any("3 left" in o for o in p.options)
    assert sm.photo_progress(s) == {"core_done": 3, "core_total": 3, "extra_done": 0, "extra_total": 3, "extra_mode": False}

    sm.go_to(s, "summary")
    summary = sm.build_summary(s)
    assert "Your vehicle: Not taken" in summary.missing and "Your account of what happened" in summary.missing
    assert not any("Wide shot of the scene" in m for m in summary.missing)  # the core photos are done

    sm.go_to(s, "hub")  # add more
    sm.go_to(s, "photos")
    shoot(s, EXTRA[:1])
    assert s.stage is sm.Stage.PHOTOS and sm.current_item_id(s) == "road"
    sm.go_to(s, "hub")  # stop here and go back
    assert s.stage is sm.Stage.HUB and s.extra_mode is False
    assert sm.photo_progress(s)["extra_done"] == 1


def test_hub_rules():
    s = sm.new_session()
    to_photos(s)
    with pytest.raises(sm.StateError):
        sm.go_to(s, "hub")  # cannot go there before the core photos are done
    with pytest.raises(sm.StateError):
        sm.go_to(s, "summary")
    with pytest.raises(sm.StateError):
        sm.go_to(s, "info")
    shoot(s, CORE)
    with pytest.raises(ValueError):
        sm.go_to(s, "nowhere")
    with pytest.raises(sm.StateError):
        sm.submit_photo(s, analysis())  # the hub does not accept photos
    sm.go_to(s, "photos")
    shoot(s, EXTRA)
    sm.skip_item(s, "Not applicable")
    with pytest.raises(sm.StateError):
        sm.go_to(s, "photos")  # no extra photos left


def test_injury_forces_emergency_before_photos():
    s = sm.new_session()
    sm.accept_consent(s)
    assert sm.answer_safety(s, "Yes, my passenger is hurt")
    assert s.stage is sm.Stage.EMERGENCY
    p = sm.next_prompt(s)
    assert p.kind == "emergency" and any(b.number == "911" for b in p.call_buttons)
    with pytest.raises(sm.StateError):
        sm.submit_photo(s, analysis())  # no photos before the emergency guidance is acknowledged
    sm.acknowledge_emergency(s)
    assert s.stage is sm.Stage.PHOTOS  # 911 is the guidance: the vehicle question is not asked


def test_fire_or_a_cyclist_is_an_emergency_too():
    for answer in ("Yes, there is smoke", "Yes, a cyclist"):
        s = sm.new_session()
        sm.accept_consent(s)
        sm.answer_safety(s, answer)
        assert s.stage is sm.Stage.EMERGENCY and s.emergency.level == "emergency"
        p = sm.next_prompt(s)
        assert p.text == "Safety first." and "get away from the vehicle" in p.actions[0]
        assert any(b.number == "911" for b in p.call_buttons)


def test_unparseable_answer_twice_becomes_unsure_and_emergency():
    s = sm.new_session()
    sm.accept_consent(s)
    assert sm.answer_safety(s, "hmm") is False
    assert "didn't catch that" in sm.next_prompt(s).text
    assert sm.answer_safety(s, "uh") is True
    assert s.safety_answers["danger"].value == "unsure"
    assert s.stage is sm.Stage.EMERGENCY


def test_photo_verdicts():
    wide, own, other, damage = (ITEM_BY_ID[k] for k in ("scene_wide", "own_vehicle", "other_vehicle", "damage"))
    assert evaluate_photo(wide, analysis(sharpness="blurry", retake_hint="Hold still and try again.")).message == "Hold still and try again."
    assert "blurry or too dark" in evaluate_photo(wide, analysis(sharpness="dark", retake_hint="Repair costs will be high.")).message
    assert evaluate_photo(wide, analysis(vehicle_count=1)).reason is Reason.TOO_FEW_VEHICLES
    assert evaluate_photo(wide, analysis(vehicle_count=None)).reason is Reason.TOO_FEW_VEHICLES
    assert evaluate_photo(wide, analysis(scene_type="document")).reason is Reason.WRONG_SCENE
    assert evaluate_photo(other, analysis(scene_type="vehicle_full")).reason is Reason.PLATE_UNREADABLE
    assert evaluate_photo(damage, analysis(scene_type="road_condition", visible_damage="major")).reason is Reason.WRONG_SCENE
    assert evaluate_photo(damage, analysis(scene_type="vehicle_full", visible_damage="unclear")).reason is Reason.DAMAGE_NOT_VISIBLE
    assert evaluate_photo(damage, analysis(scene_type="damage_closeup", visible_damage="none")).reason is Reason.DAMAGE_NOT_VISIBLE
    assert evaluate_photo(damage, analysis(scene_type="vehicle_full", visible_damage="major")).accepted
    assert evaluate_photo(own, analysis(scene_type="vehicle_full", vehicle_count=1)).accepted


def test_retake_keeps_same_item_and_counts_attempts():
    s = sm.new_session()
    to_photos(s)
    v = sm.submit_photo(s, analysis(sharpness="blurry"))
    assert not v.accepted
    slot = s.slots[0]
    assert slot.status is ItemStatus.NEEDS_RETAKE and slot.attempts == 1
    assert sm.next_prompt(s).retake_message
    assert sm.current_item_id(s) == "scene_wide"
    assert sm.submit_photo(s, analysis()).accepted
    assert sm.current_item_id(s) == "other_vehicle"


def test_missing_items_are_listed():
    s = sm.new_session()
    to_photos(s)
    while sm.current_item_id(s):
        sm.skip_item(s, "Not safe")
    sm.finish(s)
    summary = sm.build_summary(s)
    joined = " ".join(summary.missing)
    assert "Your account of what happened" in joined and "Wide shot of the scene: Skipped" in joined


def test_wrong_stage_actions_are_rejected():
    s = sm.new_session()
    with pytest.raises(sm.StateError):
        sm.answer_safety(s, "Yes")
    with pytest.raises(sm.StateError):
        sm.finish(s)
    with pytest.raises(sm.StateError):
        sm.build_summary(s)
    with pytest.raises(ValueError):
        sm.new_session("ZZ")


def _walk_to_state_step(s: sm.Session) -> int:
    """Advance with Next until the 'which state' step. Returns its index."""
    while sm.next_prompt(s).step_kind != "state":
        sm.guide(s, "next")
    return sm.next_prompt(s).step_index


def test_standard_guidance_steps_and_voice_text():
    s = sm.new_session()
    to_guide(s)
    assert s.emergency.level == "none"
    p = sm.next_prompt(s)
    assert p.kind == "guide" and p.step_index == 0 and len(p.steps) == 2 and p.step_kind == "list"
    assert "move out of traffic" in p.items[0]  # the vehicle can be moved
    assert len(p.items) == 6 and "note their plate and call the police" in p.items[3]
    assert p.text == p.steps[0] == "Take a breath. Here is what to do now."
    ask = _walk_to_state_step(s)
    assert ask == 1  # one screen lists every step, then the state question
    p = sm.next_prompt(s)
    assert p.step_kind == "state" and {x["code"] for x in p.states} == {"FL", "NY"}
    with pytest.raises(sm.StateError):
        sm.guide(s, "next")  # a state must be chosen first (or Not sure)
    sm.guide(s, "back")
    assert sm.next_prompt(s).step_index == ask - 1


def test_choose_florida_shows_florida_notes_with_sources():
    s = sm.new_session()
    to_guide(s)
    ask = _walk_to_state_step(s)
    sm.set_accident_state(s, "FL")
    assert s.accident_state == "FL" and s.stage is sm.Stage.GUIDE
    p = sm.next_prompt(s)
    assert p.step_index == ask + 1 and p.step_kind == "state_note"
    assert p.text.startswith("In Florida, report the crash right away")
    assert p.sources and all("leg.state.fl.us" in x["url"] for x in p.sources)
    assert p.state_disclaimer and "Not legal advice" in p.state_disclaimer
    while s.stage is sm.Stage.GUIDE:
        sm.guide(s, "next")
    assert s.stage is sm.Stage.PHOTOS
    sm.skip_item(s, "Not safe")
    while sm.current_item_id(s):
        sm.skip_item(s, "Not safe")
    sm.finish(s)
    items = {i.label: (i.value, i.source) for sec in sm.build_summary(s).sections for i in sec.items}
    assert items["State where the accident happened"] == ("Florida", sm.Source.USER_STATEMENT)


def test_choose_new_york_and_change_your_mind():
    s = sm.new_session()
    to_guide(s)
    ask = _walk_to_state_step(s)
    sm.set_accident_state(s, "FL")
    sm.guide(s, "back")  # back to the state step
    assert sm.next_prompt(s).step_kind == "state"
    sm.set_accident_state(s, "NY")
    p = sm.next_prompt(s)
    assert p.step_index == ask + 1 and p.text.startswith("In New York, each driver must send a written report")
    assert all("nysenate.gov" in x["url"] for x in p.sources)


@pytest.mark.parametrize("code,expected", [("OTHER", "I don't have details for that state"), ("UNSURE", "That's okay")])
def test_other_or_unsure_gets_the_general_reminder(code, expected):
    s = sm.new_session()
    to_guide(s)
    _walk_to_state_step(s)
    sm.set_accident_state(s, code)
    p = sm.next_prompt(s)
    assert p.step_kind == "text" and expected in p.text
    sm.guide(s, "next")
    assert s.stage is sm.Stage.PHOTOS


def test_state_choice_rules():
    s = sm.new_session()
    with pytest.raises(sm.StateError):
        sm.set_accident_state(s, "FL")  # wrong stage
    to_guide(s)
    with pytest.raises(ValueError):
        sm.set_accident_state(s, "TX")  # no notes for Texas
    sm.set_accident_state(s, "FL")  # choosing early records it but does not skip ahead
    assert sm.next_prompt(s).step_index == 0


def test_guidance_when_the_vehicle_cannot_move():
    s = sm.new_session()
    sm.accept_consent(s)
    for ans in ("No", "No"):  # danger = No, movable = No
        sm.answer_safety(s, ans)
    assert s.emergency.level == "caution"
    assert sm.next_prompt(s).items[0] == "Turn on your hazard lights and stay out of traffic."  # no "move it" advice


def test_emergency_skips_the_vehicle_question_and_the_guidance():
    s = sm.new_session()
    sm.accept_consent(s)
    sm.answer_safety(s, "Yes, my passenger is hurt")
    sm.acknowledge_emergency(s)
    assert s.stage is sm.Stage.PHOTOS  # 911 is the guidance: no more screens to read
    assert s.accident_state is None  # nobody was asked, and no location was available
    while sm.current_item_id(s):
        sm.skip_item(s, "Not safe")
    sm.finish(s)
    items = {i.label: (i.value, i.source) for sec in sm.build_summary(s).sections for i in sec.items}
    assert items["Situation level (rule-based)"][0] == "Emergency"
    assert items["Can your vehicle be moved to a safe spot out of traffic?"][0] == "Not asked"
    assert items["State where the accident happened"] == ("Not asked", sm.Source.UNCONFIRMED)


def test_emergency_takes_the_state_from_the_location_without_asking():
    s = sm.new_session()
    with pytest.raises(sm.StateError):
        sm.set_accident_state(s, "FL", via="location_auto")  # nothing has started yet
    sm.accept_consent(s)
    with pytest.raises(sm.StateError):
        sm.set_accident_state(s, "FL", via="location_auto")  # not an emergency: the user is asked instead
    sm.answer_safety(s, "Yes, my passenger is hurt")
    assert s.stage is sm.Stage.EMERGENCY
    sm.set_accident_state(s, "NY", via="location_auto")  # allowed while the emergency notice is showing
    assert (s.accident_state, s.accident_state_via, s.stage) == ("NY", "location_auto", sm.Stage.EMERGENCY)
    sm.set_accident_state(s, "FL", via="location_auto")  # an existing choice is never overridden
    assert s.accident_state == "NY"
    with pytest.raises(ValueError):
        sm.set_accident_state(s, "TX", via="location_auto")
    sm.acknowledge_emergency(s)
    assert s.stage is sm.Stage.PHOTOS
    while sm.current_item_id(s):
        sm.skip_item(s, "Not safe")
    sm.finish(s)
    items = {i.label: (i.value, i.source) for sec in sm.build_summary(s).sections for i in sec.items}
    value, source = items["State where the accident happened"]
    assert value == "New York (set automatically from your phone's location during an emergency; not confirmed)"
    assert source is sm.Source.UNCONFIRMED  # nobody confirmed it



def test_guide_rules():
    s = sm.new_session()
    with pytest.raises(sm.StateError):
        sm.guide(s, "next")
    to_guide(s)
    with pytest.raises(ValueError):
        sm.guide(s, "fly")


def test_an_emergency_asks_no_more_questions():
    s = sm.new_session()
    sm.accept_consent(s)
    sm.answer_safety(s, "Yes, my passenger is hurt")
    assert sm._next_question_id(s) is None
    assert sm.safety_question_count(s) == 1  # the vehicle question is skipped: 911 gives those instructions


def test_every_stage_prompt_matches_the_next_question_in_a_normal_flow():
    s = sm.new_session()
    sm.accept_consent(s)
    seen = []
    while s.stage is sm.Stage.SAFETY:
        p = sm.next_prompt(s)
        assert p.item_id == sm._next_question_id(s)
        seen.append(p.item_id)
        sm.answer_safety(s, "Yes" if p.item_id == "movable" else "No")
    assert seen == ["danger", "movable"]
    assert sm.safety_question_count(s) == 2


def test_close_shots_the_model_labels_differently_are_still_accepted():
    """Regression (user test 2026-10-23): one photo of two touching cars was labeled wide_scene or vehicle_full at random."""
    wide, other, damage = ITEM_BY_ID["scene_wide"], ITEM_BY_ID["other_vehicle"], ITEM_BY_ID["damage"]
    two_cars = dict(vehicle_count=2, visible_damage="minor", plate="readable")
    assert evaluate_photo(wide, analysis(scene_type="vehicle_full", **two_cars)).accepted
    assert evaluate_photo(other, analysis(scene_type="damage_closeup", **two_cars)).accepted
    assert evaluate_photo(damage, analysis(scene_type="wide_scene", **two_cars)).accepted
    # the conditions that matter still apply
    assert evaluate_photo(wide, analysis(scene_type="vehicle_full", vehicle_count=1)).reason is Reason.TOO_FEW_VEHICLES
    assert evaluate_photo(other, analysis(scene_type="damage_closeup", plate="not_readable", visible_damage="minor", vehicle_count=2)).reason is Reason.PLATE_UNREADABLE
    assert evaluate_photo(damage, analysis(scene_type="wide_scene", visible_damage="none", vehicle_count=2)).reason is Reason.DAMAGE_NOT_VISIBLE
