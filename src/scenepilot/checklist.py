"""Evidence photo checklist and photo verdicts. Code decides pass/fail; the model only supplies photo observations (PhotoAnalysis)."""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from .guard import guard_or_fallback
from .schemas import PhotoAnalysis, PlateReadable, SceneType, Sharpness, VisibleDamage


class ItemStatus(StrEnum):
    PENDING = "pending"
    CAPTURED = "captured"
    NEEDS_RETAKE = "needs_retake"
    SKIPPED = "skipped"


class Reason(StrEnum):
    OK = "ok"
    NOT_CLEAR = "not_clear"
    WRONG_SCENE = "wrong_scene"
    TOO_FEW_VEHICLES = "too_few_vehicles"
    PLATE_UNREADABLE = "plate_unreadable"
    DAMAGE_NOT_VISIBLE = "damage_not_visible"


@dataclass(frozen=True)
class ChecklistItem:
    id: str
    title: str
    instruction: str  # fixed text read to the user
    scenes: frozenset[SceneType]
    needs_two_vehicles: bool = False
    needs_plate: bool = False
    needs_damage: bool = False  # the photo must show damage (minor or major)
    core: bool = False  # essential photos to take at the scene; the rest can wait until it is safe


# Order is shooting order: the 3 core photos (wide scene, other vehicle + plate, damage) first, then the extras.
ITEMS: tuple[ChecklistItem, ...] = (
    ChecklistItem(
        "scene_wide", "Wide shot of the scene",
        "Take a photo that shows both vehicles and the road. If it is safe, step back until everything fits.",
        # The model often calls a fairly close shot of two touching cars "vehicle_full" (user test, 2026-10-23: the same
        # photo was labeled wide_scene 3 times and vehicle_full once), so both are accepted; two vehicles are still required.
        frozenset({SceneType.WIDE_SCENE, SceneType.VEHICLE_FULL}), needs_two_vehicles=True, core=True,
    ),
    ChecklistItem(
        "other_vehicle", "Other vehicle and license plate",
        "Take a photo of the other vehicle, close enough that the license plate is readable.",
        frozenset({SceneType.VEHICLE_FULL, SceneType.WIDE_SCENE, SceneType.LICENSE_PLATE, SceneType.DAMAGE_CLOSEUP}),
        needs_plate=True, core=True,  # a damage close-up that shows the plate is fine
    ),
    ChecklistItem(
        "damage", "Damage",
        "Take a close, clear photo of the damaged area.",
        # In real tests the model sometimes labels a close-up of damage as "vehicle_full"
        # (eval/photos/damage_tree.jpg), so we accept both scene types and judge by whether damage is visible.
        frozenset({SceneType.DAMAGE_CLOSEUP, SceneType.VEHICLE_FULL, SceneType.WIDE_SCENE}), needs_damage=True, core=True,
    ),
    ChecklistItem(
        "own_vehicle", "Your vehicle",
        "Take a photo that shows your whole vehicle.",
        frozenset({SceneType.VEHICLE_FULL, SceneType.WIDE_SCENE}),
    ),
    ChecklistItem(
        "road", "Road conditions",
        "Take a photo of the road surface, the lane markings, and any signs or signals.",
        frozenset({SceneType.ROAD_CONDITION, SceneType.WIDE_SCENE}),
    ),
    ChecklistItem(
        "documents", "Other driver's documents (optional)",
        "If the other driver agrees, photograph their insurance card so the text is readable. You can skip this if they say no.",
        frozenset({SceneType.DOCUMENT}),
    ),
)
ITEM_BY_ID = {i.id: i for i in ITEMS}

_DEFAULT_MESSAGES = {
    Reason.NOT_CLEAR: "The photo is blurry or too dark. Hold still, tap to focus, and try again.",
    Reason.WRONG_SCENE: "That is not the shot I need for this step. Please follow the instruction and try again.",
    Reason.TOO_FEW_VEHICLES: "I can't see both vehicles. Step back so the road and both vehicles fit in the photo, then try again.",
    Reason.PLATE_UNREADABLE: "I can't read the license plate. Move closer so the plate fills more of the photo, then try again.",
    Reason.DAMAGE_NOT_VISIBLE: "I can't see the damage clearly. Move closer to the damaged area and take the photo again.",
}


@dataclass(frozen=True)
class PhotoVerdict:
    accepted: bool
    reason: Reason
    message: str | None  # text to show the user when the photo must be retaken


def evaluate_photo(item: ChecklistItem, analysis: PhotoAnalysis) -> PhotoVerdict:
    """Does the photo satisfy this checklist item? Check order: sharpness, scene, then item-specific conditions."""

    def reject(reason: Reason) -> PhotoVerdict:
        default = _DEFAULT_MESSAGES[reason]
        # Only for blur do we use the model's retake hint; if it contains a forbidden expression we fall back to fixed text.
        if reason is Reason.NOT_CLEAR:
            return PhotoVerdict(False, reason, guard_or_fallback(analysis.retake_hint, default) or default)
        return PhotoVerdict(False, reason, default)

    if analysis.sharpness is not Sharpness.CLEAR:
        return reject(Reason.NOT_CLEAR)
    if analysis.scene_type not in item.scenes:
        return reject(Reason.WRONG_SCENE)
    if item.needs_two_vehicles and (analysis.vehicle_count is None or analysis.vehicle_count < 2):
        return reject(Reason.TOO_FEW_VEHICLES)
    if item.needs_plate and analysis.plate is not PlateReadable.READABLE:
        return reject(Reason.PLATE_UNREADABLE)
    if item.needs_damage and analysis.visible_damage not in (VisibleDamage.MINOR, VisibleDamage.MAJOR):
        return reject(Reason.DAMAGE_NOT_VISIBLE)
    return PhotoVerdict(True, Reason.OK, None)
