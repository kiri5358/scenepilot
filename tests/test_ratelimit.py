from fastapi.testclient import TestClient

from scenepilot import app as app_module
from scenepilot import assistant, ratelimit
from scenepilot.ratelimit import RateLimiter
from scenepilot.schemas import PhotoAnalysis
from scenepilot.vision import VisionResult

client = TestClient(app_module.app)


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_window_allows_up_to_the_limit_then_blocks():
    clock = Clock()
    rl = RateLimiter(3, window=60, clock=clock)
    assert [rl.check("a") for _ in range(3)] == [None, None, None]
    wait = rl.check("a")
    assert wait is not None and 1 <= wait <= 60
    assert rl.check("b") is None  # another address has its own count


def test_window_frees_up_after_it_passes():
    clock = Clock()
    rl = RateLimiter(2, window=60, clock=clock)
    rl.check("a"), rl.check("a")
    assert rl.check("a") is not None
    clock.now = 61
    assert rl.check("a") is None


def test_blocked_calls_do_not_extend_the_block():
    clock = Clock()
    rl = RateLimiter(1, window=60, clock=clock)
    rl.check("a")
    for t in (10, 20, 30):
        clock.now = t
        assert rl.check("a") is not None
    clock.now = 61
    assert rl.check("a") is None  # hammering while blocked did not push the end of the window back


def test_client_ip_ignores_forwarded_header_by_default(monkeypatch):
    monkeypatch.delenv("SCENEPILOT_PROXY_HOPS", raising=False)
    r = client.get("/health", headers={"X-Forwarded-For": "9.9.9.9"})
    assert r.status_code == 200

    class Req:
        headers = {"x-forwarded-for": "9.9.9.9"}

        class client:
            host = "10.0.0.1"

    assert ratelimit.client_ip(Req) == "10.0.0.1"


def test_client_ip_counts_trusted_hops_from_the_right(monkeypatch):
    class Req:
        headers = {"x-forwarded-for": "6.6.6.6, 1.2.3.4, 10.1.1.1"}  # the first entry is forged by the caller

        class client:
            host = "10.0.0.1"

    monkeypatch.setenv("SCENEPILOT_PROXY_HOPS", "1")
    assert ratelimit.client_ip(Req) == "10.1.1.1"
    monkeypatch.setenv("SCENEPILOT_PROXY_HOPS", "2")
    assert ratelimit.client_ip(Req) == "1.2.3.4"
    monkeypatch.setenv("SCENEPILOT_PROXY_HOPS", "9")  # fewer entries than hops: fall back to the socket address
    assert ratelimit.client_ip(Req) == "10.0.0.1"


def test_forged_header_does_not_get_a_fresh_allowance(monkeypatch):
    monkeypatch.setenv("SCENEPILOT_PROXY_HOPS", "1")
    monkeypatch.setitem(ratelimit.LIMITERS, "session", RateLimiter(2))
    for i in range(2):
        assert client.post("/api/sessions", headers={"X-Forwarded-For": f"7.7.7.{i}, 10.1.1.1"}).status_code == 200
    r = client.post("/api/sessions", headers={"X-Forwarded-For": "7.7.7.99, 10.1.1.1"})
    assert r.status_code == 429


def test_temporary_diagnostic_header_is_stable_per_caller_and_hides_the_address(monkeypatch):
    monkeypatch.setenv("SCENEPILOT_PROXY_HOPS", "1")
    a1 = client.post("/api/sessions", headers={"X-Forwarded-For": "6.6.6.6, 1.2.3.4"})
    a2 = client.post("/api/sessions", headers={"X-Forwarded-For": "5.5.5.5, 1.2.3.4"})  # only the forged part differs
    b = client.post("/api/sessions", headers={"X-Forwarded-For": "6.6.6.6, 1.2.3.5"})
    assert a1.headers["X-RateLimit-Key"] == a2.headers["X-RateLimit-Key"] != b.headers["X-RateLimit-Key"]
    assert a1.headers["X-RateLimit-Xff-Count"] == "2"
    assert "1.2.3.4" not in str(a1.headers)
    assert "X-RateLimit-Key" not in client.get("/health").headers  # only /api responses carry it


def test_sessions_are_limited_with_a_friendly_message(monkeypatch):
    monkeypatch.setitem(ratelimit.LIMITERS, "session", RateLimiter(2))
    assert client.post("/api/sessions").status_code == 200
    assert client.post("/api/sessions").status_code == 200
    r = client.post("/api/sessions")
    assert r.status_code == 429
    assert r.json()["detail"] == ratelimit.MESSAGE
    assert int(r.headers["Retry-After"]) >= 1


def test_switching_the_limit_off(monkeypatch):
    monkeypatch.setenv("SCENEPILOT_RATE_LIMIT", "off")
    monkeypatch.setitem(ratelimit.LIMITERS, "session", RateLimiter(1))
    for _ in range(3):
        assert client.post("/api/sessions").status_code == 200


def _pa():
    return PhotoAnalysis(scene_type="wide_scene", sharpness="clear", plate="not_readable", visible_damage="unclear",
                         vehicle_count=2, observations=["Two vehicles are visible."], unknown=[], retake_hint=None)


def test_photo_limit_counts_only_calls_that_reach_the_model(monkeypatch):
    calls = []

    async def fake_analyze(image, mime, **kw):
        calls.append(1)
        return VisionResult(_pa(), "fake-model", 1)

    monkeypatch.setattr(app_module, "analyze_photo", fake_analyze)
    monkeypatch.setitem(ratelimit.LIMITERS, "photo", RateLimiter(2))
    jpg = {"file": ("a.jpg", b"\xff\xd8fake", "image/jpeg")}

    # Rejected for free (wrong type, wrong stage): these must not use up the allowance.
    for _ in range(5):
        assert client.post("/api/analyze-photo", files={"file": ("a.txt", b"x", "text/plain")}).status_code == 415
    sid = client.post("/api/sessions").json()["session"]["id"]
    for _ in range(5):
        assert client.post(f"/api/sessions/{sid}/photo", files=jpg).status_code == 409

    assert client.post("/api/analyze-photo", files=jpg).status_code == 200
    assert client.post("/api/analyze-photo", files=jpg).status_code == 200
    r = client.post("/api/analyze-photo", files=jpg)
    assert r.status_code == 429 and len(calls) == 2  # the third call never reached the model


def test_ask_limit_never_blocks_a_danger_question(monkeypatch):
    async def fake_ask(s, question, **kw):
        return assistant.AssistantAnswer("ok", "answer")

    monkeypatch.setattr(assistant, "ask", fake_ask)
    monkeypatch.setitem(ratelimit.LIMITERS, "ask", RateLimiter(1))
    sid = client.post("/api/sessions").json()["session"]["id"]
    client.post(f"/api/sessions/{sid}/consent")

    ask = lambda q: client.post(f"/api/sessions/{sid}/ask", json={"question": q})
    assert ask("What should I exchange with the other driver?").status_code == 200
    assert ask("What should I exchange with the other driver?").status_code == 429
    assert ask("I smell gas near my car").status_code == 200  # fixed 911 text path: always available
