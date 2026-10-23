"""Pre-made speech: the list of fixed sentences, how clips are named and kept, and that nothing the app says is missed."""
import tempfile
from pathlib import Path

from scenepilot import prompt_audio as pa
from scenepilot import session as sm
from scenepilot.emergency import Answer

ROOT = Path(__file__).parent.parent
FIXED = set(pa.fixed_prompts())


def spoken(prompt: sm.Prompt) -> list[str]:
    """What the screen reads aloud, split into sentences the way app.js does (see speechParts)."""
    text = prompt.text
    parts = []
    if text.startswith(pa.RETRY_PREFIX + " "):
        parts.append(pa.RETRY_PREFIX)
        text = text[len(pa.RETRY_PREFIX) + 1:]
    parts += [text, *prompt.actions, *([prompt.warning] if prompt.warning else [])]
    return [pa.normalize(p) for p in parts if p]


def collect(s: sm.Session, found: list[str]) -> None:
    found += spoken(sm.next_prompt(s))


def test_the_list_is_complete_stable_and_free_of_duplicates():
    prompts = pa.fixed_prompts()
    assert len(prompts) == len(set(prompts)) and 55 <= len(prompts) <= 80
    assert prompts == pa.fixed_prompts()  # same order every time, so re-running the tool changes nothing
    assert "Is anyone hurt? That includes you, your passengers, and the other driver." in prompts
    assert any(p.startswith("In Florida, report the crash") for p in prompts)
    assert any(p.startswith("In New York, each driver") for p in prompts)


def test_every_fixed_sentence_a_session_can_produce_is_in_the_list():
    found: list[str] = []
    # a calm accident, both states, all the way through the guidance and photos
    for state in ("FL", "NY", "OTHER", "UNSURE"):
        s = sm.new_session(); collect(s, found)
        sm.accept_consent(s)
        while s.stage is sm.Stage.SAFETY:
            collect(s, found)
            qid = sm._next_question_id(s)
            if state == "FL" and qid == "airbag":
                sm.answer_safety(s, "mumble mumble")   # not understood: the question is asked again with the "didn't catch that" sentence
                collect(s, found)
            sm.answer_safety(s, "yes" if qid == "movable" else "no")
        assert s.stage is sm.Stage.GUIDE
        while s.stage is sm.Stage.GUIDE:
            collect(s, found)
            if sm.next_prompt(s).step_kind == "state":
                sm.set_accident_state(s, state)
            else:
                sm.guide(s, "next")
        while s.stage is sm.Stage.PHOTOS:
            collect(s, found)
            sm.skip_item(s, "Not applicable")
        for stage in (sm.Stage.HUB, sm.Stage.INFO, sm.Stage.SUMMARY):
            s.stage = stage; collect(s, found)
    # the vehicle cannot move, serious and emergency notices
    s = sm.new_session(); sm.accept_consent(s)
    for qid, ans in (("injury", "no"), ("fire", "no"), ("vulnerable", "yes")):
        sm.answer_safety(s, ans)
    collect(s, found)
    s = sm.new_session(); sm.accept_consent(s); sm.answer_safety(s, "yes"); collect(s, found)
    missing = sorted(set(found) - FIXED)
    assert not missing, "sentences the app can say that have no place in the audio list:\n" + "\n".join(missing)


def test_clips_are_named_by_voice_and_text():
    assert pa.clip_name("Hello  there", "A") == pa.clip_name("Hello there", "A")   # spacing does not matter
    assert pa.clip_name("Hello there", "A") != pa.clip_name("Hello there", "B")
    assert pa.clip_name("Hello there", "A") != pa.clip_name("Hello there!", "A")
    assert pa.clip_name("Hello there", "A").endswith(".mp3")


def test_build_makes_new_clips_once_and_removes_stale_ones():
    with tempfile.TemporaryDirectory() as folder:
        check_build(Path(folder))


def check_build(tmp_path: Path) -> None:
    made: list[str] = []

    def synthesize(text: str) -> bytes:
        made.append(text)
        return text.encode()

    manifest = pa.build(["One.", "Two."], tmp_path, synthesize, lambda pcm: b"mp3:" + pcm, voice="V")
    assert made == ["One.", "Two."] and manifest["_made"] == 2
    one = tmp_path / pa.clip_name("One.", "V")
    assert one.read_bytes() == b"mp3:One."
    # running again with one new and one removed sentence only synthesizes the new one and cleans up the old one
    made.clear()
    manifest = pa.build(["One.", "Three."], tmp_path, synthesize, lambda pcm: b"mp3:" + pcm, voice="V")
    assert made == ["Three."] and not (tmp_path / pa.clip_name("Two.", "V")).exists()
    import json
    saved = json.loads((tmp_path / pa.MANIFEST).read_text(encoding="utf-8"))
    assert saved["items"] == {"One.": pa.clip_name("One.", "V"), "Three.": pa.clip_name("Three.", "V")}
    assert saved["voice"] == "V" and "NVIDIA" in saved["license"]


def test_the_app_splits_retry_sentences_the_same_way_as_this_module():
    source = (ROOT / "src" / "scenepilot" / "static" / "app.js").read_text(encoding="utf-8")
    assert f'const RETRY_PREFIX = "{pa.RETRY_PREFIX} ";' in source


def test_audio_is_optional_the_manifest_may_be_missing():
    manifest = ROOT / "src" / "scenepilot" / "static" / "audio" / pa.MANIFEST
    # no clips yet is a normal state (the device voice is used); if clips exist, every file in the manifest must exist
    if manifest.exists():
        import json
        for name in json.loads(manifest.read_text(encoding="utf-8"))["items"].values():
            assert (manifest.parent / name).exists(), name
