"""Forbidden-output check. Removes statements about fault, legal advice, money, medical judgments, and
admission-of-fault advice from model-written text.

This is plain rule code (no LLM). It is NOT applied to the fixed text we wrote ourselves (the disclaimer
contains words like "fault"). It applies only to model output and values derived from it.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .schemas import PhotoAnalysis

_RULES: dict[str, list[str]] = {
    "fault": [
        r"\bat[\s-]fault\b", r"\bfault\b", r"\bblam(e|ed|es|ing)\b", r"\bliab(le|ility)\b",
        r"\bresponsible for (the |this )?(accident|crash|collision|wreck)\b",
        r"\bcaused (the |this )?(accident|crash|collision|wreck)\b",
        r"\b(ran|run|running|blew through) (a |the )?(red light|stop sign)\b",
        r"\bspeeding\b", r"\b(drunk|intoxicated|dui|dwi)\b", r"\bnegligen(t|ce)\b",
        r"\b(traffic )?violat(ed|ion|ions)\b", r"\billegal(ly)?\b",
    ],
    "legal": [
        r"\bsu(e|ed|ing)\b", r"\blawsuit", r"\battorney", r"\blawyer", r"\blegal(ly)?\b", r"\bcourt\b",
        r"\bcriminal\b", r"\bsettle(ment|d)?\b",
    ],
    "money": [
        r"\$\s?\d", r"\b\d[\d,\.]*\s?(dollars?|usd|bucks)\b",
        r"\brepair (cost|costs|bill|bills|estimate|estimates|price|prices)\b", r"\bestimates?\b",
        r"\binsurance (payout|payment|settlement)\b", r"\bpayouts?\b", r"\bcompensation\b",
        r"\b(cost|costs) (of|to) repair\b", r"\bhow much (it|this|that) (will|would) cost\b",
        r"\btotal(ed|led)? (loss|out)\b", r"\bwrite[- ]?off\b",
    ],
    "medical": [
        r"\bfractur(e|ed|es)\b", r"\bbroken (bone|bones|arm|leg|neck|back|rib|ribs)\b", r"\bconcussion\b",
        r"\bdiagnos(e|is|ed)\b", r"\b(dead|death|fatal|fatality|deceased)\b", r"\binternal bleeding\b",
        r"\bwhiplash\b", r"\binjur(y|ies|ed)\b",
    ],
    "admission_advice": [
        r"\b(don'?t|do not|never) admit\b", r"\bapolog(ize|ise|y)\b", r"\b(don'?t|do not) sign\b",
        r"\bsign (anything|this|the)\b",
    ],
}
_COMPILED = {cat: [re.compile(p, re.IGNORECASE) for p in pats] for cat, pats in _RULES.items()}


@dataclass(frozen=True)
class Violation:
    category: str
    matched: str


def find_violations(text: str) -> list[Violation]:
    found: list[Violation] = []
    for category, patterns in _COMPILED.items():
        for pattern in patterns:
            m = pattern.search(text)
            if m:
                found.append(Violation(category, m.group(0)))
    return found


def is_safe(text: str) -> bool:
    return not find_violations(text)


def guard_or_fallback(text: str | None, fallback: str | None) -> str | None:
    """Return text if it is safe, otherwise fallback."""
    if text is None:
        return None
    return text if is_safe(text) else fallback


def filter_items(items: list[str]) -> tuple[list[str], list[str]]:
    """Keep only safe items. Returns (kept, removed)."""
    kept: list[str] = []
    removed: list[str] = []
    for item in items:
        (kept if is_safe(item) else removed).append(item)
    return kept, removed


def sanitize_analysis(analysis: PhotoAnalysis) -> tuple[PhotoAnalysis, int]:
    """Remove sentences with forbidden expressions from a model photo analysis. Returns (cleaned, removed count)."""
    observations, removed_obs = filter_items(analysis.observations)
    unknown, removed_unk = filter_items(analysis.unknown)
    hint = analysis.retake_hint
    removed_hint = 0
    if hint is not None and not is_safe(hint):
        hint, removed_hint = None, 1
    cleaned = analysis.model_copy(update={"observations": observations, "unknown": unknown, "retake_hint": hint})
    return cleaned, len(removed_obs) + len(removed_unk) + removed_hint
