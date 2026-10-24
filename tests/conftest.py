import pytest

from scenepilot import ratelimit


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    """Every test starts with empty rate-limit counters, so the many calls across the suite never add up."""
    ratelimit.reset_all()
    yield
    ratelimit.reset_all()
