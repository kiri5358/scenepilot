import pytest

from scenepilot.checklist import ITEMS, _DEFAULT_MESSAGES
from scenepilot.emergency import SAFETY_QUESTIONS, Answer, evaluate
from scenepilot.playbooks import guide_steps
from scenepilot.guard import filter_items, find_violations, guard_or_fallback, is_safe, sanitize_analysis
from scenepilot.schemas import PhotoAnalysis

UNSAFE = [
    ("The other driver is at fault.", "fault"),
    ("It was his fault.", "fault"),
    ("You are to blame for this.", "fault"),
    ("The driver ran the red light.", "fault"),
    ("He was speeding.", "fault"),
    ("The repair will cost $2,000.", "money"),
    ("Expect a repair estimate of 3000 dollars.", "money"),
    ("Your insurance payout will be large.", "money"),
    ("You should sue the other driver.", "legal"),
    ("Talk to an attorney.", "legal"),
    ("Don't admit anything.", "admission_advice"),
    ("Do not sign anything.", "admission_advice"),
    ("It looks like a fractured arm.", "medical"),
    ("The driver appears seriously injured.", "medical"),
]
SAFE = [
    "A red car is on the road.",
    "The license plate cannot be read.",
    "Hold still and take the photo again.",
    "The windshield is cracked.",
    "There is a speed limit sign next to the road.",
    "Two vehicles are visible, one with a dented rear bumper.",
]


@pytest.mark.parametrize("text,category", UNSAFE)
def test_unsafe_text_is_flagged(text, category):
    assert category in {v.category for v in find_violations(text)}


@pytest.mark.parametrize("text", SAFE)
def test_safe_text_passes(text):
    assert is_safe(text)


def test_filter_items():
    kept, removed = filter_items(["A car is visible.", "The repair estimate will be high."])
    assert kept == ["A car is visible."]
    assert removed == ["The repair estimate will be high."]


def test_guard_or_fallback():
    assert guard_or_fallback("Please retake it.", "default") == "Please retake it."
    assert guard_or_fallback("The other driver is at fault.", "default") == "default"
    assert guard_or_fallback(None, "default") is None


def test_sanitize_analysis_removes_violations():
    a = PhotoAnalysis(
        scene_type="wide_scene", sharpness="clear", plate="not_readable", visible_damage="major",
        observations=["Two cars are visible.", "The rear driver is clearly at fault."],
        unknown=["Repair cost estimate", "Cause of the accident"],
        retake_hint="You should sue.",
    )
    cleaned, removed = sanitize_analysis(a)
    assert cleaned.observations == ["Two cars are visible."]
    assert cleaned.unknown == ["Cause of the accident"]
    assert cleaned.retake_hint is None
    assert removed == 3


def test_our_own_fixed_texts_pass_the_guard():
    """Our own guidance text must not break our own forbidden-output rules (the disclaimer and consent text are excluded)."""
    texts = [i.instruction for i in ITEMS] + list(_DEFAULT_MESSAGES.values())
    texts += [q.text for q in SAFETY_QUESTIONS]
    d = evaluate({"injury": Answer.YES, "fire": Answer.YES, "road_hazard": Answer.YES})
    texts += d.actions
    serious = evaluate({"vulnerable": Answer.YES, "airbag": Answer.YES, "left_scene": Answer.YES, "road_hazard": Answer.YES})
    texts += serious.actions + [serious.title, d.title]
    for level in ("none", "caution", "serious", "emergency"):
        for movable in (Answer.YES, Answer.NO):
            texts += [st.text for st in guide_steps(level, {"movable": movable}) if st.kind != "state_note"]
    bad = [(t, find_violations(t)) for t in texts if find_violations(t)]
    assert not bad, bad
