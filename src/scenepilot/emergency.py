"""Safety questions, answer understanding, and the situation level. All rule code, no LLM.

Principle: answers we cannot understand or that are unsure are treated as the risky case (UNSURE).
We give no medical advice. We only point to the phone call.

Two questions only: is there danger, and can the vehicle be moved. A 911 button is also always visible in the app, so
the user can call without answering anything.

Situation levels (highest first):
  emergency  someone may be hurt, or there may be smoke, fire or fuel (a pedestrian, bicyclist or motorcyclist hit counts as hurt) -> call 911, get safe
  caution    vehicle cannot be moved                                                              -> hazard lights, get out of traffic
  none       none of the above                                                                    -> standard guidance
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

from pydantic import BaseModel, Field


class Answer(StrEnum):
    YES = "yes"
    NO = "no"
    UNSURE = "unsure"


@dataclass(frozen=True)
class SafetyQuestion:
    id: str
    text: str


# Question order. Life safety first, then what to do with the vehicles.
SAFETY_QUESTIONS: tuple[SafetyQuestion, ...] = (
    SafetyQuestion("danger", "Is anyone hurt, or do you see smoke, fire, or fuel?"),
    SafetyQuestion("movable", "Can your vehicle be moved to a safe spot out of traffic?"),
)
QUESTION_IDS = tuple(q.id for q in SAFETY_QUESTIONS)
# In an emergency this is not asked: 911 gives the instructions about the vehicles.
SKIPPED_WHEN_EMERGENCY = frozenset({"movable"})

# Emergency numbers by country. The demo targets the United States; other countries are rejected at session start.
EMERGENCY_NUMBERS: dict[str, dict[str, str]] = {
    "US": {"police": "911", "ambulance": "911", "fire": "911"},
}
DEFAULT_COUNTRY = "US"

TITLES = {"emergency": "Safety first.", "caution": "", "none": ""}


# ---------- Understanding answers ----------

_UNSURE = re.compile(
    r"\b(not sure|unsure|don'?t know|do not know|dunno|no idea|can'?t tell|cannot tell|hard to tell|"
    r"not certain|maybe|i guess|i think so)\b"
)

_FIRE_WORDS = r"(?:smoke|smoking|fire|flames?|burning|fuel|gas|gasoline|petrol|leaks?|leaking|fluid|sparks?|smell)"
_FIRE_POS = re.compile(rf"\b{_FIRE_WORDS}\b")
_FIRE_NEG = re.compile(
    rf"\b(?:no|nothing|without)(?: \w+){{0,2}} {_FIRE_WORDS}\b"
    rf"|\b(?:don'?t|do not|didn'?t|did not|can'?t|cannot|not)(?: \w+){{0,2}} {_FIRE_WORDS}\b"
)

_INJURY_POS = re.compile(
    r"\b(?:hurt|hurts|hurting|injur\w*|bleed\w*|blood|unconscious|unresponsive|not breathing|can'?t breathe|"
    r"can'?t move|in pain|pain|broken|dizzy|passed out|knocked out|screaming|crying)\b"
    r"|\bhit (?:my|his|her|their) head\b"
)
_INJURY_NEG = re.compile(
    r"\b(?:no ?one|nobody|none of us)\b(?: (?:is|was|are|got|seems?))?(?: (?:really|seriously|badly))?"
    r"(?: (?:hurt|injured|bleeding|in pain))?"
    r"|\bno (?:injur\w*|pain|bleeding|blood)\b"
    r"|\bnot (?:hurt|injured|in pain|bleeding)\b"
    r"|\b\w+n't (?:hurt|injured|in pain|bleeding)\b"
    r"|\b(?:everyone|everybody|we all|all of us)(?: is| are|'s|'re)? (?:ok|okay|fine|safe|alright|good)\b"
    r"|\bwe(?: are|'re)(?: all)? (?:ok|okay|fine|safe|alright|good)\b|\ball (?:ok|okay|fine|good)\b"
    r"|\bnothing (?:hurts|is hurt|hurt)\b|\b(?:unhurt|uninjured)\b"
)

_VULN_WORDS = r"(?:pedestrians?|bicycl\w*|cyclists?|bikers?|bike|motorcycl\w*|scooter|skateboard\w*|child|kid|someone walking|person on foot)"
_VULN_POS = re.compile(rf"\b{_VULN_WORDS}\b|\bon foot\b|\bwalking\b")
_VULN_NEG = re.compile(rf"\b(?:no|not any|nobody|without|didn'?t see any|did not see any)(?: \w+){{0,2}} {_VULN_WORDS}\b")

_SIGNALS = {
    "injury": (_INJURY_POS, _INJURY_NEG),
    "fire": (_FIRE_POS, _FIRE_NEG),
    "vulnerable": (_VULN_POS, _VULN_NEG),
}
_DANGER_PARTS = ("injury", "fire", "vulnerable")  # what the "danger" question covers

_NO_WORDS = {"no", "nope", "nah", "negative", "none", "nobody", "nothing", "never", "not",
             "can't", "cannot", "won't", "wouldn't", "couldn't", "isn't", "aren't", "doesn't", "don't"}
_STRONG_YES = {"yes", "yeah", "yep", "yup", "sure", "correct", "affirmative", "definitely", "absolutely"}
_WEAK_YES = {"can", "does", "is", "there", "do", "are", "it"}


def _normalize(text: str) -> str:
    t = text.lower().replace("’", "'")
    t = re.sub(r"[^a-z0-9' ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _generic(t: str) -> Answer | None:
    words = set(t.split())
    no = words & _NO_WORDS
    strong = words & _STRONG_YES
    weak = words & _WEAK_YES
    if no:
        return None if strong else Answer.NO  # "yes" and "no" together: unclear
    if strong or weak:
        return Answer.YES
    return None


# In a noisy place the recognizer often writes a sound-alike for a one-word answer. Only words that cannot start a
# real answer to these questions are mapped, and never "now" (it appears in too many other sentences).
_SOUND_ALIKES = {"know": Answer.NO, "noh": Answer.NO, "nope": Answer.NO, "nah": Answer.NO,
                 "yeah": Answer.YES, "yep": Answer.YES, "yup": Answer.YES, "yas": Answer.YES}


def parse_answer(text: str, question_id: str) -> Answer | None:
    """Turn what the user said into yes / no / unsure. Returns None when unclear (we ask again)."""
    t = _normalize(text)
    if not t:
        return None
    if t in _SOUND_ALIKES:
        return _SOUND_ALIKES[t]
    if t in ("yes", "no", "unsure"):
        return Answer(t)
    if _UNSURE.search(t):
        return Answer.UNSURE
    parts = _DANGER_PARTS if question_id == "danger" else (question_id,) if question_id in _SIGNALS else ()
    if parts:
        remainder = t
        for part in parts:
            remainder = _SIGNALS[part][1].sub(" ", remainder)
        if any(_SIGNALS[part][0].search(remainder) for part in parts):
            return Answer.YES  # a danger signal wins even when other words are mixed in
        if remainder != t:
            return Answer.NO
    return _generic(t)


def danger_signals(text: str) -> list[str]:
    """Does free text mention possible injury or fire/fuel? Used by the question helper: such questions are answered by a
    fixed 911 message, never by a model. Negations ("nobody is hurt") do not count."""
    t = _normalize(text)
    found = []
    for question_id in ("injury", "fire"):
        positive, negative = _SIGNALS[question_id]
        if positive.search(negative.sub(" ", t)):
            found.append(question_id)
    return found


def parse_alternatives(texts: list[str], question_id: str) -> Answer | None:
    """Understand an answer from several possible transcripts of the same sentence (the recognizer's other guesses).

    Guesses we cannot understand are ignored. If the ones we understand agree, that is the answer. If they disagree
    (one reads "yes", another "no"), we cannot tell what was said, so we take the cautious side: not sure.
    """
    found = {a for t in texts if (a := parse_answer(t, question_id)) is not None}
    if not found:
        return None
    return found.pop() if len(found) == 1 else Answer.UNSURE


# ---------- Situation level ----------

class CallButton(BaseModel):
    label: str
    number: str


class EmergencyDecision(BaseModel):
    level: str = "none"  # none | caution | emergency
    title: str = ""
    triggers: list[str] = Field(default_factory=list)  # ids of the questions that raised the level
    actions: list[str] = Field(default_factory=list)
    call_buttons: list[CallButton] = Field(default_factory=list)


def evaluate(answers: dict[str, Answer], country: str = DEFAULT_COUNTRY) -> EmergencyDecision:
    """Decide the situation level from the answers. Unanswered questions are ignored."""
    if country not in EMERGENCY_NUMBERS:
        raise ValueError(f"Unsupported country: {country}")
    nums = EMERGENCY_NUMBERS[country]
    risky = (Answer.YES, Answer.UNSURE)

    actions: list[str] = []
    buttons: list[CallButton] = []
    triggers: list[str] = []

    if answers.get("danger") in risky:
        triggers.append("danger")
        level = "emergency"
        actions.append("If there is smoke, fire, or fuel, get away from the vehicle first.")
        actions.append(f"Call {nums['ambulance']} now. Stay on the line and follow the dispatcher's instructions.")
        buttons.append(CallButton(label=f"Call {nums['ambulance']}", number=nums["ambulance"]))
    elif answers.get("movable") == Answer.NO:
        triggers.append("movable")
        level = "caution"
        actions.append(
            "Turn on your hazard lights. If it is safe, get out and move away from traffic, "
            "behind a guardrail if there is one."
        )
    else:
        level = "none"
    return EmergencyDecision(
        level=level, title=TITLES[level], triggers=triggers, actions=actions, call_buttons=buttons
    )
