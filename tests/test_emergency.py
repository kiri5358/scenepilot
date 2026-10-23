import pytest

from scenepilot.emergency import Answer, evaluate, parse_answer

Y, N, U = Answer.YES, Answer.NO, Answer.UNSURE

# (injury, fire, movable, road_hazard) -> expected level. The "20 emergency rule scenarios" from the plan.
SCENARIOS = [
    ((Y, N, Y, N), "emergency"),
    ((Y, N, N, Y), "emergency"),
    ((Y, Y, Y, Y), "emergency"),
    ((N, Y, Y, N), "emergency"),
    ((N, Y, N, N), "emergency"),
    ((U, N, Y, N), "emergency"),
    ((N, U, Y, N), "emergency"),
    ((U, U, U, U), "emergency"),
    ((Y, N, Y, U), "emergency"),
    ((N, Y, Y, Y), "emergency"),
    ((N, N, Y, N), "none"),
    ((N, N, U, N), "none"),
    ((N, N, Y, Y), "caution"),
    ((N, N, Y, U), "caution"),
    ((N, N, N, N), "caution"),
    ((N, N, N, Y), "caution"),
    ((N, N, U, Y), "caution"),
    ((N, N, N, U), "caution"),
    ((N, N, U, U), "caution"),
    ((N, N, Y, N), "none"),
]


@pytest.mark.parametrize("vals,expected", SCENARIOS)
def test_emergency_levels(vals, expected):
    answers = dict(zip(("injury", "fire", "movable", "road_hazard"), vals))
    assert evaluate(answers).level == expected


def test_twenty_scenarios():
    assert len(SCENARIOS) == 20


# Questions beyond the first four: vulnerable road user, airbag, someone left the scene.
LEVEL_CASES = [
    ({"vulnerable": Y}, "serious"),
    ({"vulnerable": U}, "serious"),
    ({"airbag": Y}, "serious"),
    ({"airbag": U}, "serious"),
    ({"left_scene": Y}, "serious"),
    ({"left_scene": U}, "serious"),
    ({"vulnerable": Y, "airbag": Y, "left_scene": Y}, "serious"),
    ({"injury": Y, "airbag": Y}, "emergency"),
    ({"fire": Y, "left_scene": Y}, "emergency"),
    ({"airbag": Y, "movable": N, "road_hazard": Y}, "serious"),
    ({"vulnerable": N, "airbag": N, "left_scene": N, "movable": Y, "road_hazard": N}, "none"),
    ({"vulnerable": N, "airbag": N, "left_scene": N, "movable": N}, "caution"),
]


@pytest.mark.parametrize("answers,expected", LEVEL_CASES)
def test_serious_levels(answers, expected):
    assert evaluate(answers).level == expected


def test_serious_guidance_and_title():
    d = evaluate({"left_scene": Y})
    assert d.title == "This may be serious."
    assert "Call 911 now and tell them what happened." in d.actions[0]
    assert any("Do not chase them" in a for a in d.actions)
    assert [b.number for b in d.call_buttons] == ["911"]


def test_emergency_title_and_details_for_serious_facts():
    d = evaluate({"injury": Y, "airbag": Y})
    assert d.title == "Safety first."
    assert "Tell them an airbag went off." in d.actions


def test_injury_gives_a_911_button():
    d = evaluate({"injury": Y})
    assert d.level == "emergency"
    assert [b.number for b in d.call_buttons] == ["911"]
    assert "Call 911" in d.actions[0]


def test_fire_tells_to_get_away_first():
    d = evaluate({"fire": Y})
    assert "Get away from the vehicle" in d.actions[0]
    assert [b.number for b in d.call_buttons] == ["911"]


def test_one_button_when_every_service_is_911():
    d = evaluate({"injury": Y, "fire": Y, "road_hazard": Y})
    assert [b.number for b in d.call_buttons] == ["911"]


def test_unanswered_questions_are_ignored():
    assert evaluate({}).level == "none"


def test_unsupported_country():
    with pytest.raises(ValueError):
        evaluate({}, "KR")


@pytest.mark.parametrize(
    "text,qid,expected",
    [
        # direct answers
        ("yes", "injury", Y),
        ("Yes", "fire", Y),
        ("No", "injury", N),
        ("unsure", "injury", U),
        ("Yeah.", "movable", Y),
        ("Nope", "road_hazard", N),
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
        ("I'm not sure", "injury", U),
        ("I don't know", "fire", U),
        ("maybe", "movable", U),
        # fire
        ("there is smoke", "fire", Y),
        ("I smell gas", "fire", Y),
        ("No smoke", "fire", N),
        ("I don't see any smoke", "fire", N),
        ("I don't smell gas", "fire", N),
        # movable / road hazard
        ("Yes I can move it", "movable", Y),
        ("I can't move it", "movable", N),
        ("it won't start", "movable", N),
        ("No, it's blocking the lane", "road_hazard", N),
        # pedestrian / bicyclist / motorcyclist
        ("a motorcyclist hit us", "vulnerable", Y),
        ("I saw a cyclist", "vulnerable", Y),
        ("No pedestrians", "vulnerable", N),
        ("no, just two cars", "vulnerable", N),
        # airbags
        ("the airbags went off", "airbag", Y),
        ("my airbag deployed", "airbag", Y),
        ("No airbags", "airbag", N),
        ("they didn't deploy", "airbag", N),
        ("the airbags did not go off", "airbag", N),
        # someone left
        ("he drove off", "left_scene", Y),
        ("the other car fled", "left_scene", Y),
        ("nobody left", "left_scene", N),
        ("they are still here", "left_scene", N),
        ("no one left the scene", "left_scene", N),
        # unclear: we ask again
        ("I'm fine", "injury", None),
        ("whatever", "injury", None),
        ("yes and no", "injury", None),
        ("", "injury", None),
    ],
)
def test_parse_answer(text, qid, expected):
    assert parse_answer(text, qid) == expected
