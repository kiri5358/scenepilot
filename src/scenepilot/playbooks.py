"""'What to do now' guidance shown after the safety check. Fixed, reviewed wording; the model never writes these.

DRAFT: the wording needs a source review by the team before real use (see docs/dispatcher_script_en.md).
Every step is short enough to be read aloud as one sentence.

State-specific steps come from data/state_notes.json (Florida and New York in the demo) and only appear after the
user says which state the accident happened in. Other states get a general reminder.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from . import kr, states
from .emergency import Answer


class GuideStep(BaseModel):
    kind: str = "text"  # list (text is the heading, items are the steps) | state (ask which state) | state_note (has sources)
    text: str
    items: list[str] = Field(default_factory=list)
    note_title: str | None = None
    sources: list[states.Source] = Field(default_factory=list)


LIST_HEADING = "Take a breath. Here is what to do now."
LEFT_SCENE = "If they drive off, note their plate and call the police."

STATE_QUESTION = "Where did the accident happen? Some rules depend on the state."
GENERAL_OTHER = (
    "I don't have details for that state. Some places require a police report or a report to the state. "
    "Check that state's official guidance."
)
GENERAL_UNSURE = (
    "That's okay. Some places require a police report or a report to the state. "
    "Check the official guidance for the state you are in."
)


def guide_steps(
    level: str, answers: dict[str, Answer], accident_state: str | None = None, country: str = "US"
) -> list[GuideStep]:
    """The ordered steps for this situation.

    Emergency has no guidance steps: the 911 call is the guidance, and the state is taken from the phone's location
    without asking (see session.set_accident_state, via="location_auto"). Everything else starts with one screen that
    lists all the steps, so nobody has to tap Next once per sentence.

    The Korea edition (country "KR") has the same shape without the state question: one list, then the notes for Korea.
    """
    if level == "emergency":
        return []
    if kr.is_kr(country):
        first = kr.FIRST_STEP_STUCK if answers.get("movable") == Answer.NO else kr.FIRST_STEP_MOVABLE
        steps = [GuideStep(kind="list", text=kr.LIST_HEADING, items=[first, *kr.LIST_ITEMS])]
        steps.extend(
            GuideStep(kind="state_note", text=n.text, note_title=n.title, sources=n.sources)
            for n in states.ui_notes(states.KR)
        )
        return steps
    if answers.get("movable") == Answer.NO:
        first = "Turn on your hazard lights and stay out of traffic."
    else:
        first = "Turn on your hazard lights. If it is safe, move out of traffic."
    steps = [GuideStep(kind="list", text=LIST_HEADING, items=[
        first,
        "Stay until you have exchanged information.",
        "Exchange name, phone, insurance, and license plate.",
        LEFT_SCENE,
        "Stick to the facts.",
        "Call your insurance company.",
    ])]
    steps.append(GuideStep(kind="state", text=STATE_QUESTION))
    notes = states.ui_notes(accident_state)
    if notes:
        steps.extend(GuideStep(kind="state_note", text=n.text, note_title=n.title, sources=n.sources) for n in notes)
    elif accident_state == states.OTHER:
        steps.append(GuideStep(text=GENERAL_OTHER))
    elif accident_state == states.UNSURE:
        steps.append(GuideStep(text=GENERAL_UNSURE))
    return steps
