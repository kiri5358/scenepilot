import re

from scenepilot import states

OFFICIAL_HOSTS = {"FL": ("leg.state.fl.us",), "NY": ("nysenate.gov",), "KR": ("law.go.kr", "ex.co.kr", "consumer.go.kr")}


def test_demo_states_are_florida_and_new_york():
    assert {s["code"] for s in states.supported()} == {"FL", "NY"}
    assert states.name_of("FL") == "Florida" and states.name_of("NY") == "New York"
    assert states.name_of(None) == "Not asked" and states.name_of("OTHER") == "Another state"


def test_every_note_has_an_official_source_a_version_and_short_text():
    data = states.load()
    assert data.retrieved == "2026-10-22" and data.reviewed is False  # still a draft until the team reviews it
    for code, info in data.states.items():
        assert info.notes
        for note in info.notes:
            assert note.sources, (code, note.id)
            for src in note.sources:
                assert any(host in src.url for host in OFFICIAL_HOSTS[code]), (code, note.id, src.url)
                assert src.version and src.title
            assert 0 < len(note.text.split()) <= 60, (code, note.id)


def test_notes_do_not_judge_fault_or_estimate_costs():
    banned = re.compile(r"\b(at fault|your fault|blame|estimate|repair cost|you should sue|attorney)\b", re.I)
    for info in states.load().states.values():
        for note in info.notes:
            assert not banned.search(note.text), (info.code, note.id)


def test_recording_notes_are_kept_but_not_shown():
    for code in ("FL", "NY"):
        ids = {n.id for n in states.load().states[code].notes}
        assert "recording" in ids
        assert "recording" not in {n.id for n in states.ui_notes(code)}


def test_choice_validation():
    for ok in ("FL", "NY", "OTHER", "UNSURE"):
        assert states.valid_choice(ok)
    for bad in ("TX", "", "fl"):
        assert not states.valid_choice(bad)
