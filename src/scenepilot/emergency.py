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

from . import kr


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

# Emergency numbers by country. The English demo targets the United States; the Korea edition (KR) uses 112 and 119.
# Other countries are rejected at session start.
EMERGENCY_NUMBERS: dict[str, dict[str, str]] = {
    "US": {"police": "911", "ambulance": "911", "fire": "911"},
    kr.COUNTRY: kr.NUMBERS,
}
DEFAULT_COUNTRY = "US"

TITLES = {"emergency": "Safety first.", "caution": "", "none": ""}


def safety_questions(country: str = DEFAULT_COUNTRY) -> tuple[SafetyQuestion, ...]:
    """The questions in the wording of the session's country."""
    if kr.is_kr(country):
        return tuple(SafetyQuestion(q.id, kr.QUESTIONS[q.id]) for q in SAFETY_QUESTIONS)
    return SAFETY_QUESTIONS


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


# ---------- Korean answers ----------
# Korean words carry endings and particles ("다친 사람은 없어요"), so these rules look for stems, and a "no" only counts
# when it sits next to the thing it denies. A danger word that is not denied counts as danger.

_HANGUL = re.compile(r"[가-힣]")

_KO_UNSURE = re.compile(r"모르겠|잘 ?모르|몰라|모름|확실하지|확실치|글쎄|애매")
_KO_INJURY = (
    r"다치|다쳤|다친|부상|출혈|피가|피를|피 ?나|아프|아파|아픈|통증|기절|의식|숨을|숨이|숨 ?쉬|못 ?움직|못 ?걸|못 ?일어"
)
_KO_FIRE = r"연기|불이|불났|불나|불꽃|불길|화재|기름|연료|휘발유|가스|누유|새고|새는|냄새|폭발"
_KO_VULN = r"보행자|자전거|오토바이|이륜차|킥보드|어린이|사람을 ?쳤"
_KO_INJURY_POS = re.compile(_KO_INJURY)
_KO_FIRE_POS = re.compile(_KO_FIRE)
_KO_VULN_POS = re.compile(_KO_VULN)
_KO_DENIED = re.compile(
    rf"(?:{_KO_INJURY}|{_KO_FIRE}|{_KO_VULN})\S*\s*(?:\S{{0,3}}\s)?(?:사람|분|곳|것|게|데)?\S{{0,2}}\s*"
    r"(?:전혀\s*|하나도\s*|아무도\s*|아무것도\s*)?(?:없|아니|않|안\s)\S*"
    r"|(?:안|못)\s*(?:다쳤|다치|아프|아파)\S*"
    r"|(?:다들|모두|전부|다|우리|저희)\s*(?:다\s*)?(?:괜찮|멀쩡|무사|안전)\S*"
)
_KO_YES_TOKENS = ("네", "예", "응", "넵", "넹", "맞", "그래", "그럼", "물론", "있")
_KO_NO_TOKENS = ("아니", "아뇨", "없", "괜찮", "멀쩡")
_KO_STUCK = re.compile(r"(?<![가-힣])(?:안 ?되|안돼|못)|없|불가|아니|아뇨|멈|시동|견인")
_KO_MOVABLE_YES = ("네", "예", "응", "넵", "넹", "맞", "그래", "그럼", "물론", "가능", "있", "돼", "되", "움직", "괜찮")


def _ko_normalize(text: str) -> str:
    t = re.sub(r"[^0-9a-z가-힣 ]+", " ", text.lower())
    return re.sub(r"\s+", " ", t).strip()


def _starts(tokens: list[str], prefixes: tuple[str, ...]) -> bool:
    return any(tok.startswith(p) for tok in tokens for p in prefixes)


def _parse_ko(text: str, question_id: str) -> Answer | None:
    t = _ko_normalize(text)
    if not t:
        return None
    if _KO_UNSURE.search(t):
        return Answer.UNSURE
    if question_id == "danger":
        remainder = _KO_DENIED.sub(" ", t)
        if any(p.search(remainder) for p in (_KO_INJURY_POS, _KO_FIRE_POS, _KO_VULN_POS)):
            return Answer.YES  # a danger sign that is not denied wins
        if remainder != t:
            return Answer.NO
        tokens = t.split()
        yes, no = _starts(tokens, _KO_YES_TOKENS), _starts(tokens, _KO_NO_TOKENS)
    elif question_id == "movable":
        if _KO_STUCK.search(t):
            return Answer.NO
        tokens = t.split()
        return Answer.YES if _starts(tokens, _KO_MOVABLE_YES) else None
    else:
        tokens = t.split()
        yes, no = _starts(tokens, _KO_YES_TOKENS), _starts(tokens, _KO_NO_TOKENS)
    if yes and no:
        return None
    return Answer.YES if yes else Answer.NO if no else None


def parse_answer(text: str, question_id: str) -> Answer | None:
    """Turn what the user said into yes / no / unsure. Returns None when unclear (we ask again)."""
    if _HANGUL.search(text):
        return _parse_ko(text, question_id)
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
    found = []
    if _HANGUL.search(text):
        remainder = _KO_DENIED.sub(" ", _ko_normalize(text))
        if _KO_INJURY_POS.search(remainder):
            found.append("injury")
        if _KO_FIRE_POS.search(remainder):
            found.append("fire")
        return found
    t = _normalize(text)
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

    if kr.is_kr(country):
        if answers.get("danger") in risky:
            level = "emergency"
            triggers.append("danger")
            actions = list(kr.EMERGENCY_ACTIONS)
            buttons = [CallButton(label=kr.CALL_AMBULANCE, number=nums["ambulance"]),
                       CallButton(label=kr.CALL_POLICE, number=nums["police"])]
        elif answers.get("movable") == Answer.NO:
            level = "caution"
            triggers.append("movable")
            actions = [kr.CAUTION_ACTION]
        else:
            level = "none"
        return EmergencyDecision(
            level=level, title=kr.TITLES[level], triggers=triggers, actions=actions, call_buttons=buttons
        )

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
