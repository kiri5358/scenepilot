"""State-specific notes (Florida and New York for the demo), loaded from data/state_notes.json.

Every note carries its official source, the version shown on the page, and the date we retrieved it.
The wording is a plain-language draft of the statute and must be reviewed by the team before real use.
Other states get the general guidance only.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel

DATA_FILE = Path(__file__).parent / "data" / "state_notes.json"
OTHER = "OTHER"    # a state we have no notes for
UNSURE = "UNSURE"  # the user does not know


class Source(BaseModel):
    title: str
    url: str
    version: str


class StateNote(BaseModel):
    id: str
    ui: bool  # shown in the app guidance
    title: str
    text: str
    sources: list[Source]


class StateInfo(BaseModel):
    code: str
    name: str
    notes: list[StateNote]


class StateData(BaseModel):
    retrieved: str
    disclaimer: str
    disclaimer_kr: str = ""
    reviewed: bool
    states: dict[str, StateInfo]


KR = "KR"  # the Korea edition: one jurisdiction, so it has notes but is never offered in the US state picker


@lru_cache(maxsize=1)
def load() -> StateData:
    raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    states = {code: StateInfo(code=code, **info) for code, info in raw["states"].items()}
    return StateData(
        retrieved=raw["retrieved"], disclaimer=raw["disclaimer"], disclaimer_kr=raw.get("disclaimer_kr", ""),
        reviewed=raw["reviewed"], states=states,
    )


def supported(country: str = "US") -> list[dict]:
    """States that have notes, for the state picker. The Korea edition has no picker."""
    if country == KR:
        return []
    return [{"code": s.code, "name": s.name} for s in load().states.values() if s.code != KR]


def disclaimer_for(code: str | None) -> str:
    return load().disclaimer_kr if code == KR else load().disclaimer


def valid_choice(code: str) -> bool:
    return code in load().states or code in (OTHER, UNSURE)


def name_of(code: str | None) -> str:
    if code is None:
        return "Not asked"
    if code == OTHER:
        return "Another state"
    if code == UNSURE:
        return "Not sure"
    return load().states[code].name


def valid_choice_for(code: str, country: str = "US") -> bool:
    """A state the user may pick in this country. The Korea edition never offers the US states, nor the reverse."""
    if country == KR:
        return code == KR
    return code != KR and valid_choice(code)


def ui_notes(code: str | None) -> list[StateNote]:
    if code is None or code not in load().states:
        return []
    return [n for n in load().states[code].notes if n.ui]
