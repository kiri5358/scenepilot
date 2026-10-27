"""Session state machine and intake summary.

Flow: consent -> safety check -> (emergency notice) -> 'what to do now' guidance -> photo checklist -> details -> summary.
Code decides every transition and every fixed line of text. The model only supplies photo observations (PhotoAnalysis)
and cannot change the stage, the emergency level, or pass/fail.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import StrEnum

from pydantic import BaseModel, Field

from .checklist import ITEM_BY_ID, ITEMS, ItemStatus, PhotoVerdict, evaluate_photo
from .emergency import (
    EMERGENCY_NUMBERS,
    QUESTION_IDS,
    SAFETY_QUESTIONS,
    SKIPPED_WHEN_EMERGENCY,
    Answer,
    CallButton,
    EmergencyDecision,
    evaluate,
    parse_alternatives,
)
from .guard import filter_items
from . import states
from .playbooks import guide_steps
from .schemas import PhotoAnalysis

DISCLAIMER = (
    "This summary does not decide who is at fault, what repairs cost, or anyone's legal responsibility. "
    "It is a record of facts; your insurance company and qualified professionals make the final decisions."
)
MAX_UNPARSED = 2  # after this many misunderstood answers to one question, treat it as 'not sure' (the risky side)


class StateError(Exception):
    """An action that is not allowed in the current stage."""


class Stage(StrEnum):
    CONSENT = "consent"
    SAFETY = "safety"
    EMERGENCY = "emergency"
    GUIDE = "guide"  # step-by-step "what to do now"
    PHOTOS = "photos"
    HUB = "hub"  # fork after the core photos: summary / more photos / details
    INFO = "info"
    SUMMARY = "summary"


class Source(StrEnum):
    USER_STATEMENT = "user_statement"
    PHOTO = "photo"
    AI_OBSERVATION = "ai_observation"
    UNCONFIRMED = "unconfirmed"
    SYSTEM = "system"


SOURCE_LABEL = {
    Source.USER_STATEMENT: "Your statement",
    Source.PHOTO: "Photo",
    Source.AI_OBSERVATION: "AI observation, unverified",
    Source.UNCONFIRMED: "Unconfirmed",
    Source.SYSTEM: "Recorded automatically",
}

INFO_FIELDS = {
    "statement": "What happened",
    "other_plate": "Other vehicle license plate",
    "other_vehicle": "Other vehicle (make, model, color)",
    "other_contact": "Other driver contact",
    "other_insurance": "Other driver insurance",
    "witness": "Witnesses",
}


class PhotoSlot(BaseModel):
    item_id: str
    status: ItemStatus = ItemStatus.PENDING
    attempts: int = 0
    analysis: PhotoAnalysis | None = None
    skip_reason: str | None = None
    last_message: str | None = None


class InfoValue(BaseModel):
    value: str
    source: Source
    confirmed: bool


class Session(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    country: str = "US"
    stage: Stage = Stage.CONSENT
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    safety_answers: dict[str, Answer] = Field(default_factory=dict)
    unparsed: dict[str, int] = Field(default_factory=dict)
    emergency: EmergencyDecision = Field(default_factory=EmergencyDecision)
    acked_triggers: list[str] = Field(default_factory=list)
    guide_index: int = 0
    accident_state: str | None = None  # a state code, 'OTHER', 'UNSURE', or None when not asked
    accident_state_via: str = "manual"  # 'manual', or 'location' when the phone's location suggested it and the user confirmed
    slots: list[PhotoSlot] = Field(default_factory=lambda: [PhotoSlot(item_id=i.id) for i in ITEMS])
    extra_mode: bool = False  # True while taking the extra photos after the core ones
    info: dict[str, InfoValue] = Field(default_factory=dict)
    questions_asked: int = 0  # free questions put to the helper (capped per session)


# ---------- Creation and consent ----------

def new_session(country: str = "US") -> Session:
    if country not in EMERGENCY_NUMBERS:
        raise ValueError(f"Unsupported country: {country}")
    return Session(country=country)


def _require(s: Session, *stages: Stage) -> None:
    if s.stage not in stages:
        allowed = "/".join(st.value for st in stages)
        raise StateError(f"Not allowed in the current stage ({s.stage.value}). Required stage: {allowed}")


def accept_consent(s: Session) -> None:
    _require(s, Stage.CONSENT)
    s.stage = Stage.SAFETY


# ---------- Safety check and emergency ----------

def _next_question_id(s: Session) -> str | None:
    for q in QUESTION_IDS:
        if q in s.safety_answers:
            continue
        if q in SKIPPED_WHEN_EMERGENCY and s.emergency.level == "emergency":
            continue  # 911 handles these details and they cannot lower the level
        return q
    return None


def safety_question_count(s: Session) -> int:
    """How many safety questions this session asks in total (an emergency skips the detail questions)."""
    skipped = SKIPPED_WHEN_EMERGENCY if s.emergency.level == "emergency" else frozenset()
    return len([q for q in QUESTION_IDS if q not in skipped or q in s.safety_answers])


def _pending_triggers(s: Session) -> list[str]:
    if s.emergency.level != "emergency":
        return []
    return [t for t in s.emergency.triggers if t not in s.acked_triggers]


def answer_safety(s: Session, raw: str, alternatives: list[str] | None = None) -> bool:
    """Handle an answer to a safety question. True if understood, False if we must ask again.

    `alternatives` are the speech recognizer's other guesses for the same sentence (spoken answers only)."""
    _require(s, Stage.SAFETY)
    qid = _next_question_id(s)
    if qid is None:  # defensive: all questions are done but we are still in this stage
        _after_safety(s)
        return True
    answer = parse_alternatives([raw, *(alternatives or [])], qid)
    if answer is None:
        s.unparsed[qid] = s.unparsed.get(qid, 0) + 1
        if s.unparsed[qid] < MAX_UNPARSED:
            return False
        answer = Answer.UNSURE
    s.safety_answers[qid] = answer
    s.emergency = evaluate(s.safety_answers, s.country)
    if _pending_triggers(s):
        s.stage = Stage.EMERGENCY  # the rules show the emergency notice before anything else
    else:
        _after_safety(s)
    return True


def acknowledge_emergency(s: Session) -> None:
    _require(s, Stage.EMERGENCY)
    s.acked_triggers = sorted(set(s.acked_triggers) | set(s.emergency.triggers))
    _after_safety(s)


def _after_safety(s: Session) -> None:
    """Next stage once a safety answer or an acknowledgement has been handled."""
    if _next_question_id(s) is not None:
        s.stage = Stage.SAFETY
    elif s.emergency.level == "emergency":
        s.stage = Stage.PHOTOS  # the 911 call is the guidance; no more screens to read in an emergency
    else:
        s.guide_index = 0
        s.stage = Stage.GUIDE


# ---------- Guidance: what to do now ----------

def guide(s: Session, action: str) -> None:
    """Move through the step-by-step guidance. action: next | back | skip."""
    _require(s, Stage.GUIDE)
    steps = guide_steps(s.emergency.level, s.safety_answers, s.accident_state)
    if action == "next":
        current = steps[min(s.guide_index, len(steps) - 1)]
        if current.kind == "state" and s.accident_state is None:
            raise StateError("Choose a state first, or tap Not sure.")
        s.guide_index += 1
        if s.guide_index >= len(steps):
            s.stage = Stage.PHOTOS
    elif action == "back":
        s.guide_index = max(0, s.guide_index - 1)
    elif action == "skip":
        s.stage = Stage.PHOTOS
    else:
        raise ValueError(f"Unknown guide action: {action}")


def set_accident_state(s: Session, code: str, via: str = "manual") -> None:
    """Record which state the accident happened in and move past the state question.

    via is "location" when the phone's location suggested the state and the user confirmed it. The coordinates
    themselves never reach the server; only this label does.
    """
    if via not in ("manual", "location", "location_auto"):
        raise ValueError(f"Unknown state source: {via}")
    if not states.valid_choice(code):
        raise ValueError(f"Unknown state choice: {code}")
    if via == "location_auto":
        # In an emergency nobody can be asked: the phone's location picks the state without a question.
        if s.stage is Stage.CONSENT:
            raise StateError("Not allowed before the user has agreed to start.")
        if s.emergency.level != "emergency":
            raise StateError("The state is chosen automatically only in an emergency.")
        if s.accident_state is None:  # never override something the user chose
            s.accident_state = code
            s.accident_state_via = via
        return
    _require(s, Stage.GUIDE)
    s.accident_state = code
    s.accident_state_via = via
    steps = guide_steps(s.emergency.level, s.safety_answers, s.accident_state)
    ask = next((i for i, st in enumerate(steps) if st.kind == "state"), None)
    if ask is not None and s.guide_index == ask:
        s.guide_index = ask + 1
        if s.guide_index >= len(steps):
            s.stage = Stage.PHOTOS


# ---------- Photos ----------

def _slot(s: Session, item_id: str) -> PhotoSlot:
    return next(sl for sl in s.slots if sl.item_id == item_id)


def _unresolved(s: Session, core: bool) -> list[PhotoSlot]:
    return [
        sl for sl in s.slots
        if ITEM_BY_ID[sl.item_id].core == core and sl.status in (ItemStatus.PENDING, ItemStatus.NEEDS_RETAKE)
    ]


def current_item_id(s: Session) -> str | None:
    """The item to photograph now. Core photos come first; extras appear only if the user chose to continue."""
    core = _unresolved(s, True)
    if core:
        return core[0].item_id
    if s.extra_mode:
        extra = _unresolved(s, False)
        if extra:
            return extra[0].item_id
    return None


def photo_progress(s: Session) -> dict:
    def count(core: bool) -> tuple[int, int]:
        slots = [sl for sl in s.slots if ITEM_BY_ID[sl.item_id].core == core]
        return sum(sl.status in (ItemStatus.CAPTURED, ItemStatus.SKIPPED) for sl in slots), len(slots)

    core_done, core_total = count(True)
    extra_done, extra_total = count(False)
    return {
        "core_done": core_done, "core_total": core_total,
        "extra_done": extra_done, "extra_total": extra_total, "extra_mode": s.extra_mode,
    }


def _advance_if_photos_done(s: Session) -> None:
    if current_item_id(s) is None:
        s.extra_mode = False
        s.stage = Stage.HUB


def go_to(s: Session, target: str) -> None:
    """Moves after the core photos. At the scene you can stop at the summary and come back to the rest later."""
    if target == "photos":
        _require(s, Stage.HUB)
        if not _unresolved(s, False):
            raise StateError("There are no extra photos left.")
        s.extra_mode = True
        s.stage = Stage.PHOTOS
    elif target == "info":
        _require(s, Stage.HUB, Stage.SUMMARY)
        s.stage = Stage.INFO
    elif target == "summary":
        _require(s, Stage.HUB, Stage.INFO)
        s.stage = Stage.SUMMARY
    elif target == "hub":
        _require(s, Stage.PHOTOS, Stage.INFO, Stage.SUMMARY)
        if _unresolved(s, True):
            raise StateError("Please finish the core scene photos first.")
        s.extra_mode = False
        s.stage = Stage.HUB
    else:
        raise ValueError(f"Unknown target: {target}")


def submit_photo(s: Session, analysis: PhotoAnalysis) -> PhotoVerdict:
    """Apply a photo analysis to the current checklist item. Code decides pass/fail."""
    _require(s, Stage.PHOTOS)
    item_id = current_item_id(s)
    if item_id is None:
        raise StateError("There are no photo steps left.")
    slot = _slot(s, item_id)
    verdict = evaluate_photo(ITEM_BY_ID[item_id], analysis)
    slot.attempts += 1
    slot.last_message = verdict.message
    if verdict.accepted:
        slot.status = ItemStatus.CAPTURED
        slot.analysis = analysis
        _advance_if_photos_done(s)
    else:
        slot.status = ItemStatus.NEEDS_RETAKE
    return verdict


def skip_item(s: Session, reason: str) -> None:
    _require(s, Stage.PHOTOS)
    item_id = current_item_id(s)
    if item_id is None:
        raise StateError("There are no photo steps left.")
    slot = _slot(s, item_id)
    slot.status = ItemStatus.SKIPPED
    slot.skip_reason = reason.strip() or "No reason given"
    _advance_if_photos_done(s)


# ---------- Details ----------

def set_info(s: Session, field: str, value: str, source: Source = Source.USER_STATEMENT) -> None:
    """Values the user typed are confirmed; values read by AI or from photos stay unconfirmed until the user confirms them."""
    _require(s, Stage.INFO)
    if field not in INFO_FIELDS:
        raise ValueError(f"Unknown field: {field}")
    value = value.strip()
    if not value:
        s.info.pop(field, None)
        return
    s.info[field] = InfoValue(value=value, source=source, confirmed=source is Source.USER_STATEMENT)


def confirm_info(s: Session, field: str) -> None:
    _require(s, Stage.INFO)
    if field not in s.info:
        raise ValueError(f"No value recorded for field: {field}")
    s.info[field].confirmed = True
    s.info[field].source = Source.USER_STATEMENT  # the user confirmed this value


def finish(s: Session) -> None:
    go_to(s, "summary")


# ---------- Next prompt (one thing at a time) ----------

class Prompt(BaseModel):
    kind: str  # consent | safety_question | emergency | photo | info | summary
    text: str
    options: list[str] = Field(default_factory=list)
    call_buttons: list[CallButton] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)
    warning: str | None = None
    item_id: str | None = None
    retake_message: str | None = None
    steps: list[str] = Field(default_factory=list)
    items: list[str] = Field(default_factory=list)  # the sentences of a list step, read one after the other
    step_index: int = 0
    step_kind: str = "text"
    step_title: str | None = None
    sources: list[dict] = Field(default_factory=list)
    states: list[dict] = Field(default_factory=list)
    state_choice: str | None = None
    state_disclaimer: str | None = None


def next_prompt(s: Session) -> Prompt:
    if s.stage is Stage.CONSENT:
        return Prompt(
            kind="consent",
            text="ScenePilot guides you through an accident one step at a time and organizes your photos and statements. "
            "It does not decide who is at fault, what repairs cost, or anyone's legal responsibility. AI observations can be wrong. Continue?",
            options=["Agree and start"],
        )
    if s.stage is Stage.SAFETY:
        qid = _next_question_id(s)  # the same rule that decides which question the next answer belongs to
        q = next(q for q in SAFETY_QUESTIONS if q.id == qid)
        retry = s.unparsed.get(q.id, 0) > 0
        text = ("Sorry, I didn't catch that. " if retry else "") + q.text
        return Prompt(kind="safety_question", text=text, options=["Yes", "No", "Not sure"], item_id=q.id)
    if s.stage is Stage.EMERGENCY:
        return Prompt(
            kind="emergency",
            text=s.emergency.title or "Safety first.",
            actions=s.emergency.actions,
            call_buttons=s.emergency.call_buttons,
            options=["Got it"],
        )
    if s.stage is Stage.GUIDE:
        steps = guide_steps(s.emergency.level, s.safety_answers, s.accident_state)
        i = min(s.guide_index, len(steps) - 1)
        cur = steps[i]
        return Prompt(
            kind="guide", text=cur.text, items=cur.items, steps=[st.text for st in steps], step_index=i, step_kind=cur.kind,
            step_title=cur.note_title, sources=[src.model_dump() for src in cur.sources],
            states=states.supported() if cur.kind == "state" else [], state_choice=s.accident_state,
            state_disclaimer=states.load().disclaimer if cur.kind == "state_note" else None,
            options=["Next", "Skip to photos"],
        )
    if s.stage is Stage.PHOTOS:
        item_id = current_item_id(s)
        item = ITEM_BY_ID[item_id]
        slot = _slot(s, item_id)
        warning = "Only take photos where you are safe." if s.emergency.level != "none" else None
        return Prompt(
            kind="photo", text=item.instruction, item_id=item_id, warning=warning,
            retake_message=slot.last_message if slot.status is ItemStatus.NEEDS_RETAKE else None,
            options=["Skip"],
        )
    if s.stage is Stage.HUB:
        extra = len(_unresolved(s, False))
        options = ["Create summary"]
        if extra:
            options.append(f"Take more photos ({extra} left)")
        options.append("Add details")
        return Prompt(
            kind="hub",
            text="The essential photos are done. You can create the summary now, or finish the rest when it is safe.",
            options=options,
        )
    if s.stage is Stage.INFO:
        return Prompt(
            kind="info",
            text="Add any other details you have, or go straight to the summary.",
            options=list(INFO_FIELDS.values()),
        )
    return Prompt(kind="summary", text="Your summary is ready.")


# ---------- Summary ----------

class SummaryItem(BaseModel):
    label: str
    value: str
    source: Source


class SummarySection(BaseModel):
    title: str
    items: list[SummaryItem]


class Summary(BaseModel):
    sections: list[SummarySection]
    missing: list[str]
    disclaimer: str = DISCLAIMER


_STATE_VIA_NOTE = {
    "location": " (suggested by your phone's location, confirmed by you)",
    "location_auto": " (set automatically from your phone's location during an emergency; not confirmed)",
}
_ANSWER_LABEL = {Answer.YES: "Yes", Answer.NO: "No", Answer.UNSURE: "Not sure"}
_STATUS_LABEL = {
    ItemStatus.CAPTURED: "Taken",
    ItemStatus.NEEDS_RETAKE: "Unclear, needs a retake",
    ItemStatus.SKIPPED: "Skipped",
    ItemStatus.PENDING: "Not taken",
}
_DAMAGE_LABEL = {"none": "No visible damage", "minor": "Looks minor", "major": "Looks significant", "unclear": "Can't tell"}


def build_summary(s: Session) -> Summary:
    """Build the intake summary. Code fills the structure and wording; model sentences are included only if they pass the forbidden-output check."""
    _require(s, Stage.SUMMARY)
    missing: list[str] = []

    basic = [
        SummaryItem(label="Time", value=s.created_at.strftime("%Y-%m-%d %H:%M UTC"), source=Source.SYSTEM),
        SummaryItem(
            label="State where the accident happened",
            value=states.name_of(s.accident_state) + _STATE_VIA_NOTE.get(s.accident_state_via if s.accident_state else "", ""),
            source=(
                Source.UNCONFIRMED if not s.accident_state or s.accident_state_via == "location_auto" else Source.USER_STATEMENT
            ),
        ),
    ]

    safety = []
    for q in SAFETY_QUESTIONS:
        ans = s.safety_answers.get(q.id)
        safety.append(SummaryItem(label=q.text, value=_ANSWER_LABEL[ans] if ans else ("Not asked" if q.id in SKIPPED_WHEN_EMERGENCY and s.emergency.level == "emergency" else "No answer"), source=Source.USER_STATEMENT if ans else Source.UNCONFIRMED))
    level_label = {"emergency": "Emergency", "caution": "Caution", "none": "Standard"}[s.emergency.level]
    safety.append(SummaryItem(label="Situation level (rule-based)", value=level_label, source=Source.SYSTEM))

    statement_items = []
    if "statement" in s.info:
        iv = s.info["statement"]
        statement_items.append(SummaryItem(label=INFO_FIELDS["statement"], value=iv.value, source=iv.source))
    else:
        missing.append("Your account of what happened")

    photos, ai = [], []
    for slot in s.slots:
        title = ITEM_BY_ID[slot.item_id].title
        detail = _STATUS_LABEL[slot.status]
        if slot.status is ItemStatus.SKIPPED:
            detail += f" (reason: {slot.skip_reason})"
        photos.append(SummaryItem(label=title, value=detail, source=Source.PHOTO if slot.analysis else Source.UNCONFIRMED))
        if slot.status is not ItemStatus.CAPTURED:
            missing.append(f"{title}: {detail}")
        if slot.analysis:
            a = slot.analysis
            ai.append(SummaryItem(label=f"{title} - visible damage", value=_DAMAGE_LABEL[a.visible_damage.value], source=Source.AI_OBSERVATION))
            observations, _ = filter_items(a.observations)
            for text in observations:
                ai.append(SummaryItem(label=f"{title} - observation", value=text, source=Source.AI_OBSERVATION))

    others = []
    for field in ("other_plate", "other_vehicle", "other_contact", "other_insurance", "witness"):
        iv = s.info.get(field)
        if iv is None:
            missing.append(INFO_FIELDS[field])
            continue
        if iv.confirmed:
            others.append(SummaryItem(label=INFO_FIELDS[field], value=iv.value, source=iv.source))
        else:
            others.append(SummaryItem(label=INFO_FIELDS[field], value=f"{iv.value} (not yet confirmed)", source=Source.UNCONFIRMED))
            missing.append(f"{INFO_FIELDS[field]}: needs your confirmation")

    sections = [
        SummarySection(title="Basic info", items=basic),
        SummarySection(title="Injuries and emergency", items=safety),
        SummarySection(title="Your statement", items=statement_items),
        SummarySection(title="Photos", items=photos),
        SummarySection(title="AI observations (unverified)", items=ai),
        SummarySection(title="Other driver and witnesses", items=others),
    ]
    return Summary(sections=sections, missing=missing)


def render_summary_text(summary: Summary) -> str:
    """Plain text for copying and sharing. Every item carries a source tag."""
    lines: list[str] = []
    for n, sec in enumerate(summary.sections, 1):
        lines.append(f"{n}. {sec.title}")
        if not sec.items:
            lines.append("  - (none)")
        for it in sec.items:
            lines.append(f"  - {it.label}: {it.value} [{SOURCE_LABEL[it.source]}]")
        lines.append("")
    lines.append(f"{len(summary.sections) + 1}. Not confirmed")
    lines.extend(f"  - {m}" for m in summary.missing) if summary.missing else lines.append("  - (none)")
    lines.append("")
    lines.append(f"{len(summary.sections) + 2}. Notice")
    lines.append(f"  {summary.disclaimer}")
    return "\n".join(lines)
