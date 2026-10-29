"""Korea edition: the short list of insurers' claims numbers."""
import re

from fastapi.testclient import TestClient

from scenepilot import guard, kr
from scenepilot.app import app

client = TestClient(app)


def test_the_list_is_served_for_korea_only():
    data = client.get("/api/insurers?country=KR").json()
    assert [x["name"] for x in data["insurers"]][:2] == ["삼성화재", "현대해상"] and data["verified"] == kr.INSURERS_VERIFIED
    assert client.get("/api/insurers?country=US").json() == {"insurers": []}
    assert client.get("/api/insurers").json() == {"insurers": []}


def test_every_entry_has_a_phone_number_a_source_and_no_duplicates():
    names = [x["name"] for x in kr.INSURERS]
    assert len(names) == len(set(names))
    for x in kr.INSURERS:
        assert re.fullmatch(r"\d{4}-\d{4}", x["phone"]), x
        assert x["source"].startswith("https://") and any(h in x["source"] for h in ("knia.or.kr", "samsungfire.com", "idbins.com")), x
    assert len({x["phone"] for x in kr.INSURERS}) == len(kr.INSURERS)


def test_the_note_passes_the_forbidden_output_guard_and_tells_the_user_to_prefer_their_own_number():
    assert guard.is_safe(kr.INSURER_NOTE) and "보험증권" in kr.INSURER_NOTE
