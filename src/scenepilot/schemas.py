"""Photo analysis schema. Model output is always validated against this schema before use."""
from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class SceneType(StrEnum):
    WIDE_SCENE = "wide_scene"        # wide shot of the scene (road, vehicle positions)
    VEHICLE_FULL = "vehicle_full"    # whole vehicle
    LICENSE_PLATE = "license_plate"  # license plate
    DAMAGE_CLOSEUP = "damage_closeup"
    ROAD_CONDITION = "road_condition"
    DOCUMENT = "document"
    OTHER = "other"


class Sharpness(StrEnum):
    CLEAR = "clear"
    BLURRY = "blurry"
    DARK = "dark"
    UNCLEAR = "unclear"


class PlateReadable(StrEnum):
    READABLE = "readable"
    NOT_READABLE = "not_readable"  # visible but the characters cannot be read
    NOT_VISIBLE = "not_visible"    # no license plate in the photo


class VisibleDamage(StrEnum):
    NONE = "none"
    MINOR = "minor"
    MAJOR = "major"
    UNCLEAR = "unclear"


class PhotoAnalysis(BaseModel):
    """Structured output of the vision model. There are deliberately no fields for money, fault, or legal responsibility."""

    scene_type: SceneType
    sharpness: Sharpness
    plate: PlateReadable
    visible_damage: VisibleDamage
    vehicle_count: int | None = Field(default=None, ge=0, le=20)
    observations: list[str] = Field(default_factory=list, max_length=10)  # what is visible in the photo
    unknown: list[str] = Field(default_factory=list, max_length=10)       # what cannot be known because it is not visible
    retake_hint: str | None = None  # one sentence to tell the user when the photo must be retaken (null if not needed)


class AnalyzeResponse(BaseModel):
    analysis: PhotoAnalysis
    source: str = "ai_observation"  # source tag: unverified AI observation
    notice: str = "AI observation, not verified. This is not a judgment of fault or repair cost."
    model: str
    latency_ms: int
