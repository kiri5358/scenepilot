"""Pre-made speech for the fixed sentences the app reads aloud.

Almost everything the app says is fixed text we wrote (questions, steps, state notes, photo instructions). It is
synthesized ONCE with NVIDIA's open Magpie TTS model (tools/synthesize_prompts.py) and shipped as audio files, so
playback is instant, needs no internet, and has no call limit. Text the model writes at run time (photo observations,
answers to free questions) is read by the phone's own voice instead.

The app looks a sentence up in static/audio/manifest.json by its exact text. A sentence with no file is simply read
by the device voice, so a missing or partial set of audio never breaks anything.
"""
from __future__ import annotations

import hashlib
import itertools
import json
import re
import subprocess
from collections.abc import Callable
from pathlib import Path

from . import checklist, kr, playbooks, states, watch_hints
from . import session as sm
from .emergency import TITLES, Answer, evaluate, safety_questions

AUDIO_DIR = Path(__file__).parent / "static" / "audio"
MANIFEST = "manifest.json"
DEFAULT_VOICE = "Magpie-Multilingual.EN-US.Aria.Calm"  # a calm voice suits someone who has just had an accident
KR_VOICE = "Magpie-Multilingual.KO-KR.Aria"           # the Korean voices have no "Calm" variant
KR_AUDIO_DIR = AUDIO_DIR / "ko"                       # the Korea edition has its own clips and manifest
RETRY_PREFIX = "Sorry, I didn't catch that."  # said before a safety question that must be asked again


KR_EN_AUDIO_DIR = AUDIO_DIR / "kr-en"                 # the Korea edition read in English: its own clips and manifest
KR_EN_VOICE = DEFAULT_VOICE                           # the same calm English voice as the US demo
_APP = Path(__file__).parent / "static" / "app"
_SPOKEN_UI_KEYS = ("coach.setup.title", "coach.tell.title", "ask.say", "listen.retrySay")   # en.json texts the app reads aloud
_PHOTO_TITLES = ("Damage to my vehicle", "Other vehicle and plate", "Whole scene")   # read as "<title>: not taken yet."


def normalize(text: str) -> str:
    """The key the app uses to find a sentence: its words with single spaces."""
    return " ".join(text.split())


def speech_text(text: str) -> str:
    """What the voice should say for a written English sentence (the same rules as spokenText() in services/speak.js):
    "119" would be read "one hundred nineteen", so the emergency numbers are spelled out digit by digit."""
    out = re.sub(r"\s+", " ", re.sub(r"\s*[·•]\s*", ", ", text)).strip()
    out = re.sub(r"\b119\b", "one one nine", out)
    out = re.sub(r"\b112\b", "one one two", out)
    return re.sub(r"\b(\d)/(\d)\b", r"\1 of \2", out)


def kr_english_prompts() -> list[str]:
    """The English wording of everything the Korea edition reads aloud (the new GUI's display-language table, server-en.js,
    plus the few spoken texts in en.json). node reads the ES module; the order is stable and there are no duplicates."""
    code = f"import d from {json.dumps(_APP.joinpath('js', 'core', 'server-en.js').as_uri())}; console.log(JSON.stringify(Object.values(d)))"
    run = subprocess.run(["node", "--input-type=module", "-e", code], capture_output=True, text=True, encoding="utf-8", check=True)
    texts = [t for t in json.loads(run.stdout) if isinstance(t, str) and len(t.split()) >= 2 and 10 <= len(t) <= 300 and "reviewed" not in t]   # source labels and long notices are not read
    ui = json.loads((_APP / "i18n" / "en.json").read_text(encoding="utf-8"))
    texts += [ui[k] for k in _SPOKEN_UI_KEYS if k in ui]
    texts += ["Sorry, I did not catch that."] + [f"{title}: not taken yet." for title in _PHOTO_TITLES]
    seen: set[str] = set()
    out: list[str] = []
    for text in texts:
        key = normalize(text)
        if key and key not in seen and not re.search(r"[가-힣]", key):
            seen.add(key)
            out.append(key)
    return out


def clip_name(text: str, voice: str) -> str:
    return hashlib.sha1(f"{voice}|{normalize(text)}".encode("utf-8")).hexdigest()[:16] + ".mp3"


def _prompt_texts(stage: sm.Stage, level: str = "none", country: str = "US") -> list[str]:
    s = sm.new_session(country)
    s.stage = stage
    s.emergency.level = level
    p = sm.next_prompt(s)
    return [p.text, *p.actions, *([p.warning] if p.warning else [])]


def fixed_prompts(country: str = "US") -> list[str]:
    """Every fixed sentence the app can read aloud, in a stable order, without duplicates."""
    ko = kr.is_kr(country)
    found: list[str] = [kr.RETRY_PREFIX if ko else RETRY_PREFIX]

    # screens whose wording lives in the prompt builder
    found += _prompt_texts(sm.Stage.CONSENT, country=country)
    found += _prompt_texts(sm.Stage.HUB, country=country)
    found += _prompt_texts(sm.Stage.INFO, country=country)
    found += _prompt_texts(sm.Stage.SUMMARY, country=country)
    found += _prompt_texts(sm.Stage.PHOTOS, country=country)                # the photo instruction (first checklist item)
    found += _prompt_texts(sm.Stage.PHOTOS, "emergency", country)           # the same screen with the "only where you are safe" warning

    # safety questions
    found += [q.text for q in safety_questions(country)]

    # emergency notices: every wording the rules can produce
    for danger, movable in itertools.product((Answer.NO, Answer.YES), (Answer.YES, Answer.NO)):
        decision = evaluate({"danger": danger, "movable": movable}, country)
        found += ([decision.title] if decision.title else []) + decision.actions
    found += [t for t in (kr.TITLES if ko else TITLES).values() if t]

    # guidance: the list screen (both ways the first step can read), state question, general reminders, state notes
    for movable in (Answer.YES, Answer.NO):
        for step in playbooks.guide_steps("none", {"movable": movable}, None, country):
            found += [step.text, *step.items]
    if ko:
        for note in states.ui_notes(states.KR):
            found += [note.title, note.text]
    else:
        found += [playbooks.GENERAL_OTHER, playbooks.GENERAL_UNSURE]
        for state in states.supported():
            for note in states.ui_notes(state["code"]):
                found += [note.title, note.text]  # the title is read when the note appears; the text only on Repeat

    # photo instructions and the fixed retake messages
    found += [checklist.item_instruction(item, country) for item in checklist.ITEMS]
    found += list(checklist.default_messages(country).values())

    found += watch_hints.hints(country)  # conversation watch reminders
    if ko:
        found += list(kr.COACH_HINTS.values())  # the extra reminders live coaching can choose
        # the check before leaving, read after the summary: every sentence it can be made of
        found += [kr.LEAVE_LEAD, kr.LEAVE_NOTHING, *kr.LEAVE_INFO.values(), *kr.LEAVE_ALWAYS]
        found += [kr.LEAVE_PHOTO.format(title=checklist.item_title(item, country)) for item in checklist.ITEMS if item.core]

    seen: set[str] = set()
    ordered: list[str] = []
    for text in found:
        key = normalize(text)
        if key and key not in seen:
            seen.add(key)
            ordered.append(key)
    return ordered


def build(
    prompts: list[str],
    out_dir: Path,
    synthesize: Callable[[str], bytes],
    encode: Callable[[bytes], bytes],
    voice: str = DEFAULT_VOICE,
    model: str = "nvidia/magpie_tts_multilingual_357m",
    log: Callable[[str], None] = lambda _: None,
) -> dict:
    """Make an audio file for every sentence that does not have one yet, and write the manifest.

    `synthesize(text)` returns raw 16-bit mono PCM; `encode(pcm)` turns it into the file bytes. Files are named by
    voice and text, so changing a sentence makes a new file and unchanged sentences are never synthesized twice."""
    out_dir.mkdir(parents=True, exist_ok=True)
    items: dict[str, str] = {}
    made = 0
    for text in prompts:
        name = clip_name(text, voice)
        path = out_dir / name
        if not path.exists():
            path.write_bytes(encode(synthesize(text)))
            made += 1
            log(f"made {name}  {text[:60]}")
        items[normalize(text)] = name
    manifest = {"voice": voice, "model": model, "license": "NVIDIA Open Model License", "items": items}
    (out_dir / MANIFEST).write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    # remove clips of sentences that no longer exist
    wanted = set(items.values())
    for old in out_dir.glob("*.mp3"):
        if old.name not in wanted:
            old.unlink()
    manifest["_made"] = made
    return manifest
