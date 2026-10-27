"""Conversation watch: short fixed reminders played when certain words are heard during the talk with the other driver.

Rule code decides, not a model: a phrase list is matched against what the phone's recognizer heard, and the matching
reminder is a fixed sentence (pre-made audio, see prompt_audio.py). Nothing is sent to the server or stored; the browser
matches the phrases itself (static/watch.js) using the rules this module serves. The recognizer cannot tell who is
speaking, so every reminder is worded to be useful whoever said the phrase. Wording is an unreviewed draft.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

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


def match(text: str) -> list[WatchRule]:
    """Every rule with a phrase in the text, as whole words. Order follows RULES."""
    padded = f" {normalize(text)} "
    return [r for r in RULES if any(f" {normalize(p)} " in padded for p in r.phrases)]


def hints() -> list[str]:
    return [r.hint for r in RULES]


def public_rules() -> dict:
    return {
        "cooldown_seconds": COOLDOWN_SECONDS,
        "rules": [{"id": r.id, "phrases": [normalize(p) for p in r.phrases], "hint": r.hint} for r in RULES],
    }
