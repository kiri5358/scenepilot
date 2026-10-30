"""Conversation watch: short fixed reminders played when certain words are heard during the talk with the other driver.

Rule code decides, not a model: a phrase list is matched against what the phone's recognizer heard, and the matching
reminder is a fixed sentence (pre-made audio, see prompt_audio.py). Nothing is sent to the server or stored; the browser
matches the phrases itself (static/watch.js) using the rules this module serves. The recognizer cannot tell who is
speaking, so every reminder is worded to be useful whoever said the phrase. Wording is an unreviewed draft.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from . import kr

COOLDOWN_SECONDS = 30  # the same reminder is not repeated within this time


@dataclass(frozen=True)
class WatchRule:
    id: str
    phrases: tuple[str, ...]
    hint: str


RULES: tuple[WatchRule, ...] = (
    WatchRule("fault", (
        "my fault", "i caused this", "i wasn't looking", "i was not looking", "i didn't see you", "i did not see you",
        "i was on my phone", "i was texting",
    ), "Stick to the facts. Fault is decided later."),
    WatchRule("police", (
        "don't call the police", "do not call the police", "no police", "no cops", "keep insurance out of it",
    ), "You can still call the police if you want."),
    WatchRule("deal", (
        "pay you cash", "pay cash", "settle this here", "settle this now", "let's not involve insurance",
        "lets not involve insurance", "without insurance",
    ), "Don't agree to a deal here. Exchange insurance information first."),
    WatchRule("leaving", (
        "i have to go", "i need to go", "i'm leaving", "i am leaving", "i'm late", "i am late",
    ), "Take a photo of their plate before they leave."),
    WatchRule("sign", (
        "sign this", "sign here", "write a statement", "record a statement", "recorded statement",
    ), "Don't sign anything you don't understand."),
    WatchRule("hostile", (
        "i'll sue", "i will sue", "get out of the car", "get out of your car",
    ), "You don't have to argue. Stay safe, and call 911 if you feel threatened."),
    WatchRule("pain", (
        "i'm fine", "i am fine", "i'm not hurt", "i am not hurt", "my neck hurts", "my back hurts",
    ), "Pain can show up later. Consider a medical check."),
)


def normalize(text: str) -> str:
    """Lower case, one kind of apostrophe, only letters, digits, apostrophes and single spaces (same as speech.js)."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]+", " ", text.lower().replace("’", "'"))).strip()


# Korean rules. Korean words carry endings and particles, so the phrases are stems compared as plain substrings after
# all spaces are removed (same as static/watch.js).
RULES_KR: tuple[WatchRule, ...] = tuple(WatchRule(i, phrases, hint) for i, phrases, hint in kr.WATCH_RULES)


def normalize_ko(text: str) -> str:
    """Lower case, only Korean letters, letters and digits, with every space removed."""
    return re.sub(r"[^0-9a-z가-힣]+", "", text.lower())


def rules_for(country: str = "US") -> tuple[WatchRule, ...]:
    return RULES_KR if kr.is_kr(country) else RULES


def match(text: str, country: str = "US") -> list[WatchRule]:
    """Every rule with a phrase in the text. English phrases match whole words; Korean ones match as stems. Order follows the rules."""
    if kr.is_kr(country):
        compact = normalize_ko(text)
        return [r for r in RULES_KR if any(normalize_ko(p) in compact for p in r.phrases)]
    padded = f" {normalize(text)} "
    return [r for r in RULES if any(f" {normalize(p)} " in padded for p in r.phrases)]


def hints(country: str = "US") -> list[str]:
    return [r.hint for r in rules_for(country)]


_EN_INSURANCE_PHRASES = {
    "coverage": ("i filed a claim", "i reported it", "already reported", "claim is filed"),
    "refuse": ("won't accept the claim", "will not accept the claim", "refused the claim", "won't process"),
    "uninsured": ("i have no insurance", "i am uninsured", "i'm uninsured", "not insured"),
    "tow": ("call a tow truck", "towing is free", "free towing", "tow truck is coming"),
}


def public_rules(country: str = "US", language: str | None = None) -> dict:
    if kr.is_kr(country):
        english = {r.id: r.phrases for r in RULES} if language == "en" else {}
        if language == "en":
            english.update(_EN_INSURANCE_PHRASES)
        return {
            "cooldown_seconds": kr.WATCH_COOLDOWN_SECONDS, "compact": True,
            "say": kr.SAY_THIS, "severity": kr.COACH_SEVERITY, "tell_first": kr.COACH_TELL_FIRST,
            "rules": [{"id": r.id, "phrases": [normalize_ko(p) for p in (*r.phrases, *english.get(r.id, ()))], "hint": r.hint} for r in RULES_KR],
        }
    return {
        "cooldown_seconds": COOLDOWN_SECONDS, "compact": False,
        "rules": [{"id": r.id, "phrases": [normalize(p) for p in r.phrases], "hint": r.hint} for r in RULES],
    }
