"""
Unit Tests – Circuit Breaker
==============================

Tests cover:
  • CircuitBreakerConfig defaults
  • CircuitBreaker initial state
  • Successful calls: state stays CLOSED, metrics updated
  • Failures accumulate; failure_threshold opens the circuit
  • OPEN circuit raises CircuitBreakerException without calling the function
  • Timeout expiry transitions OPEN → HALF_OPEN
  • HALF_OPEN: success_threshold successes close the circuit
  • HALF_OPEN: a single failure reopens the circuit
  • Rolling window failure rate calculation
  • get_metrics returns the correct dict
  • reset() restores initial state
  • CircuitBreakerManager: get_circuit_breaker create/return semantics
  • CircuitBreakerManager: get_all_metrics, reset_all, get_health_summary
  • with_circuit_breaker decorator wraps an async function
"""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, patch

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# CircuitBreakerConfig defaults
# ─────────────────────────────────────────────────────────────────────────────

class TestCircuitBreakerConfig:

    def test_default_failure_threshold(self):
        from services.circuit_breaker import CircuitBreakerConfig
        cfg = CircuitBreakerConfig()
        assert cfg.failure_threshold == 5

    def test_default_success_threshold(self):
        from services.circuit_breaker import CircuitBreakerConfig
        cfg = CircuitBreakerConfig()
        assert cfg.success_threshold == 2

    def test_default_timeout_duration(self):
        from services.circuit_breaker import CircuitBreakerConfig
        cfg = CircuitBreakerConfig()
        assert cfg.timeout_duration == 60

    def test_default_failure_rate_threshold(self):
        from services.circuit_breaker import CircuitBreakerConfig
        cfg = CircuitBreakerConfig()
        assert cfg.failure_rate_threshold == 0.5

    def test_default_min_request_threshold(self):
        from services.circuit_breaker import CircuitBreakerConfig
        cfg = CircuitBreakerConfig()
        assert cfg.min_request_threshold == 10

    def test_custom_values_are_stored(self):
        from services.circuit_breaker import CircuitBreakerConfig
        cfg = CircuitBreakerConfig(
            failure_threshold=3,
            success_threshold=1,
            timeout_duration=30,
            failure_rate_threshold=0.8,
            min_request_threshold=5,
        )
        assert cfg.failure_threshold == 3
        assert cfg.success_threshold == 1
        assert cfg.timeout_duration == 30
        assert cfg.failure_rate_threshold == 0.8
        assert cfg.min_request_threshold == 5


# ─────────────────────────────────────────────────────────────────────────────
# CircuitBreaker – initial state
# ─────────────────────────────────────────────────────────────────────────────

class TestCircuitBreakerInitialState:

    def _make_cb(self, **cfg_kwargs):
        from services.circuit_breaker import CircuitBreaker, CircuitBreakerConfig
        cfg = CircuitBreakerConfig(**cfg_kwargs) if cfg_kwargs else None
        return CircuitBreaker("test", cfg)

    def test_initial_state_is_closed(self):
        from services.circuit_breaker import CircuitState
        cb = self._make_cb()
        assert cb.state == CircuitState.CLOSED

    def test_initial_failure_count_is_zero(self):
        cb = self._make_cb()
        assert cb.failure_count == 0

    def test_initial_success_count_is_zero(self):
        cb = self._make_cb()
        assert cb.success_count == 0

    def test_initial_total_requests_is_zero(self):
        cb = self._make_cb()
        assert cb.total_requests == 0

    def test_initial_last_failure_time_is_none(self):
        cb = self._make_cb()
        assert cb.last_failure_time is None

    def test_initial_recent_results_is_empty(self):
        cb = self._make_cb()
        assert cb.recent_results == []

    def test_default_config_applied_when_none_passed(self):
        from services.circuit_breaker import CircuitBreaker, CircuitBreakerConfig
        cb = CircuitBreaker("no-cfg")
        assert isinstance(cb.config, CircuitBreakerConfig)
        assert cb.config.failure_threshold == 5


# ─────────────────────────────────────────────────────────────────────────────
# CircuitBreaker – successful calls
# ─────────────────────────────────────────────────────────────────────────────

class TestCircuitBreakerSuccessfulCalls:

    def _make_cb(self):
        from services.circuit_breaker import CircuitBreaker
        return CircuitBreaker("test")

    @pytest.mark.asyncio
    async def test_successful_call_returns_value(self):
        cb = self._make_cb()
        func = AsyncMock(return_value=42)
        result = await cb.call(func)
        assert result == 42

    @pytest.mark.asyncio
    async def test_successful_calls_keep_state_closed(self):
        from services.circuit_breaker import CircuitState
        cb = self._make_cb()
        func = AsyncMock(return_value="ok")
        for _ in range(10):
            await cb.call(func)
        assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_successful_call_increments_total_requests(self):
        cb = self._make_cb()
        func = AsyncMock(return_value="ok")
        await cb.call(func)
        assert cb.total_requests == 1

    @pytest.mark.asyncio
    async def test_multiple_successful_calls_accumulate_total_requests(self):
        cb = self._make_cb()
        func = AsyncMock(return_value="ok")
        for _ in range(5):
            await cb.call(func)
        assert cb.total_requests == 5

    @pytest.mark.asyncio
    async def test_successful_call_resets_failure_count(self):
        cb = self._make_cb()
        # Manually set a failure count below threshold
        cb.failure_count = 3
        func = AsyncMock(return_value="ok")
        await cb.call(func)
        assert cb.failure_count == 0

    @pytest.mark.asyncio
    async def test_successful_call_adds_to_rolling_window(self):
        cb = self._make_cb()
        func = AsyncMock(return_value="ok")
        await cb.call(func)
        assert len(cb.recent_results) == 1
        _, success = cb.recent_results[0]
        assert success is True


# ─────────────────────────────────────────────────────────────────────────────
# CircuitBreaker – failures and opening
# ─────────────────────────────────────────────────────────────────────────────

class TestCircuitBreakerFailures:

    def _make_cb(self, **cfg_kwargs):
        from services.circuit_breaker import CircuitBreaker, CircuitBreakerConfig
        cfg = CircuitBreakerConfig(**cfg_kwargs)
        return CircuitBreaker("test", cfg)

    @pytest.mark.asyncio
    async def test_failed_call_reraises_exception(self):
        cb = self._make_cb()
        func = AsyncMock(side_effect=ValueError("boom"))
        with pytest.raises(ValueError, match="boom"):
            await cb.call(func)

    @pytest.mark.asyncio
    async def test_failed_call_increments_failure_count(self):
        cb = self._make_cb()
        func = AsyncMock(side_effect=RuntimeError("err"))
        with pytest.raises(RuntimeError):
            await cb.call(func)
        assert cb.failure_count == 1

    @pytest.mark.asyncio
    async def test_failed_call_increments_total_requests(self):
        cb = self._make_cb()
        func = AsyncMock(side_effect=RuntimeError("err"))
        with pytest.raises(RuntimeError):
            await cb.call(func)
        assert cb.total_requests == 1

    @pytest.mark.asyncio
    async def test_failed_call_records_last_failure_time(self):
        cb = self._make_cb()
        func = AsyncMock(side_effect=RuntimeError("err"))
        before = time.time()
        with pytest.raises(RuntimeError):
            await cb.call(func)
        after = time.time()
        assert cb.last_failure_time is not None
        assert before <= cb.last_failure_time <= after

    @pytest.mark.asyncio
    async def test_failed_call_adds_to_rolling_window(self):
        cb = self._make_cb()
        func = AsyncMock(side_effect=RuntimeError("err"))
        with pytest.raises(RuntimeError):
            await cb.call(func)
        assert len(cb.recent_results) == 1
        _, success = cb.recent_results[0]
        assert success is False

    @pytest.mark.asyncio
    async def test_reaching_failure_threshold_opens_circuit(self):
        from services.circuit_breaker import CircuitState
        cb = self._make_cb(failure_threshold=3)
        func = AsyncMock(side_effect=RuntimeError("err"))
        for _ in range(3):
            with pytest.raises(RuntimeError):
                await cb.call(func)
        assert cb.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_below_failure_threshold_stays_closed(self):
        from services.circuit_breaker import CircuitState
        cb = self._make_cb(failure_threshold=5)
        func = AsyncMock(side_effect=RuntimeError("err"))
        for _ in range(4):
            with pytest.raises(RuntimeError):
                await cb.call(func)
        assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_failure_resets_success_count(self):
        cb = self._make_cb()
        cb.success_count = 10
        func = AsyncMock(side_effect=RuntimeError("err"))
        with pytest.raises(RuntimeError):
            await cb.call(func)
        assert cb.success_count == 0


# ─────────────────────────────────────────────────────────────────────────────
# CircuitBreaker – OPEN state behaviour
# ─────────────────────────────────────────────────────────────────────────────

class TestCircuitBreakerOpenState:

    def _make_open_cb(self, timeout_duration: int = 60):
        from services.circuit_breaker import (
            CircuitBreaker, CircuitBreakerConfig, CircuitState
        )
        cfg = CircuitBreakerConfig(failure_threshold=1, timeout_duration=timeout_duration)
        cb = CircuitBreaker("test", cfg)
        cb.state = CircuitState.OPEN
        cb.last_failure_time = time.time()
        return cb

    @pytest.mark.asyncio
    async def test_open_circuit_raises_circuit_breaker_exception(self):
        from services.circuit_breaker import CircuitBreakerException
        cb = self._make_open_cb()
        func = AsyncMock(return_value="ok")
        with pytest.raises(CircuitBreakerException):
            await cb.call(func)

    @pytest.mark.asyncio
    async def test_open_circuit_does_not_invoke_underlying_function(self):
        from services.circuit_breaker import CircuitBreakerException
        cb = self._make_open_cb()
        func = AsyncMock(return_value="ok")
        with pytest.raises(CircuitBreakerException):
            await cb.call(func)
        func.assert_not_called()

    @pytest.mark.asyncio
    async def test_circuit_breaker_exception_message_contains_name(self):
        from services.circuit_breaker import CircuitBreakerException
        cb = self._make_open_cb()
        func = AsyncMock(return_value="ok")
        with pytest.raises(CircuitBreakerException, match="test"):
            await cb.call(func)


# ─────────────────────────────────────────────────────────────────────────────
# CircuitBreaker – OPEN → HALF_OPEN transition (timeout)
# ─────────────────────────────────────────────────────────────────────────────

class TestCircuitBreakerTimeout:

    def _make_open_cb(self, timeout_duration: int = 60):
        from services.circuit_breaker import (
            CircuitBreaker, CircuitBreakerConfig, CircuitState
        )
        cfg = CircuitBreakerConfig(failure_threshold=1, timeout_duration=timeout_duration)
        cb = CircuitBreaker("test", cfg)
        cb.state = CircuitState.OPEN
        cb.last_failure_time = 1000.0  # fixed reference time
        return cb

    @pytest.mark.asyncio
    async def test_before_timeout_stays_open(self):
        from services.circuit_breaker import CircuitBreakerException, CircuitState
        cb = self._make_open_cb(timeout_duration=60)
        func = AsyncMock(return_value="ok")
        # Current time is only 30s after last failure – still within timeout
        with patch("services.circuit_breaker.time.time", return_value=1030.0):
            with pytest.raises(CircuitBreakerException):
                await cb.call(func)
        assert cb.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_after_timeout_transitions_to_half_open_and_calls_function(self):
        from services.circuit_breaker import CircuitState
        cb = self._make_open_cb(timeout_duration=60)
        func = AsyncMock(return_value="recovered")
        # Current time is 61s after last failure – timeout elapsed
        with patch("services.circuit_breaker.time.time", return_value=1061.0):
            result = await cb.call(func)
        assert result == "recovered"
        func.assert_called_once()

    @pytest.mark.asyncio
    async def test_after_timeout_state_is_not_open_after_success(self):
        from services.circuit_breaker import CircuitState
        cb = self._make_open_cb(timeout_duration=60)
        # Use success_threshold=1 so one success closes it
        from services.circuit_breaker import CircuitBreakerConfig
        cb.config = CircuitBreakerConfig(failure_threshold=1, timeout_duration=60, success_threshold=1)
        func = AsyncMock(return_value="ok")
        with patch("services.circuit_breaker.time.time", return_value=1061.0):
            await cb.call(func)
        assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_exact_timeout_boundary_transitions_to_half_open(self):
        from services.circuit_breaker import CircuitState
        cb = self._make_open_cb(timeout_duration=60)
        # At exactly timeout_duration seconds the condition is >= so it should reset
        func = AsyncMock(return_value="ok")
        with patch("services.circuit_breaker.time.time", return_value=1060.0):
            await cb.call(func)
        # Default success_threshold=2, one success → still HALF_OPEN
        assert cb.state == CircuitState.HALF_OPEN


# ─────────────────────────────────────────────────────────────────────────────
# CircuitBreaker – HALF_OPEN state
# ─────────────────────────────────────────────────────────────────────────────

class TestCircuitBreakerHalfOpen:

    def _make_half_open_cb(self, success_threshold: int = 2, failure_threshold: int = 1):
        from services.circuit_breaker import (
            CircuitBreaker, CircuitBreakerConfig, CircuitState
        )
        cfg = CircuitBreakerConfig(
            failure_threshold=failure_threshold,
            success_threshold=success_threshold,
            timeout_duration=60,
        )
        cb = CircuitBreaker("test", cfg)
        cb.state = CircuitState.HALF_OPEN
        cb.last_failure_time = time.time() - 120  # well past timeout
        return cb

    @pytest.mark.asyncio
    async def test_success_threshold_successes_close_circuit(self):
        from services.circuit_breaker import CircuitState
        cb = self._make_half_open_cb(success_threshold=2)
        func = AsyncMock(return_value="ok")
        await cb.call(func)
        assert cb.state == CircuitState.HALF_OPEN  # not closed yet after 1
        await cb.call(func)
        assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_single_success_below_threshold_stays_half_open(self):
        from services.circuit_breaker import CircuitState
        cb = self._make_half_open_cb(success_threshold=3)
        func = AsyncMock(return_value="ok")
        await cb.call(func)
        assert cb.state == CircuitState.HALF_OPEN

    @pytest.mark.asyncio
    async def test_failure_in_half_open_reopens_circuit(self):
        from services.circuit_breaker import CircuitState
        cb = self._make_half_open_cb(success_threshold=2)
        func = AsyncMock(side_effect=RuntimeError("still broken"))
        with pytest.raises(RuntimeError):
            await cb.call(func)
        assert cb.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_closed_circuit_resets_failure_and_success_counts(self):
        cb = self._make_half_open_cb(success_threshold=1)
        func = AsyncMock(return_value="ok")
        await cb.call(func)
        assert cb.failure_count == 0
        assert cb.success_count == 0

    @pytest.mark.asyncio
    async def test_half_open_success_increments_success_count(self):
        from services.circuit_breaker import CircuitState
        cb = self._make_half_open_cb(success_threshold=3)
        func = AsyncMock(return_value="ok")
        await cb.call(func)
        # success_count is incremented before checking threshold
        assert cb.success_count >= 1


# ─────────────────────────────────────────────────────────────────────────────
# CircuitBreaker – rolling window failure rate
# ─────────────────────────────────────────────────────────────────────────────

class TestRollingWindowFailureRate:

    def _make_cb(self, **cfg_kwargs):
        from services.circuit_breaker import CircuitBreaker, CircuitBreakerConfig
        cfg = CircuitBreakerConfig(**cfg_kwargs)
        return CircuitBreaker("rate-test", cfg)

    def test_zero_rate_when_no_results(self):
        cb = self._make_cb()
        assert cb._calculate_failure_rate() == 0.0

    def test_failure_rate_all_success(self):
        cb = self._make_cb()
        now = time.time()
        cb.recent_results = [(now, True), (now, True), (now, True)]
        assert cb._calculate_failure_rate() == 0.0

    def test_failure_rate_all_failures(self):
        cb = self._make_cb()
        now = time.time()
        cb.recent_results = [(now, False), (now, False)]
        assert cb._calculate_failure_rate() == 1.0

    def test_failure_rate_mixed(self):
        cb = self._make_cb()
        now = time.time()
        # 3 failures out of 4 = 0.75
        cb.recent_results = [
            (now, True),
            (now, False),
            (now, False),
            (now, False),
        ]
        assert cb._calculate_failure_rate() == pytest.approx(0.75)

    def test_old_entries_pruned_from_rolling_window(self):
        cb = self._make_cb()
        # Inject an old entry (well outside the 60s window) and a recent one
        old_ts = time.time() - 120
        recent_ts = time.time()
        cb._add_to_rolling_window(old_ts, success=False)
        # The old entry gets pruned when we add the recent entry
        cb._add_to_rolling_window(recent_ts, success=True)
        # Only the recent entry should survive
        assert len(cb.recent_results) == 1
        _, success = cb.recent_results[0]
        assert success is True

    @pytest.mark.asyncio
    async def test_high_failure_rate_opens_circuit_when_min_requests_met(self):
        from services.circuit_breaker import CircuitState, CircuitBreakerException
        # failure_threshold=100 so count alone never triggers; rely on rate
        cb = self._make_cb(
            failure_threshold=100,
            min_request_threshold=4,
            failure_rate_threshold=0.5,
        )
        success_fn = AsyncMock(return_value="ok")
        fail_fn = AsyncMock(side_effect=RuntimeError("err"))

        # 2 successes, then failures until circuit opens
        await cb.call(success_fn)
        await cb.call(success_fn)
        # Keep failing until circuit opens; once open it raises CircuitBreakerException
        for _ in range(5):
            try:
                await cb.call(fail_fn)
            except (RuntimeError, CircuitBreakerException):
                pass
            if cb.state == CircuitState.OPEN:
                break

        assert cb.state == CircuitState.OPEN


# ─────────────────────────────────────────────────────────────────────────────
# CircuitBreaker – get_metrics
# ─────────────────────────────────────────────────────────────────────────────

class TestGetMetrics:

    def _make_cb(self):
        from services.circuit_breaker import CircuitBreaker
        return CircuitBreaker("metrics-test")

    def test_metrics_has_required_keys(self):
        cb = self._make_cb()
        m = cb.get_metrics()
        for key in ("name", "state", "failure_count", "success_count",
                    "total_requests", "failure_rate", "last_failure_time",
                    "recent_requests", "config"):
            assert key in m, f"Missing key: {key}"

    def test_metrics_name_matches(self):
        cb = self._make_cb()
        assert cb.get_metrics()["name"] == "metrics-test"

    def test_metrics_initial_state_value(self):
        cb = self._make_cb()
        assert cb.get_metrics()["state"] == "CLOSED"

    def test_metrics_config_sub_dict(self):
        cb = self._make_cb()
        cfg_dict = cb.get_metrics()["config"]
        assert cfg_dict["failure_threshold"] == 5
        assert cfg_dict["success_threshold"] == 2
        assert cfg_dict["timeout_duration"] == 60
        assert cfg_dict["failure_rate_threshold"] == 0.5

    @pytest.mark.asyncio
    async def test_metrics_reflect_calls(self):
        cb = self._make_cb()
        func = AsyncMock(return_value="ok")
        await cb.call(func)
        m = cb.get_metrics()
        assert m["total_requests"] == 1
        assert m["failure_count"] == 0
        assert m["recent_requests"] == 1

    @pytest.mark.asyncio
    async def test_metrics_failure_rate_after_failures(self):
        cb = self._make_cb()
        func = AsyncMock(side_effect=RuntimeError("err"))
        # 2 failures (below threshold so still callable)
        from services.circuit_breaker import CircuitBreakerConfig
        cb.config = CircuitBreakerConfig(failure_threshold=10)
        for _ in range(2):
            with pytest.raises(RuntimeError):
                await cb.call(func)
        m = cb.get_metrics()
        assert m["failure_rate"] == pytest.approx(1.0)


# ─────────────────────────────────────────────────────────────────────────────
# CircuitBreaker – reset
# ─────────────────────────────────────────────────────────────────────────────

class TestCircuitBreakerReset:

    def _make_open_cb(self):
        from services.circuit_breaker import (
            CircuitBreaker, CircuitBreakerConfig, CircuitState
        )
        cfg = CircuitBreakerConfig(failure_threshold=1)
        cb = CircuitBreaker("reset-test", cfg)
        cb.state = CircuitState.OPEN
        cb.failure_count = 5
        cb.success_count = 3
        cb.last_failure_time = time.time()
        cb.recent_results = [(time.time(), False)]
        return cb

    def test_reset_sets_state_to_closed(self):
        from services.circuit_breaker import CircuitState
        cb = self._make_open_cb()
        cb.reset()
        assert cb.state == CircuitState.CLOSED

    def test_reset_clears_failure_count(self):
        cb = self._make_open_cb()
        cb.reset()
        assert cb.failure_count == 0

    def test_reset_clears_success_count(self):
        cb = self._make_open_cb()
        cb.reset()
        assert cb.success_count == 0

    def test_reset_clears_last_failure_time(self):
        cb = self._make_open_cb()
        cb.reset()
        assert cb.last_failure_time is None

    def test_reset_clears_recent_results(self):
        cb = self._make_open_cb()
        cb.reset()
        assert cb.recent_results == []

    @pytest.mark.asyncio
    async def test_reset_allows_calls_after_open(self):
        cb = self._make_open_cb()
        cb.reset()
        func = AsyncMock(return_value="after reset")
        result = await cb.call(func)
        assert result == "after reset"


# ─────────────────────────────────────────────────────────────────────────────
# CircuitBreakerManager
# ─────────────────────────────────────────────────────────────────────────────

class TestCircuitBreakerManager:

    def _make_manager(self):
        from services.circuit_breaker import CircuitBreakerManager
        return CircuitBreakerManager()

    def test_get_circuit_breaker_creates_new_instance(self):
        from services.circuit_breaker import CircuitBreaker
        mgr = self._make_manager()
        cb = mgr.get_circuit_breaker("svc-a")
        assert isinstance(cb, CircuitBreaker)
        assert cb.name == "svc-a"

    def test_get_circuit_breaker_returns_same_instance(self):
        mgr = self._make_manager()
        cb1 = mgr.get_circuit_breaker("svc-a")
        cb2 = mgr.get_circuit_breaker("svc-a")
        assert cb1 is cb2

    def test_get_circuit_breaker_different_names_different_instances(self):
        mgr = self._make_manager()
        cb1 = mgr.get_circuit_breaker("svc-a")
        cb2 = mgr.get_circuit_breaker("svc-b")
        assert cb1 is not cb2

    def test_get_circuit_breaker_uses_provided_config(self):
        from services.circuit_breaker import CircuitBreakerConfig
        mgr = self._make_manager()
        cfg = CircuitBreakerConfig(failure_threshold=99)
        cb = mgr.get_circuit_breaker("configured", config=cfg)
        assert cb.config.failure_threshold == 99

    def test_get_all_metrics_empty_when_no_breakers(self):
        mgr = self._make_manager()
        assert mgr.get_all_metrics() == {}

    def test_get_all_metrics_returns_entry_per_breaker(self):
        mgr = self._make_manager()
        mgr.get_circuit_breaker("alpha")
        mgr.get_circuit_breaker("beta")
        metrics = mgr.get_all_metrics()
        assert set(metrics.keys()) == {"alpha", "beta"}

    def test_get_all_metrics_each_entry_has_state(self):
        mgr = self._make_manager()
        mgr.get_circuit_breaker("svc")
        metrics = mgr.get_all_metrics()
        assert "state" in metrics["svc"]

    def test_reset_all_resets_every_breaker(self):
        from services.circuit_breaker import CircuitState
        mgr = self._make_manager()
        cb_a = mgr.get_circuit_breaker("a")
        cb_b = mgr.get_circuit_breaker("b")
        # Manually open both
        cb_a.state = CircuitState.OPEN
        cb_b.state = CircuitState.OPEN
        mgr.reset_all()
        assert cb_a.state == CircuitState.CLOSED
        assert cb_b.state == CircuitState.CLOSED

    def test_reset_all_on_empty_manager_does_not_raise(self):
        mgr = self._make_manager()
        mgr.reset_all()  # should not raise

    def test_get_health_summary_keys(self):
        mgr = self._make_manager()
        summary = mgr.get_health_summary()
        for key in ("total_circuit_breakers", "open", "half_open", "closed", "overall_health"):
            assert key in summary

    def test_get_health_summary_empty_manager(self):
        mgr = self._make_manager()
        summary = mgr.get_health_summary()
        assert summary["total_circuit_breakers"] == 0
        assert summary["open"] == 0
        assert summary["closed"] == 0

    def test_get_health_summary_all_closed_is_healthy(self):
        mgr = self._make_manager()
        mgr.get_circuit_breaker("x")
        mgr.get_circuit_breaker("y")
        summary = mgr.get_health_summary()
        assert summary["overall_health"] == "healthy"

    def test_get_health_summary_one_open_is_degraded(self):
        from services.circuit_breaker import CircuitState
        mgr = self._make_manager()
        cb_a = mgr.get_circuit_breaker("a")
        mgr.get_circuit_breaker("b")
        cb_a.state = CircuitState.OPEN
        summary = mgr.get_health_summary()
        assert summary["open"] == 1
        assert summary["overall_health"] in ("degraded", "critical")

    def test_get_health_summary_all_open_is_critical(self):
        from services.circuit_breaker import CircuitState
        mgr = self._make_manager()
        for name in ("a", "b", "c"):
            cb = mgr.get_circuit_breaker(name)
            cb.state = CircuitState.OPEN
        summary = mgr.get_health_summary()
        assert summary["overall_health"] == "critical"

    def test_get_health_summary_half_open_count(self):
        from services.circuit_breaker import CircuitState
        mgr = self._make_manager()
        cb = mgr.get_circuit_breaker("ho")
        cb.state = CircuitState.HALF_OPEN
        summary = mgr.get_health_summary()
        assert summary["half_open"] == 1


# ─────────────────────────────────────────────────────────────────────────────
# with_circuit_breaker decorator
# ─────────────────────────────────────────────────────────────────────────────

class TestWithCircuitBreakerDecorator:

    @pytest.fixture(autouse=True)
    def _clean_global_manager(self):
        """Remove test entries from the global circuit_breaker_manager after each test."""
        from services.circuit_breaker import circuit_breaker_manager
        yield
        # Cleanup: remove any test entries we added
        keys_to_remove = [k for k in circuit_breaker_manager.circuit_breakers if k.startswith("_test_decorator")]
        for k in keys_to_remove:
            circuit_breaker_manager.circuit_breakers.pop(k, None)

    @pytest.mark.asyncio
    async def test_decorator_wraps_async_function_and_returns_value(self):
        from services.circuit_breaker import with_circuit_breaker, circuit_breaker_manager

        # Use a unique name to avoid state leakage from the global manager
        cb_name = "_test_decorator_success_42"
        # Ensure clean state
        if cb_name in circuit_breaker_manager.circuit_breakers:
            circuit_breaker_manager.circuit_breakers.pop(cb_name)

        @with_circuit_breaker(cb_name)
        async def my_func(x, y):
            return x + y

        result = await my_func(3, 4)
        assert result == 7

    @pytest.mark.asyncio
    async def test_decorator_propagates_exceptions(self):
        from services.circuit_breaker import with_circuit_breaker, circuit_breaker_manager

        cb_name = "_test_decorator_exc"
        if cb_name in circuit_breaker_manager.circuit_breakers:
            circuit_breaker_manager.circuit_breakers.pop(cb_name)

        @with_circuit_breaker(cb_name)
        async def failing_func():
            raise ValueError("from decorated func")

        with pytest.raises(ValueError, match="from decorated func"):
            await failing_func()

    @pytest.mark.asyncio
    async def test_decorator_uses_circuit_breaker_manager(self):
        from services.circuit_breaker import with_circuit_breaker, circuit_breaker_manager, CircuitBreaker

        cb_name = "_test_decorator_manager_check"
        if cb_name in circuit_breaker_manager.circuit_breakers:
            circuit_breaker_manager.circuit_breakers.pop(cb_name)

        @with_circuit_breaker(cb_name)
        async def simple():
            return "done"

        await simple()
        assert cb_name in circuit_breaker_manager.circuit_breakers
        assert isinstance(circuit_breaker_manager.circuit_breakers[cb_name], CircuitBreaker)

    @pytest.mark.asyncio
    async def test_decorator_raises_circuit_breaker_exception_when_open(self):
        from services.circuit_breaker import (
            with_circuit_breaker, circuit_breaker_manager,
            CircuitBreakerException, CircuitState, CircuitBreakerConfig,
        )

        cb_name = "_test_decorator_open"
        if cb_name in circuit_breaker_manager.circuit_breakers:
            circuit_breaker_manager.circuit_breakers.pop(cb_name)

        cfg = CircuitBreakerConfig(failure_threshold=1, timeout_duration=9999)

        @with_circuit_breaker(cb_name, cfg)
        async def unstable():
            raise RuntimeError("broken")

        # Trip the breaker
        with pytest.raises(RuntimeError):
            await unstable()

        # Now the circuit should be open; next call must raise CircuitBreakerException
        with pytest.raises(CircuitBreakerException):
            await unstable()

    @pytest.mark.asyncio
    async def test_decorator_passes_args_and_kwargs(self):
        from services.circuit_breaker import with_circuit_breaker, circuit_breaker_manager

        cb_name = "_test_decorator_args"
        if cb_name in circuit_breaker_manager.circuit_breakers:
            circuit_breaker_manager.circuit_breakers.pop(cb_name)

        received = {}

        @with_circuit_breaker(cb_name)
        async def capture(*args, **kwargs):
            received["args"] = args
            received["kwargs"] = kwargs
            return "captured"

        await capture(1, 2, key="val")
        assert received["args"] == (1, 2)
        assert received["kwargs"] == {"key": "val"}
