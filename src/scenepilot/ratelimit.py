"""Per-IP rate limits for the calls that cost model credits (photo analysis, free questions, new sessions).

The limits are generous on purpose: a person going through the app several times must never hit them. They only stop
one address from hammering the paid model. Counters live in memory (one instance, like the sessions) and reset on restart.
"""
from __future__ import annotations

import os
import time
from collections import deque
from collections.abc import Callable

from fastapi import HTTPException, Request

WINDOW_SECONDS = 600
DEFAULT_LIMITS = {"photo": 25, "ask": 20, "session": 30}  # calls per window per address
MESSAGE = "Too many requests from your network. Please wait a few minutes and try again."


class RateLimiter:
    """Sliding window: at most `limit` calls per `window` seconds for each key."""

    def __init__(self, limit: int, window: float = WINDOW_SECONDS, clock: Callable[[], float] = time.monotonic) -> None:
        self.limit = limit
        self.window = window
        self.clock = clock
        self._hits: dict[str, deque[float]] = {}

    def check(self, key: str) -> float | None:
        """Record a call. Returns None when allowed, or the seconds to wait when the key is over its limit."""
        now = self.clock()
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] >= self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return max(1.0, self.window - (now - hits[0]))
        hits.append(now)
        if len(self._hits) > 5000:  # keep memory bounded: forget addresses that have gone quiet
            for k in [k for k, v in self._hits.items() if not v or now - v[-1] >= self.window]:
                del self._hits[k]
        return None

    def reset(self) -> None:
        self._hits.clear()


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def enabled() -> bool:
    return os.environ.get("SCENEPILOT_RATE_LIMIT", "on").strip().lower() not in ("off", "0", "false", "no")


LIMITERS = {
    name: RateLimiter(_env_int(f"SCENEPILOT_RATE_{name.upper()}S", limit), _env_int("SCENEPILOT_RATE_WINDOW", WINDOW_SECONDS))
    for name, limit in DEFAULT_LIMITS.items()
}


def reset_all() -> None:
    for limiter in LIMITERS.values():
        limiter.reset()


def client_ip(request: Request) -> str:
    """The caller's address. Behind a proxy it is read from X-Forwarded-For, counting `hops` trusted proxies from the right
    (the left side can be forged by the caller). With SCENEPILOT_PROXY_HOPS unset or 0 the header is ignored."""
    hops = _env_int("SCENEPILOT_PROXY_HOPS", 0)
    if hops > 0:
        parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    return request.client.host if request.client else "unknown"


def enforce(request: Request, name: str) -> None:
    """Count one call against the named limit for the caller's address; raises 429 when it is over.

    Call it right before the paid work, after the cheap checks (wrong stage, bad input) that reject a request for free."""
    if not enabled():
        return
    wait = LIMITERS[name].check(client_ip(request))
    if wait is not None:
        raise HTTPException(429, MESSAGE, headers={"Retry-After": str(int(wait) + 1)})
