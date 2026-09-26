"""Redis client + helpers. Every call degrades gracefully: on Redis failure the caller falls
through to PostgreSQL (backend.md §13)."""

from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)

_client: aioredis.Redis | None = None

# Cache keys and TTLs (seconds) from backend.md §13.
WAREHOUSES_KEY = "warehouses:all"
CATEGORIES_KEY = "categories:all"
DASHBOARD_PREFIX = "dashboard:summary"
TTL_WAREHOUSES = 600
TTL_LOCATIONS = 600
TTL_CATEGORIES = 1800
TTL_DASHBOARD = 120


def locations_key(warehouse_id: Any | None) -> str:
    return f"locations:warehouse:{warehouse_id or 'all'}"


def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=1.5,
            socket_timeout=1.5,
            health_check_interval=30,
        )
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:  # pragma: no cover - best effort
            pass
        _client = None


async def ping() -> bool:
    try:
        return bool(await get_redis().ping())
    except (RedisError, OSError):
        return False


class Cache:
    """Small wrapper with try/except around every call. Returns None / False on failure."""

    async def get_json(self, key: str) -> Any | None:
        try:
            raw = await get_redis().get(key)
        except (RedisError, OSError) as exc:
            log.warning("cache.get_failed", key=key, error=str(exc))
            return None
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except ValueError:
            return None

    async def set_json(self, key: str, value: Any, ttl: int) -> None:
        try:
            await get_redis().set(key, json.dumps(value, default=str), ex=ttl)
        except (RedisError, OSError) as exc:
            log.warning("cache.set_failed", key=key, error=str(exc))

    async def delete(self, *keys: str) -> None:
        if not keys:
            return
        try:
            await get_redis().delete(*keys)
        except (RedisError, OSError) as exc:
            log.warning("cache.delete_failed", keys=keys, error=str(exc))

    async def delete_prefix(self, prefix: str) -> None:
        try:
            r = get_redis()
            batch: list[str] = []
            async for key in r.scan_iter(match=f"{prefix}*", count=200):
                batch.append(key)
                if len(batch) >= 200:
                    await r.delete(*batch)
                    batch = []
            if batch:
                await r.delete(*batch)
        except (RedisError, OSError) as exc:
            log.warning("cache.delete_prefix_failed", prefix=prefix, error=str(exc))

    async def incr_window(self, key: str, window_seconds: int) -> int | None:
        """Fixed-window counter. Returns the new count, or None if Redis is unavailable."""
        try:
            r = get_redis()
            count = int(await r.incr(key))
            if count == 1:
                await r.expire(key, window_seconds)
            return count
        except (RedisError, OSError) as exc:
            log.warning("cache.incr_failed", key=key, error=str(exc))
            return None

    async def mark(self, key: str, ttl: int) -> bool:
        try:
            await get_redis().set(key, "1", ex=ttl)
            return True
        except (RedisError, OSError) as exc:
            log.warning("cache.mark_failed", key=key, error=str(exc))
            return False

    async def exists(self, key: str) -> bool | None:
        try:
            return bool(await get_redis().exists(key))
        except (RedisError, OSError) as exc:
            log.warning("cache.exists_failed", key=key, error=str(exc))
            return None


cache = Cache()
