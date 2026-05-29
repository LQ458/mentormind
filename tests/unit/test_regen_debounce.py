"""F2/F4 — Redis debounce lock for board segment regeneration (T13).

Uses a fake in-memory Redis so the test runs without a real Redis server.
"""

from core.board.regen_lock import (  # type: ignore
    LockHandle,
    acquire_regen_lock,
    lock_key_for,
    release_regen_lock,
)


class FakeRedis:
    """Minimal Redis surface supporting SET NX EX, GET, DELETE."""

    def __init__(self) -> None:
        self.store: dict = {}

    def set(self, name, value, nx=False, ex=None):
        if nx and name in self.store:
            return False
        self.store[name] = value
        return True

    def get(self, name):
        return self.store.get(name)

    def delete(self, name):
        return self.store.pop(name, None) is not None


def test_first_acquire_succeeds():
    r = FakeRedis()
    h = acquire_regen_lock("session-a", r)
    assert h.acquired is True
    assert h.owner_token  # non-empty UUID hex
    assert lock_key_for("session-a") in r.store


def test_second_acquire_while_held_is_debounced():
    r = FakeRedis()
    first = acquire_regen_lock("session-a", r)
    second = acquire_regen_lock("session-a", r)
    assert first.acquired is True
    assert second.acquired is False
    assert first.owner_token != second.owner_token


def test_release_after_acquire_clears_lock():
    r = FakeRedis()
    h = acquire_regen_lock("session-a", r)
    released = release_regen_lock(h, r)
    assert released is True
    assert lock_key_for("session-a") not in r.store


def test_release_of_non_owning_handle_noops():
    r = FakeRedis()
    real = acquire_regen_lock("session-a", r)
    stale = LockHandle(session_id="session-a", owner_token="imposter", acquired=True)
    released = release_regen_lock(stale, r)
    # Imposter must NOT delete the real owner's lock.
    assert released is False
    assert lock_key_for("session-a") in r.store
    # Real owner can still release.
    assert release_regen_lock(real, r) is True


def test_release_of_unacquired_handle_noops():
    r = FakeRedis()
    other = acquire_regen_lock("session-a", r)  # someone else holds it
    failed = acquire_regen_lock("session-a", r)  # we lost the race
    assert failed.acquired is False
    assert release_regen_lock(failed, r) is False
    # Real holder's key is still there.
    assert lock_key_for("session-a") in r.store
    # Owner can still release.
    assert release_regen_lock(other, r) is True


def test_different_sessions_dont_block_each_other():
    r = FakeRedis()
    a = acquire_regen_lock("session-a", r)
    b = acquire_regen_lock("session-b", r)
    assert a.acquired is True
    assert b.acquired is True


def test_bytes_returned_by_redis_are_decoded():
    """Real Redis may return bytes if decode_responses=False. Release path
    handles both str and bytes.
    """
    r = FakeRedis()
    h = acquire_regen_lock("session-a", r)
    # Replace the stored token with a bytes version to mimic decode_responses=False
    r.store[lock_key_for("session-a")] = h.owner_token.encode()
    assert release_regen_lock(h, r) is True
