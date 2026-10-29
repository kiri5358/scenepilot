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


def normalize(text: str) -> str:
    """The key the app uses to find a sentence: its words with single spaces."""
    return " ".join(text.split())


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
