"""FastAPI app. Run: uv run uvicorn scenepilot.app:app --reload

Sessions live in memory only (hackathon demo). They disappear when the server restarts.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from . import session as sm
from . import assistant
from . import coach as coach_module
from . import ratelimit
from . import kr
from .checklist import ITEM_BY_ID, item_title
from .config import get_settings
from .emergency import QUESTION_IDS, danger_signals
from .guard import sanitize_analysis
from . import states, watch_hints
from .schemas import AnalyzeResponse
from .vision import VisionError, analyze_photo

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}

STATIC_DIR = Path(__file__).parent / "static"

def add_cors(application: FastAPI, origins: tuple[str, ...]) -> None:
    """Let the listed web origins call the API (used by the Android app). Does nothing when the list is empty."""
    if origins:
        application.add_middleware(CORSMiddleware, allow_origins=list(origins), allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


app = FastAPI(title="ScenePilot", version="0.1.0")
add_cors(app, get_settings().cors_origins)
class NoCacheStaticFiles(StaticFiles):
    """Static files that the browser must revalidate every time, so phones never run an old script or stylesheet."""

    def file_response(self, *args, **kwargs) -> Response:
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response


app.mount("/static", NoCacheStaticFiles(directory=STATIC_DIR), name="static")
SESSIONS: dict[str, sm.Session] = {}
MAX_SESSIONS = 500  # keep memory bounded on a public demo by dropping the oldest sessions first


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"})


def _get(session_id: str) -> sm.Session:
    s = SESSIONS.get(session_id)
    if s is None:
        raise HTTPException(404, "Session not found.")
    return s


def _view(s: sm.Session, **extra) -> dict:
    """Everything needed to draw one screen. The server (code) decides wording and stage; the UI just shows it."""
    data = {
        "session": s.model_dump(mode="json"),
        "prompt": sm.next_prompt(s).model_dump(mode="json"),
        "checklist": [
            {
                "id": sl.item_id, "title": item_title(ITEM_BY_ID[sl.item_id], s.country), "status": sl.status.value,
                "attempts": sl.attempts, "core": ITEM_BY_ID[sl.item_id].core,
            }
            for sl in s.slots
        ],
        "photo_progress": sm.photo_progress(s),
        "safety_progress": {"answered": len(s.safety_answers), "total": sm.safety_question_count(s)},
        "info_fields": sm.info_fields(s.country),
        **extra,
    }
    if s.stage is sm.Stage.SUMMARY:
        summary = sm.build_summary(s)
        data["summary"] = summary.model_dump(mode="json")
        data["summary_text"] = sm.render_summary_text(summary)
    return data


async def _read_image(file: UploadFile) -> tuple[bytes, str]:
    settings = get_settings()
    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_MIME:
        raise HTTPException(415, f"Unsupported file type ({mime or 'unknown'}). Only jpeg, png, and webp are allowed.")
    data = await file.read(settings.max_image_bytes + 1)
    if not data:
        raise HTTPException(400, "The file is empty.")
    if len(data) > settings.max_image_bytes:
        raise HTTPException(413, f"The image is too large (max {settings.max_image_bytes // 1024 // 1024} MB).")
    return data, mime


async def _analyze(file: UploadFile, request: Request, country: str = "US"):
    data, mime = await _read_image(file)
    ratelimit.enforce(request, "photo")  # after the free checks, right before the paid model call
    try:
        result = await analyze_photo(
            data, mime, settings=get_settings(), language=kr.VISION_LANGUAGE if kr.is_kr(country) else "English")
    except VisionError as e:
        raise HTTPException(502, str(e)) from e
    analysis, removed = sanitize_analysis(result.analysis)
    return analysis, removed, result


@app.get("/health")
async def health() -> dict:
    s = get_settings()
    return {"status": "ok", "api_key_configured": bool(s.api_key), "vision_model": s.vision_model}


# ---------- Single photo analysis ----------

@app.post("/api/analyze-photo", response_model=AnalyzeResponse)
async def analyze_photo_endpoint(request: Request, file: UploadFile = File(...)) -> AnalyzeResponse:
    analysis, _, result = await _analyze(file, request)
    return AnalyzeResponse(analysis=analysis, model=result.model, latency_ms=result.latency_ms)


# ---------- Sessions ----------

class NewSession(BaseModel):
    country: str = "US"


class SafetyAnswer(BaseModel):
    answer: str
    alternatives: list[Annotated[str, StringConstraints(max_length=300)]] = Field(default_factory=list, max_length=8)  # the recognizer's other guesses


class AskIn(BaseModel):
    question: Annotated[str, StringConstraints(min_length=1, max_length=assistant.MAX_QUESTION_CHARS)]


class CoachIn(BaseModel):
    text: Annotated[str, StringConstraints(max_length=coach_module.MAX_TEXT_CHARS * 2)]
    elapsed_s: int = Field(default=0, ge=0, le=7200)  # seconds since the user switched coaching on


class Skip(BaseModel):
    reason: str = ""


class InfoIn(BaseModel):
    field: str
    value: str


class ConfirmIn(BaseModel):
    field: str


class GoTo(BaseModel):
    target: str  # photos | info | summary | hub


class GuideIn(BaseModel):
    action: str  # next | back | skip


class StateIn(BaseModel):
    state: str  # FL | NY | OTHER | UNSURE
    via: str = "manual"  # manual | location


def _call(fn, *args):
    """Turn state machine errors into HTTP errors."""
    try:
        return fn(*args)
    except sm.StateError as e:
        raise HTTPException(409, str(e)) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@app.post("/api/sessions")
async def create_session(request: Request, body: NewSession = NewSession()) -> dict:
    ratelimit.enforce(request, "session")
    s = _call(sm.new_session, body.country)
    while len(SESSIONS) >= MAX_SESSIONS:
        SESSIONS.pop(next(iter(SESSIONS)))  # dicts keep insertion order, so the first item is the oldest
    SESSIONS[s.id] = s
    return _view(s)


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str) -> dict:
    return _view(_get(session_id))


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str) -> dict:
    """Clear everything the server holds for one accident (answers, photo analyses, details). Photos themselves are never kept."""
    _get(session_id)  # 404 when it is already gone
    SESSIONS.pop(session_id, None)
    return {"ok": True}


@app.post("/api/sessions/{session_id}/consent")
async def consent(session_id: str) -> dict:
    s = _get(session_id)
    _call(sm.accept_consent, s)
    return _view(s)


@app.post("/api/sessions/{session_id}/safety-answer")
async def safety_answer(session_id: str, body: SafetyAnswer) -> dict:
    s = _get(session_id)
    understood = _call(sm.answer_safety, s, body.answer, body.alternatives)
    return _view(s, understood=understood)


@app.post("/api/sessions/{session_id}/ask")
async def ask_question(session_id: str, request: Request, body: AskIn) -> dict:
    s = _get(session_id)
    if s.stage is sm.Stage.CONSENT:
        raise HTTPException(409, "Please agree to start first.")
    if s.questions_asked >= assistant.MAX_QUESTIONS_PER_SESSION:
        raise HTTPException(429, "That is the most questions for one accident. Please ask the police or your insurance company.")
    if not danger_signals(body.question):  # a danger question gets the fixed 911 text and never reaches the model, so it is never limited
        ratelimit.enforce(request, "ask")
    s.questions_asked += 1
    result = await assistant.ask(s, body.question)
    return {
        "answer": result.answer, "kind": result.kind, "sources": result.sources, "tools_used": result.tools_used,
        "call_buttons": [b.model_dump() for b in result.call_buttons], "note": result.note,
        "remaining": assistant.MAX_QUESTIONS_PER_SESSION - s.questions_asked,
    }


@app.post("/api/sessions/{session_id}/coach")
async def coach_endpoint(session_id: str, request: Request, body: CoachIn) -> dict:
    """Live coaching (Korea edition): read the last sentences of the talk and say which fixed reminder fits. The text is
    used for this one request and never stored or logged."""
    s = _get(session_id)
    if not kr.is_kr(s.country):
        raise HTTPException(404, "Live coaching is only in the Korea edition.")
    if s.stage is sm.Stage.CONSENT:
        raise HTTPException(409, "Please agree to start first.")
    if s.coach_calls >= coach_module.MAX_CALLS_PER_SESSION:
        raise HTTPException(429, "That is the most coaching requests for one accident.")
    if len(" ".join(body.text.split())) >= coach_module.MIN_TEXT_CHARS:
        ratelimit.enforce(request, "coach")  # only calls that reach the model count
    s.coach_calls += 1
    result = await coach_module.coach(s, body.text, body.elapsed_s)
    return {"ok": result.ok, "hints": result.hints, "suggested": result.suggested}


@app.post("/api/sessions/{session_id}/ack-emergency")
async def ack_emergency(session_id: str) -> dict:
    s = _get(session_id)
    _call(sm.acknowledge_emergency, s)
    return _view(s)


@app.get("/api/states")
async def list_states(country: str = "US") -> dict:
    data = states.load()
    disclaimer = data.disclaimer_kr if kr.is_kr(country) else data.disclaimer
    return {"states": states.supported(country), "disclaimer": disclaimer, "retrieved": data.retrieved, "reviewed": data.reviewed}


@app.get("/api/insurers")
async def list_insurers(country: str = "US") -> dict:
    if not kr.is_kr(country):
        return {"insurers": []}
    return {"insurers": list(kr.INSURERS), "verified": kr.INSURERS_VERIFIED, "note": kr.INSURER_NOTE}


@app.get("/api/watch-rules")
async def watch_rules(country: str = "US") -> dict:
    return watch_hints.public_rules(country)


@app.post("/api/sessions/{session_id}/state")
async def set_state(session_id: str, body: StateIn) -> dict:
    s = _get(session_id)
    _call(sm.set_accident_state, s, body.state, body.via)
    return _view(s)


@app.post("/api/sessions/{session_id}/guide")
async def guide(session_id: str, body: GuideIn) -> dict:
    s = _get(session_id)
    _call(sm.guide, s, body.action)
    return _view(s)


@app.post("/api/sessions/{session_id}/photo")
async def submit_photo(session_id: str, request: Request, file: UploadFile = File(...)) -> dict:
    s = _get(session_id)
    if s.stage is not sm.Stage.PHOTOS:  # check the stage before calling the model
        raise HTTPException(409, f"Photos are not accepted in the current stage ({s.stage.value}).")
    analysis, removed, result = await _analyze(file, request, s.country)
    verdict = _call(sm.submit_photo, s, analysis)
    return _view(
        s,
        verdict={"accepted": verdict.accepted, "reason": verdict.reason.value, "message": verdict.message},
        analysis=analysis.model_dump(mode="json"),
        removed_by_guard=removed,
        latency_ms=result.latency_ms,
    )


@app.post("/api/sessions/{session_id}/skip")
async def skip(session_id: str, body: Skip) -> dict:
    s = _get(session_id)
    _call(sm.skip_item, s, body.reason)
    return _view(s)


@app.post("/api/sessions/{session_id}/info")
async def set_info(session_id: str, body: InfoIn) -> dict:
    s = _get(session_id)
    _call(sm.set_info, s, body.field, body.value)
    return _view(s)


@app.post("/api/sessions/{session_id}/info/confirm")
async def confirm_info(session_id: str, body: ConfirmIn) -> dict:
    s = _get(session_id)
    _call(sm.confirm_info, s, body.field)
    return _view(s)


class ChoiceIn(BaseModel):
    item: str
    state: str


class FollowupIn(BaseModel):
    text: Annotated[str, StringConstraints(max_length=kr.FOLLOWUP_CHARS * 2)]


@app.post("/api/sessions/{session_id}/hit")
async def set_hit(session_id: str, body: ChoiceIn) -> dict:
    s = _get(session_id)
    _call(sm.set_hit, s, body.item, body.state)
    return _view(s)


@app.post("/api/sessions/{session_id}/coverage")
async def set_coverage(session_id: str, body: ChoiceIn) -> dict:
    s = _get(session_id)
    _call(sm.set_coverage, s, body.item, body.state)
    return _view(s)


class ContactIn(BaseModel):
    state: str | None = None
    number: Annotated[str, StringConstraints(max_length=100)] | None = None
    agent: Annotated[str, StringConstraints(max_length=100)] | None = None


@app.post("/api/sessions/{session_id}/contact")
async def set_contact(session_id: str, body: ContactIn) -> dict:
    s = _get(session_id)
    _call(sm.set_contact, s, body.state, body.number, body.agent)
    return _view(s)


@app.post("/api/sessions/{session_id}/followup")
async def add_followup(session_id: str, body: FollowupIn) -> dict:
    s = _get(session_id)
    _call(sm.add_followup, s, body.text)
    return _view(s)


@app.post("/api/sessions/{session_id}/goto")
async def goto(session_id: str, body: GoTo) -> dict:
    s = _get(session_id)
    _call(sm.go_to, s, body.target)
    return _view(s)


@app.post("/api/sessions/{session_id}/finish")
async def finish(session_id: str) -> dict:
    s = _get(session_id)
    _call(sm.finish, s)
    return _view(s)  # in the summary stage the view includes summary and summary_text
