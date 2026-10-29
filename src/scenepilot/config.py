"""Settings. The key is read only from the environment or from .env in the project root (never written in code or the repository)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv(path: Path) -> None:
    """Minimal loader that reads only KEY=VALUE lines. It does not override variables that are already set."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    api_key: str | None
    base_url: str
    vision_model: str
    max_image_bytes: int
    vision_max_tokens: int
    request_timeout: float
    assistant_model: str
    assistant_max_tokens: int
    cors_origins: tuple[str, ...]
    # Live coaching reads short pieces of the conversation and has to answer within a few seconds. With thinking switched off
    # the Super model answered in about 1.5 s and read 9 of 10 test sentences right; the Nano 30B-A3B model took as long
    # and read 5 of 10 right (Lightning read 3 of 10), so Super is the default. (Our own small test, not a benchmark.)
    coach_model: str = "nvidia/nemotron-3-super-120b-a12b"
    coach_max_tokens: int = 700
    coach_timeout: float = 12.0


def get_settings() -> Settings:
    return Settings(
        api_key=os.environ.get("NEBIUS_API_KEY"),
        base_url=os.environ.get("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1/"),
        vision_model=os.environ.get("SCENEPILOT_VISION_MODEL", "nvidia/Nemotron-3.5-Super-VL"),
        max_image_bytes=int(os.environ.get("SCENEPILOT_MAX_IMAGE_BYTES", 8 * 1024 * 1024)),
        # This model writes reasoning text before its answer, so keep the limit generous (600 produced empty answers).
        vision_max_tokens=int(os.environ.get("SCENEPILOT_VISION_MAX_TOKENS", 3000)),
        request_timeout=float(os.environ.get("SCENEPILOT_TIMEOUT", 60)),
        # The free-question helper uses an NVIDIA Nemotron text model with tool calling (1 s per answer in our test).
        assistant_model=os.environ.get("SCENEPILOT_ASSISTANT_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
        assistant_max_tokens=int(os.environ.get("SCENEPILOT_ASSISTANT_MAX_TOKENS", 1500)),
        # Web origins allowed to call the API from another address. Empty (the default) means same-origin only.
        # The Android app runs from https://localhost, so set SCENEPILOT_CORS_ORIGINS=https://localhost for it.
        cors_origins=tuple(o.strip() for o in os.environ.get("SCENEPILOT_CORS_ORIGINS", "").split(",") if o.strip()),
        coach_model=os.environ.get("SCENEPILOT_COACH_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
        coach_max_tokens=int(os.environ.get("SCENEPILOT_COACH_MAX_TOKENS", 700)),
        coach_timeout=float(os.environ.get("SCENEPILOT_COACH_TIMEOUT", 12)),
    )
