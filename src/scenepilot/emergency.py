"""Safety questions, answer understanding, and the situation level. All rule code, no LLM.

Principle: answers we cannot understand or that are unsure are treated as the risky case (UNSURE).
We give no medical advice. We only point to the phone call.

Situation levels (highest first):
  emergency  someone may be hurt, or there may be fire/fuel         -> call 911, get safe
  serious    pedestrian/bicyclist/motorcyclist, airbag, left scene  -> call 911 and report it
  caution    vehicle cannot be moved, or it is in a dangerous spot  -> hazard lights, get out of traffic
  none       none of the above                                      -> standard guidance
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


# Question order. Life safety first, then facts that raise the level, then what to do with the vehicles.
SAFETY_QUESTIONS: tuple[SafetyQuestion, ...] = (
    SafetyQuestion("injury", "Is anyone hurt? That includes you, your passengers, and the other driver."),
    SafetyQuestion("fire", "Do you see or smell smoke, fire, fuel, or leaking fluid from any vehicle?"),
    SafetyQuestion("vulnerable", "Was a pedestrian, bicyclist, or motorcyclist involved?"),
    SafetyQuestion("airbag", "Did any airbags go off?"),
    SafetyQuestion("left_scene", "Did anyone drive away from the scene?"),
    SafetyQuestion("movable", "Can your vehicle be moved to a safe spot out of traffic?"),
    SafetyQuestion("road_hazard", "Is a vehicle blocking a lane or stopped somewhere dangerous, like a highway or a blind curve?"),
)
QUESTION_IDS = tuple(q.id for q in SAFETY_QUESTIONS)
# In an emergency these are not asked: 911 handles the details and they cannot lower the level.
SKIPPED_WHEN_EMERGENCY = frozenset({"vulnerable", "airbag", "left_scene"})

# Emergency numbers by country. The demo targets the United States; other countries are rejected at session start.
EMERGENCY_NUMBERS: dict[str, dict[str, str]] = {
    "US": {"police": "911", "ambulance": "911", "fire": "911"},
}
DEFAULT_COUNTRY = "US"

TITLES = {"emergency": "Safety first.", "serious": "This may be serious.", "caution": "", "none": ""}


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

_AIRBAG_POS = re.compile(r"\b(?:went off|deployed|inflated|popped|exploded)\b|\b(?:airbags?|air bags?)\b(?: \w+){0,3} out\b")
_AIRBAG_NEG = re.compile(
    r"\b(?:no|nothing)(?: \w+){0,2} (?:airbags?|air bags?)\b"
    r"|\b(?:didn'?t|did not|haven'?t|have not|not|never)(?: \w+){0,2} (?:go off|went off|deploy\w*|inflat\w*|pop\w*)\b"
)

_LEFT_POS = re.compile(
    r"\b(?:drove (?:off|away)|left|fled|ran off|took off|sped off|hit and run|hit-and-run|got away|gone|leaving)\b"
)
_LEFT_NEG = re.compile(
    r"\b(?:no ?one|nobody|none)(?: \w+){0,2} (?:left|fled|drove (?:off|away)|ran off|took off)\b"
    r"|\b(?:didn'?t|did not|hasn'?t|has not|haven'?t)(?: \w+){0,2} (?:leave|left|flee|fled|drive (?:off|away)|run off)\b"
    r"|\b(?:still here|still there|stayed|staying)\b"
)
_SIGNALS = {
    "injury": (_INJURY_POS, _INJURY_NEG),
    "fire": (_FIRE_POS, _FIRE_NEG),
    "vulnerable": (_VULN_POS, _VULN_NEG),
    "airbag": (_AIRBAG_POS, _AIRBAG_NEG),
    "left_scene": (_LEFT_POS, _LEFT_NEG),
}

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
    if question_id in _SIGNALS:
        positive, negative = _SIGNALS[question_id]
        remainder = negative.sub(" ", t)
        negated = remainder != t
        if positive.search(remainder):
            return Answer.YES  # a danger signal wins even when other words are mixed in
        if negated:
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
    level: str = "none"  # none | caution | serious | emergency
    title: str = ""
    triggers: list[str] = Field(default_factory=list)  # ids of the questions that raised the level
    actions: list[str] = Field(default_factory=list)
    call_buttons: list[CallButton] = Field(default_factory=list)


_SERIOUS_DETAIL = {
    "vulnerable": "Tell them a pedestrian, bicyclist, or motorcyclist may be involved.",
    "airbag": "Tell them an airbag went off.",
    "left_scene": (
        "Tell them someone left the scene. If you can, note their license plate, vehicle, and direction. "
        "Do not chase them."
    ),
}


def evaluate(answers: dict[str, Answer], country: str = DEFAULT_COUNTRY) -> EmergencyDecision:
    """Decide the situation level from the answers. Unanswered questions are ignored."""
    if country not in EMERGENCY_NUMBERS:
        raise ValueError(f"Unsupported country: {country}")
    nums = EMERGENCY_NUMBERS[country]
    risky = (Answer.YES, Answer.UNSURE)

    emergency_triggers = [q for q in ("injury", "fire") if answers.get(q) in risky]
    serious_triggers = [q for q in ("vulnerable", "airbag", "left_scene") if answers.get(q) in risky]
    caution_triggers = []
    if answers.get("road_hazard") in risky:
        caution_triggers.append("road_hazard")
    if answers.get("movable") == Answer.NO:
        caution_triggers.append("movable")

    actions: list[str] = []
    buttons: list[CallButton] = []

    def add_button(label: str, number: str) -> None:
        if not any(b.number == number for b in buttons):  # one button per number (US: everything is 911)
            buttons.append(CallButton(label=label, number=number))

    if "fire" in emergency_triggers:
        actions.append("Get away from the vehicle to a safe place first. Once you are safe, call " + nums["fire"] + ".")
        add_button(f"Call {nums['fire']}", nums["fire"])
    if "injury" in emergency_triggers:
        actions.append(
            f"Call {nums['ambulance']} now and tell them someone may be hurt. "
            "Stay on the line and follow the dispatcher's instructions."
        )
        add_button(f"Call {nums['ambulance']}", nums["ambulance"])
    if serious_triggers:
        if not emergency_triggers:
            actions.append(f"Call {nums['police']} now and tell them what happened.")
        actions.extend(_SERIOUS_DETAIL[q] for q in serious_triggers)
        add_button(f"Call {nums['police']}", nums["police"])
    if caution_triggers:
        actions.append(
            "Turn on your hazard lights. If it is safe, get out and move away from traffic, "
            "behind a guardrail if there is one."
        )
        if "road_hazard" in caution_triggers:
            add_button(f"Call {nums['police']}", nums["police"])

    if emergency_triggers:
        level = "emergency"
    elif serious_triggers:
        level = "serious"
    elif caution_triggers:
        level = "caution"
    else:
        level = "none"
    triggers = emergency_triggers + serious_triggers + caution_triggers
    return EmergencyDecision(
        level=level, title=TITLES[level], triggers=triggers, actions=actions, call_buttons=buttons
    )
