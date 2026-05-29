"""F2/F4 — Redis debounce lock for board segment regeneration (T13).

Owner-token pattern so a requeued task cannot release a lock held by a fresh
concurrent call. TTL (15s) is the crash-safety fallback; the explicit
release in `finally` is the primary mechanism.

Extracted to its own module so the logic can be unit-tested with a mock
redis client without pulling in celery (which isn't a test-env dependency).
"""

from dataclasses import dataclass
from typing import Optional, Protocol
import uuid

LOCK_TTL_SECONDS = 15


class RedisLike(Protocol):
    def set(self, name, value, nx=False, ex=None): ...
    def get(self, name): ...
    def delete(self, name): ...


@dataclass(frozen=True)
class LockHandle:
    session_id: str
    owner_token: str
    acquired: bool


def lock_key_for(session_id: str) -> str:
    return f"regen:{session_id}"


def acquire_regen_lock(
    session_id: str,
    redis_client: RedisLike,
    ttl_seconds: int = LOCK_TTL_SECONDS,
) -> LockHandle:
    """Attempt to acquire the session's regen lock. Returns a handle whose
    `acquired` is True only if the caller now owns the lock.
    """
    token = uuid.uuid4().hex
    acquired = bool(redis_client.set(lock_key_for(session_id), token, nx=True, ex=ttl_seconds))
    return LockHandle(session_id=session_id, owner_token=token, acquired=acquired)


def release_regen_lock(handle: LockHandle, redis_client: RedisLike) -> bool:
    """Release the lock only if we still own it. Returns True on release."""
    if not handle.acquired:
        return False
    key = lock_key_for(handle.session_id)
    current = redis_client.get(key)
    # Redis may return bytes or str depending on decode_responses.
    if isinstance(current, bytes):
        current = current.decode()
    if current == handle.owner_token:
        redis_client.delete(key)
        return True
    return False
