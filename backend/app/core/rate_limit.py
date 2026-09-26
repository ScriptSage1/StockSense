"""slowapi limiter backed by Redis (falls back to in-memory counters if Redis is unavailable)."""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.REDIS_URL,
    in_memory_fallback_enabled=True,
    swallow_errors=True,
    headers_enabled=False,
    strategy="fixed-window",
)

LOGIN_LIMIT = f"{settings.LOGIN_RATE_PER_15_MIN}/15 minutes"
