"""Session state machine and intake summary.

Flow: consent -> safety check -> (emergency notice) -> 'what to do now' guidance -> photo checklist -> details -> summary.
Code decides every transition and every fixed line of text. The model only supplies photo observations (PhotoAnalysis)
and cannot change the stage, the emergency level, or pass/fail.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from enum import StrEnum

from pydantic import BaseModel, Field

from .checklist import ITEM_BY_ID, ITEMS, ItemStatus, PhotoVerdict, evaluate_photo, item_instruction, item_title
from .emergency import (
    EMERGENCY_NUMBERS,
    QUESTION_IDS,
    SKIPPED_WHEN_EMERGENCY,
    Answer,
    CallButton,
    EmergencyDecision,
    evaluate,
    parse_alternatives,
    safety_questions,
)
from .guard import filter_items
from . import kr, states
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


def info_fields(country: str = "US") -> dict[str, str]:
    return kr.INFO_FIELDS if kr.is_kr(country) else INFO_FIELDS


def source_label(country: str = "US") -> dict[Source, str]:
    return {Source(k): v for k, v in kr.SOURCE_LABEL.items()} if kr.is_kr(country) else SOURCE_LABEL


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
    coach_calls: int = 0  # live-coaching requests (capped per session)
    hit: dict[str, str] = Field(default_factory=dict)        # Korea edition: what was hit (kr.HIT_ITEMS -> yes/no/unknown)
    coverage: dict[str, str] = Field(default_factory=dict)   # Korea edition: what has been reported (kr.COVERAGE_ITEMS -> state)
    followups: list[dict] = Field(default_factory=list)      # Korea edition: later notes, each {"time", "text"}
    contact: dict[str, str] = Field(default_factory=dict)    # Korea edition: after the call to the insurer {"state", "number", "agent"}


# ---------- Creation and consent ----------

def new_session(country: str = "US") -> Session:
    if country not in EMERGENCY_NUMBERS:
        raise ValueError(f"Unsupported country: {country}")
    s = Session(country=country)
    if kr.is_kr(country):
        s.accident_state = states.KR  # one jurisdiction: nobody is asked which state
        s.accident_state_via = "system"
        s.slots = [PhotoSlot(item_id=i) for i in kr.PHOTO_ORDER]  # my damage, the other car, then the scene
    return s


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
    steps = guide_steps(s.emergency.level, s.safety_answers, s.accident_state, s.country)
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
    if not states.valid_choice_for(code, s.country):
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
    steps = guide_steps(s.emergency.level, s.safety_answers, s.accident_state, s.country)
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
    verdict = evaluate_photo(ITEM_BY_ID[item_id], analysis, s.country)
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
    slot.skip_reason = reason.strip() or (kr.SUMMARY["no_reason"] if kr.is_kr(s.country) else "No reason given")
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


SUGGESTABLE_FIELDS = ("other_contact", "other_insurance", "other_plate", "other_vehicle")
MAX_SUGGESTION_CHARS = 80


def suggest_info(s: Session, field: str, value: str) -> bool:
    """A detail of the other driver that live coaching heard in the conversation. It is only a suggestion: it is stored as
    an AI observation that is NOT confirmed, so the summary lists it as unconfirmed until the user says yes. It never
    replaces something the user typed or confirmed, and it can be given at any stage after the user has agreed to start."""
    if s.stage is Stage.CONSENT or field not in SUGGESTABLE_FIELDS:
        return False
    value = " ".join(str(value).split())
    if not value or len(value) > MAX_SUGGESTION_CHARS or not filter_items([value])[0]:
        return False
    current = s.info.get(field)
    if current is not None and (current.confirmed or current.source is not Source.AI_OBSERVATION):
        return False
    s.info[field] = InfoValue(value=value, source=Source.AI_OBSERVATION, confirmed=False)
    return True


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
    ko = kr.is_kr(s.country)
    if s.stage is Stage.CONSENT:
        return Prompt(
            kind="consent",
            text=kr.CONSENT_TEXT if ko else
            "ScenePilot guides you through an accident one step at a time and organizes your photos and statements. "
            "It does not decide who is at fault, what repairs cost, or anyone's legal responsibility. AI observations can be wrong. Continue?",
            options=kr.OPTIONS["consent"] if ko else ["Agree and start"],
        )
    if s.stage is Stage.SAFETY:
        qid = _next_question_id(s)  # the same rule that decides which question the next answer belongs to
        q = next(q for q in safety_questions(s.country) if q.id == qid)
        retry = s.unparsed.get(q.id, 0) > 0
        text = ((kr.RETRY_PREFIX if ko else "Sorry, I didn't catch that. ") if retry else "") + q.text
        return Prompt(kind="safety_question", text=text, options=kr.OPTIONS["safety"] if ko else ["Yes", "No", "Not sure"], item_id=q.id)
    if s.stage is Stage.EMERGENCY:
        return Prompt(
            kind="emergency",
            text=s.emergency.title or ("안전이 먼저입니다." if ko else "Safety first."),
            actions=s.emergency.actions,
            call_buttons=s.emergency.call_buttons,
            options=kr.OPTIONS["emergency"] if ko else ["Got it"],
        )
    if s.stage is Stage.GUIDE:
        steps = guide_steps(s.emergency.level, s.safety_answers, s.accident_state, s.country)
        i = min(s.guide_index, len(steps) - 1)
        cur = steps[i]
        return Prompt(
            kind="guide", text=cur.text, items=cur.items, steps=[st.text for st in steps], step_index=i, step_kind=cur.kind,
            step_title=cur.note_title, sources=[src.model_dump() for src in cur.sources],
            states=states.supported(s.country) if cur.kind == "state" else [], state_choice=s.accident_state,
            state_disclaimer=states.disclaimer_for(s.accident_state) if cur.kind == "state_note" else None,
            options=kr.OPTIONS["guide"] if ko else ["Next", "Skip to photos"],
        )
    if s.stage is Stage.PHOTOS:
        item_id = current_item_id(s)
        item = ITEM_BY_ID[item_id]
        slot = _slot(s, item_id)
        warning = (kr.PHOTO_WARNING if ko else "Only take photos where you are safe.") if s.emergency.level != "none" else None
        return Prompt(
            kind="photo", text=item_instruction(item, s.country), item_id=item_id, warning=warning,
            retake_message=slot.last_message if slot.status is ItemStatus.NEEDS_RETAKE else None,
            options=kr.OPTIONS["photo"] if ko else ["Skip"],
        )
    if s.stage is Stage.HUB:
        extra = len(_unresolved(s, False))
        if ko:
            options = [kr.HUB_CREATE] + ([kr.HUB_MORE.format(n=extra)] if extra else []) + [kr.HUB_DETAILS]
        else:
            options = ["Create summary"]
            if extra:
                options.append(f"Take more photos ({extra} left)")
            options.append("Add details")
        return Prompt(
            kind="hub",
            text=kr.HUB_TEXT if ko else
            "The essential photos are done. You can create the summary now, or finish the rest when it is safe.",
            options=options,
        )
    if s.stage is Stage.INFO:
        return Prompt(
            kind="info",
            text=kr.INFO_TEXT if ko else "Add any other details you have, or go straight to the summary.",
            options=list(info_fields(s.country).values()),
        )
    if ko:  # the pre-leave check is read out after the summary is announced
        return Prompt(kind="summary", text=kr.SUMMARY_READY, items=leave_check(s))
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
    country: str = "US"
    leave_check: list[str] = Field(default_factory=list)   # Korea edition: what is still missing before leaving (warning only)
    next_steps: list[str] = Field(default_factory=list)    # Korea edition: what to do after the scene
    cleanup: str | None = None                             # Korea edition: advice to clear the other driver's details
    call_card: list[str] = Field(default_factory=list)     # Korea edition: what to say to the insurer, built from the record
    hit_rows: list[dict] = Field(default_factory=list)     # Korea edition: [{"id","label","state","state_label"}]
    coverage_rows: list[dict] = Field(default_factory=list)
    followups: list[dict] = Field(default_factory=list)    # Korea edition: [{"time","text"}]
    contact: dict | None = None                            # Korea edition: what the user recorded after calling the insurer
    uninsured: dict | None = None                          # Korea edition: what to do if the other side has no insurance or fled
    titles: dict[str, str] = Field(default_factory=dict)   # Korea edition: headings of the cards above


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
_EN_SUMMARY = {
    "time": "Time", "level": "Situation level (rule-based)", "not_asked": "Not asked", "no_answer": "No answer",
    "account_missing": "Your account of what happened", "reason": "reason", "visible_damage": "visible damage",
    "observation": "observation", "not_confirmed_yet": "not yet confirmed", "needs_confirmation": "needs your confirmation",
    "basic": "Basic info", "safety": "Injuries and emergency", "statement": "Your statement", "photos": "Photos",
    "ai": "AI observations (unverified)", "others": "Other driver and witnesses", "none": "(none)",
    "unconfirmed_section": "Not confirmed", "notice": "Notice",
}
_EN_LEVEL = {"emergency": "Emergency", "caution": "Caution", "none": "Standard"}


def _words(country: str) -> dict[str, str]:
    return kr.SUMMARY if kr.is_kr(country) else _EN_SUMMARY


def build_summary(s: Session) -> Summary:
    """Build the intake summary. Code fills the structure and wording; model sentences are included only if they pass the forbidden-output check."""
    _require(s, Stage.SUMMARY)
    ko = kr.is_kr(s.country)
    w = _words(s.country)
    fields = info_fields(s.country)
    answer_label = {Answer(k): v for k, v in kr.ANSWER_LABEL.items()} if ko else _ANSWER_LABEL
    status_label = {ItemStatus(k): v for k, v in kr.STATUS_LABEL.items()} if ko else _STATUS_LABEL
    damage_label = kr.DAMAGE_LABEL if ko else _DAMAGE_LABEL
    level_label = (kr.LEVEL_LABEL if ko else _EN_LEVEL)[s.emergency.level]
    missing: list[str] = []

    when = (
        s.created_at.astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M KST") if ko
        else s.created_at.strftime("%Y-%m-%d %H:%M UTC")
    )
    basic = [SummaryItem(label=w["time"], value=when, source=Source.SYSTEM)]
    if not ko:  # the Korea edition has one jurisdiction, so there is no state to record
        basic.append(SummaryItem(
            label="State where the accident happened",
            value=states.name_of(s.accident_state) + _STATE_VIA_NOTE.get(s.accident_state_via if s.accident_state else "", ""),
            source=(
                Source.UNCONFIRMED if not s.accident_state or s.accident_state_via == "location_auto" else Source.USER_STATEMENT
            ),
        ))

    safety = []
    for q in safety_questions(s.country):
        ans = s.safety_answers.get(q.id)
        shown = answer_label[ans] if ans else (w["not_asked"] if q.id in SKIPPED_WHEN_EMERGENCY and s.emergency.level == "emergency" else w["no_answer"])
        safety.append(SummaryItem(label=q.text, value=shown, source=Source.USER_STATEMENT if ans else Source.UNCONFIRMED))
    safety.append(SummaryItem(label=w["level"], value=level_label, source=Source.SYSTEM))

    statement_items = []
    if "statement" in s.info:
        iv = s.info["statement"]
        statement_items.append(SummaryItem(label=fields["statement"], value=iv.value, source=iv.source))
    else:
        missing.append(w["account_missing"])

    photos, ai = [], []
    for slot in s.slots:
        title = item_title(ITEM_BY_ID[slot.item_id], s.country)
        detail = status_label[slot.status]
        if slot.status is ItemStatus.SKIPPED:
            detail += f" ({w['reason']}: {slot.skip_reason})"
        photos.append(SummaryItem(label=title, value=detail, source=Source.PHOTO if slot.analysis else Source.UNCONFIRMED))
        if slot.status is not ItemStatus.CAPTURED:
            missing.append(f"{title}: {detail}")
        if slot.analysis:
            a = slot.analysis
            ai.append(SummaryItem(label=f"{title} - {w['visible_damage']}", value=damage_label[a.visible_damage.value], source=Source.AI_OBSERVATION))
            observations, _ = filter_items(a.observations)
            for text in observations:
                ai.append(SummaryItem(label=f"{title} - {w['observation']}", value=text, source=Source.AI_OBSERVATION))

    others = []
    for field in ("other_plate", "other_vehicle", "other_contact", "other_insurance", "witness"):
        iv = s.info.get(field)
        if iv is None:
            missing.append(fields[field])
            continue
        if iv.confirmed:
            others.append(SummaryItem(label=fields[field], value=iv.value, source=iv.source))
        else:
            others.append(SummaryItem(label=fields[field], value=f"{iv.value} ({w['not_confirmed_yet']})", source=Source.UNCONFIRMED))
            missing.append(f"{fields[field]}: {w['needs_confirmation']}")

    sections = [
        SummarySection(title=w["basic"], items=basic),
        SummarySection(title=w["safety"], items=safety),
        SummarySection(title=w["statement"], items=statement_items),
        SummarySection(title=w["photos"], items=photos),
        SummarySection(title=w["ai"], items=ai),
        SummarySection(title=w["others"], items=others),
    ]
    return Summary(
        sections=sections, missing=missing, disclaimer=kr.DISCLAIMER if ko else DISCLAIMER, country=s.country,
        leave_check=leave_check(s), next_steps=list(kr.NEXT_STEPS) if ko else [], cleanup=kr.CLEANUP if ko else None,
        call_card=call_card(s), hit_rows=_rows(s.hit, kr.HIT_ITEMS, kr.HIT_STATES, "unknown") if ko else [],
        coverage_rows=_rows(s.coverage, kr.COVERAGE_ITEMS, kr.COVERAGE_STATES, "unknown") if ko else [],
        followups=list(s.followups) if ko else [],
        contact=_contact_view(s) if ko else None,
        uninsured={"title": kr.UNINSURED_TITLE, "lines": list(kr.UNINSURED), "source": kr.UNINSURED_SOURCE} if ko else None,
        titles={"coverage": kr.COVERAGE_TITLE, "coverage_note": kr.COVERAGE_NOTE, "hit": kr.HIT_TITLE, "call": kr.CALL_CARD_TITLE,
                "call_note": kr.CALL_CARD_NOTE, "followup": kr.FOLLOWUP_TITLE, "followup_note": kr.FOLLOWUP_NOTE} if ko else {},
    )


def _rows(chosen: dict[str, str], items: dict[str, str], states_: dict[str, str], default: str) -> list[dict]:
    return [{"id": i, "label": label, "state": chosen.get(i, default), "state_label": states_[chosen.get(i, default)]}
            for i, label in items.items()]


def _contact_view(s: Session) -> dict:
    state = s.contact.get("state", "before")
    # someone is said to be hurt but the injury claim was never confirmed: the one thing the call record must not let slide
    warn = s.hit.get("person") == "yes" and s.coverage.get("injury_claim") != "confirmed"
    return {"state": state, "state_label": kr.CONTACT_STATES[state], "states": kr.CONTACT_STATES, "title": kr.CONTACT_TITLE,
            "note": kr.CONTACT_NOTE, "number": s.contact.get("number", ""), "agent": s.contact.get("agent", ""),
            "warning": kr.CONTACT_WARNING if warn else None}


def set_contact(s: Session, state: str | None = None, number: str | None = None, agent: str | None = None) -> None:
    """Korea edition: what happened on the call to the insurer, as the user heard it. Pressing call or ending a call changes nothing."""
    _require(s, Stage.SUMMARY, Stage.HUB)
    if not kr.is_kr(s.country):
        raise ValueError("Only the Korea edition keeps a call record.")
    if state is not None:
        if state not in kr.CONTACT_STATES:
            raise ValueError("Unknown state.")
        s.contact["state"] = state
    for key, value in (("number", number), ("agent", agent)):
        if value is not None:
            value = " ".join(value.split())
            if len(value) > kr.CONTACT_FIELD_CHARS:
                raise ValueError("Too long.")
            s.contact[key] = value


def set_hit(s: Session, item: str, state: str) -> None:
    """Korea edition: what the user says was hit. A plain record; nothing is decided from it."""
    _require(s, Stage.SUMMARY, Stage.HUB)
    if not kr.is_kr(s.country) or item not in kr.HIT_ITEMS or state not in kr.HIT_STATES:
        raise ValueError("Unknown item or state.")
    s.hit[item] = state


def set_coverage(s: Session, item: str, state: str) -> None:
    """Korea edition: what the user has reported or confirmed with an insurer. Recorded by hand, never inferred."""
    _require(s, Stage.SUMMARY, Stage.HUB)
    if not kr.is_kr(s.country) or item not in kr.COVERAGE_ITEMS or state not in kr.COVERAGE_STATES:
        raise ValueError("Unknown item or state.")
    s.coverage[item] = state


def add_followup(s: Session, text: str) -> None:
    """Korea edition: something learned after the scene (late pain, more damage, a refusal). The first record is kept as it is."""
    _require(s, Stage.SUMMARY)
    text = " ".join(text.split())
    if not kr.is_kr(s.country):
        raise ValueError("Only the Korea edition keeps later notes.")
    if not text or len(text) > kr.FOLLOWUP_CHARS or len(s.followups) >= kr.FOLLOWUP_MAX:
        raise ValueError("The note is empty, too long, or there are too many notes.")
    when = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M KST")
    s.followups.append({"time": when, "text": text})


def call_card(s: Session) -> list[str]:
    """Korea edition: sentences the user can read out to the insurer, filled only from what the record holds."""
    if not kr.is_kr(s.country):
        return []
    kst = timezone(timedelta(hours=9))
    out = [f"사고 시간은 {s.created_at.astimezone(kst).strftime('%H시 %M분')}경입니다."]
    hit = [kr.HIT_ITEMS[i].split(" (")[0] for i, v in s.hit.items() if v == "yes" and i in kr.HIT_ITEMS]
    out.append(f"부딪힌 대상은 {', '.join(hit)}입니다." if hit else "부딪힌 대상은 아직 확인하지 못했습니다.")
    danger = s.safety_answers.get("danger")
    out.append({Answer.YES: "다친 사람이나 위험 신호가 있다고 답했습니다.", Answer.NO: "현재 다친 사람은 없다고 답했습니다."}
               .get(danger, "다친 사람이 있는지는 확인하지 못했습니다."))
    taken = sum(1 for sl in s.slots if sl.status is ItemStatus.CAPTURED)
    out.append(f"현장 사진은 {taken}장 찍었고, 사진 분석은 참고용입니다." if taken else "현장 사진은 아직 찍지 못했습니다.")
    known = [(label, s.info[f].value) for f, label in (("other_plate", "상대 차량번호"), ("other_insurance", "상대 보험사"))
             if f in s.info and s.info[f].confirmed]
    out.append(" ".join(f"{label}는 {value}입니다." for label, value in known) if known else "상대방 정보는 아직 확인하지 못했습니다.")
    movable = s.safety_answers.get("movable")
    out.append({Answer.NO: "차량 이동 지원이 필요할 수 있습니다.", Answer.YES: "차량은 직접 이동할 수 있다고 답했습니다."}
               .get(movable, "차량 이동 지원이 필요한지는 모릅니다."))
    return out + list(kr.CALL_CARD_END)


def leave_check(s: Session) -> list[str]:
    """Korea edition: what to look at before leaving the scene. Fixed sentences chosen by code from what the session lacks.
    It only warns; nothing here stops anyone from leaving."""
    if not kr.is_kr(s.country):
        return []
    out = [
        kr.LEAVE_PHOTO.format(title=item_title(ITEM_BY_ID[slot.item_id], s.country))
        for slot in s.slots if ITEM_BY_ID[slot.item_id].core and slot.status is not ItemStatus.CAPTURED
    ]
    for field, sentence in kr.LEAVE_INFO.items():
        iv = s.info.get(field)
        if iv is None or not iv.confirmed:
            out.append(sentence)
    return [kr.LEAVE_LEAD] + (out or [kr.LEAVE_NOTHING]) + list(kr.LEAVE_ALWAYS)


def render_summary_text(summary: Summary) -> str:
    """Plain text for copying and sharing. Every item carries a source tag."""
    w = _words(summary.country)
    labels = source_label(summary.country)
    lines: list[str] = []
    for n, sec in enumerate(summary.sections, 1):
        lines.append(f"{n}. {sec.title}")
        if not sec.items:
            lines.append(f"  - {w['none']}")
        for it in sec.items:
            lines.append(f"  - {it.label}: {it.value} [{labels[it.source]}]")
        lines.append("")
    lines.append(f"{len(summary.sections) + 1}. {w['unconfirmed_section']}")
    lines.extend(f"  - {m}" for m in summary.missing) if summary.missing else lines.append(f"  - {w['none']}")
    lines.append("")
    extra = len(summary.sections) + 2
    if summary.coverage_rows:   # Korea edition: what the user recorded about reporting to the insurers
        lines.append(f"{extra}. {kr.COVERAGE_TITLE}")
        lines.extend(f"  - {r['label']}: {r['state_label']}" for r in summary.coverage_rows)
        lines.append(f"  - {kr.HIT_TITLE}: " + ", ".join(f"{r['label'].split(' (')[0]} {r['state_label']}" for r in summary.hit_rows))
        lines.append("")
        extra += 1
    if summary.contact:
        c = summary.contact
        lines.append(f"{extra}. {kr.CONTACT_TITLE}")
        lines.append(f"  - 연락 상태: {c['state_label']}")
        if c["number"]:
            lines.append(f"  - 접수번호: {c['number']} [{labels[Source.USER_STATEMENT]}]")
        if c["agent"]:
            lines.append(f"  - 담당자: {c['agent']} [{labels[Source.USER_STATEMENT]}]")
        lines.append("")
        extra += 1
    if summary.followups:
        lines.append(f"{extra}. {kr.FOLLOWUP_TITLE}")
        lines.extend(f"  - {f['time']}: {f['text']} [{labels[Source.USER_STATEMENT]}]" for f in summary.followups)
        lines.append("")
        extra += 1
    lines.append(f"{extra}. {w['notice']}")
    lines.append(f"  {summary.disclaimer}")
    return "\n".join(lines)