"""Spoken answers in a noisy place: sound-alike words and the recognizer's other guesses."""
import pytest
from fastapi.testclient import TestClient

from scenepilot import session as sm
from scenepilot.app import app
from scenepilot.emergency import Answer, parse_alternatives, parse_answer


@pytest.mark.parametrize("heard, expected", [
    ("know", Answer.NO), ("Nope", Answer.NO), ("nah", Answer.NO), ("yeah", Answer.YES), ("yep", Answer.YES),
])
def test_one_word_sound_alikes(heard, expected):
    assert parse_answer(heard, "injury") is expected


def test_now_is_not_read_as_no():
    # "now" appears in many other sentences, so a lone "now" stays unclear and the question is asked again
    assert parse_answer("now", "injury") is None


def test_the_right_word_can_be_a_later_guess():
    assert parse_alternatives(["node", "gnome", "no", "nope"], "injury") is Answer.NO
    assert parse_alternatives(["node", "gnome"], "injury") is None


def test_guesses_that_agree_give_that_answer():
    assert parse_alternatives(["no", "know", "nope"], "fire") is Answer.NO


def test_guesses_that_disagree_take_the_cautious_side():
    assert parse_alternatives(["no", "yes"], "injury") is Answer.UNSURE
    assert parse_alternatives(["nobody is hurt", "somebody is hurt"], "injury") is Answer.UNSURE


def test_session_uses_the_other_guesses():
    s = sm.new_session()
    sm.accept_consent(s)
    assert sm.answer_safety(s, "node", ["gnome", "no"]) is True
    assert s.safety_answers["injury"] is Answer.NO


def test_session_asks_again_when_no_guess_is_understood():
    s = sm.new_session()
    sm.accept_consent(s)
    assert sm.answer_safety(s, "node", ["gnome"]) is False
    assert "injury" not in s.safety_answers


def test_api_accepts_the_guesses_and_limits_them():
    client = TestClient(app)
    sid = client.post("/api/sessions", json={"country": "US"}).json()["session"]["id"]
    client.post(f"/api/sessions/{sid}/consent")
    ok = client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": "node", "alternatives": ["no"]})
    assert ok.status_code == 200 and ok.json()["understood"] is True
    assert client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": "no", "alternatives": ["x"] * 9}).status_code == 422
    assert client.post(f"/api/sessions/{sid}/safety-answer", json={"answer": "no"}).status_code == 200  # guesses are optional
