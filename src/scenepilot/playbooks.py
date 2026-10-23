"""'What to do now' guidance shown after the safety check. Fixed, reviewed wording; the model never writes these.

DRAFT: the wording needs a source review by the team before real use (see docs/dispatcher_script_en.md).
Every step is short enough to be read aloud as one sentence.

State-specific steps come from data/state_notes.json (Florida and New York in the demo) and only appear after the
user says which state the accident happened in. Other states get a general reminder.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from . import states
from .emergency import Answer


class GuideStep(BaseModel):
    kind: str = "text"  # text | state (ask which state) | state_note (state-specific, has sources)
    text: str
    note_title: str | None = None
    sources: list[states.Source] = Field(default_factory=list)


SERIOUS_STEPS = (
    "Stay out of traffic and away from damaged vehicles.",
    "Follow the 911 dispatcher's instructions, including what to do with the vehicles.",
    "Stay calm and avoid arguing with the other driver.",
    "Take photos only if it is completely safe.",
    "Write down what you remember now: the time, the place, and what you saw.",
    "When the police arrive, tell them what you saw. Ask how to get a copy of the report.",
)

STATE_QUESTION = "Where did the accident happen? Some rules depend on the state."
GENERAL_OTHER = (
    "I don't have details for that state. Some places require a police report or a report to the state. "
    "Check that state's official guidance."
)
GENERAL_UNSURE = (
    "That's okay. Some places require a police report or a report to the state. "
    "Check the official guidance for the state you are in."
)


def guide_steps(level: str, answers: dict[str, Answer], accident_state: str | None = None) -> list[GuideStep]:
    """The ordered steps for this situation.

    Emergency has no guidance steps: the 911 call is the guidance, and the state is taken from the phone's location
    without asking (see session.set_accident_state, via="location_auto"). Serious ends with the state question.
    """
    if level == "emergency":
        return []
    if level == "serious":
        # Police and 911 handle the reporting here, so no state notes: just record where it happened.
        return [GuideStep(text=t) for t in SERIOUS_STEPS] + [GuideStep(kind="state", text=STATE_QUESTION)]
    if answers.get("movable") == Answer.NO:
        first = "Turn on your hazard lights. If you cannot move your vehicle, leave it and stay out of traffic."
    else:
        first = "Turn on your hazard lights. If it is safe, move the vehicles out of traffic."
    steps = [GuideStep(text=t) for t in (
        "Take a breath. We will go one step at a time.",
        first,
        "Stay at the scene until you have exchanged information.",
        "Take photos while it is safe: both vehicles, the license plates, the damage, and the road.",
        "Exchange details with the other driver: name, phone number, insurance company, policy number, and license plate.",
        "Stick to the facts when you describe what happened.",
        "Call your insurance company to report the accident.",
    )]
    steps.append(GuideStep(kind="state", text=STATE_QUESTION))
    notes = states.ui_notes(accident_state)
    if notes:
        steps.extend(GuideStep(kind="state_note", text=n.text, note_title=n.title, sources=n.sources) for n in notes)
    elif accident_state == states.OTHER:
        steps.append(GuideStep(text=GENERAL_OTHER))
    elif accident_state == states.UNSURE:
        steps.append(GuideStep(text=GENERAL_UNSURE))
    return steps
