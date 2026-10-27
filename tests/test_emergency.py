import pytest

from scenepilot.emergency import Answer, evaluate, parse_answer

Y, N, U = Answer.YES, Answer.NO, Answer.UNSURE

# (danger, movable) -> expected level. Danger of any kind (or not sure) is an emergency; an unmovable car is a caution.
SCENARIOS = [
    ((Y, Y), "emergency"),
    ((Y, N), "emergency"),
    ((Y, U), "emergency"),
    ((U, Y), "emergency"),
    ((U, N), "emergency"),
    ((U, U), "emergency"),
    ((N, Y), "none"),
    ((N, U), "none"),
    ((N, N), "caution"),
]


@pytest.mark.parametrize("vals,expected", SCENARIOS)
def test_emergency_levels(vals, expected):
    assert evaluate(dict(zip(("danger", "movable"), vals))).level == expected


def test_danger_gives_one_911_button_and_the_911_steps():
    d = evaluate({"danger": Y})
    assert d.title == "Safety first." and d.triggers == ["danger"]
    assert [b.number for b in d.call_buttons] == ["911"]
    assert "get away from the vehicle" in d.actions[0] and "Call 911 now" in d.actions[1]


def test_unmovable_car_gives_the_hazard_lights_advice_without_a_call_button():
    d = evaluate({"danger": N, "movable": N})
    assert d.level == "caution" and d.title == "" and d.triggers == ["movable"]
    assert "hazard lights" in d.actions[0]
    assert d.call_buttons == []


def test_danger_wins_over_an_unmovable_car():
    d = evaluate({"danger": Y, "movable": N})
    assert d.level == "emergency" and d.triggers == ["danger"]


def test_unanswered_questions_are_ignored():
    assert evaluate({}).level == "none"


def test_unsupported_country():
    with pytest.raises(ValueError):
        evaluate({}, "KR")


@pytest.mark.parametrize(
    "text,qid,expected",
    [
        # direct answers
        ("yes", "danger", Y),
        ("Yes", "fire", Y),
        ("No", "injury", N),
        ("unsure", "danger", U),
        ("Yeah.", "movable", Y),
        ("Nope", "movable", N),
        # injury: danger signals win, negations are understood
        ("someone is hurt", "injury", Y),
        ("My passenger is bleeding", "injury", Y),
        ("He's unconscious", "injury", Y),
        ("I hit my head", "injury", Y),
        ("No, nobody is hurt", "injury", N),
        ("No one is hurt", "injury", N),
        ("no injuries", "injury", N),
        ("Everyone is okay", "injury", N),
        ("we're all fine", "injury", N),
        ("Nobody is hurt but I feel dizzy", "injury", Y),
        ("no one is hurt, no pain", "injury", N),
        # unsure
        ("I'm not sure", "danger", U),
        ("I don't know", "fire", U),
        ("maybe", "movable", U),
        # fire
        ("there is smoke", "fire", Y),
        ("I smell gas", "fire", Y),
        ("No smoke", "fire", N),
        ("I don't see any smoke", "fire", N),
        ("I don't smell gas", "fire", N),
        # movable
        ("Yes I can move it", "movable", Y),
        ("I can't move it", "movable", N),
        ("it won't start", "movable", N),
        # pedestrian / bicyclist / motorcyclist
        ("a motorcyclist hit us", "vulnerable", Y),
        ("I saw a cyclist", "vulnerable", Y),
        ("No pedestrians", "vulnerable", N),
        ("no, just two cars", "vulnerable", N),
        # the combined danger question: any of the three, with the negations of each
        ("my passenger is hurt", "danger", Y),
        ("I smell gas", "danger", Y),
        ("a cyclist was involved", "danger", Y),
        ("No, nobody is hurt and no smoke", "danger", N),
        ("no pedestrians, nobody is hurt", "danger", N),
        ("no, just two cars", "danger", N),
        ("Nobody is hurt but there is smoke", "danger", Y),
        # unclear: we ask again
        ("I'm fine", "danger", None),
        ("whatever", "danger", None),
        ("yes and no", "danger", None),
        ("", "danger", None),
    ],
)
def test_parse_answer(text, qid, expected):
    assert parse_answer(text, qid) == expected
