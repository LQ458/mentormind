"""
Small Redis-backed quota helpers for expensive user actions.

The limits are deliberately soft-fail: if Redis is unavailable we allow the
request and let the existing business logic handle it. That keeps a Redis blip
from locking students out of core learning flows.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class QuotaResult:
    allowed: bool
    action: str
    limit: int
    used: int
    remaining: int
    reset_seconds: int
    degraded: bool = False


def consume_quota(
    redis_client: Optional[Any],
    *,
    user_id: str,
    action: str,
    limit: int,
    window_seconds: int,
) -> QuotaResult:
    """Increment and check a fixed-window quota for a user/action pair."""
    if redis_client is None:
        return QuotaResult(True, action, limit, 0, limit, window_seconds, degraded=True)

    key = f"quota:{action}:{user_id}"
    try:
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.ttl(key)
        used, ttl = pipe.execute()
        used = int(used or 0)
        ttl = int(ttl or -1)
        if ttl < 0:
            redis_client.expire(key, window_seconds)
            ttl = window_seconds
        return QuotaResult(
            allowed=used <= limit,
            action=action,
            limit=limit,
            used=used,
            remaining=max(0, limit - used),
            reset_seconds=ttl,
        )
    except Exception:
        return QuotaResult(True, action, limit, 0, limit, window_seconds, degraded=True)
