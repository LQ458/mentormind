"""
Unit Tests – Fallback Provider System
======================================

Tests cover:
  • APIProvider dataclass (enabled/disabled based on env var)
  • OfflineMockProvider.chat_completion (valid structure, video vs basic templates)
  • FallbackAPIManager (provider registration, call_with_fallback success/fallback/all-fail,
    get_provider_status, get_health_summary)
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_mock_provider(name: str, priority: int, enabled: bool = True) -> "APIProvider":
    """Build an APIProvider backed by an AsyncMock client_func."""
    from services.fallback_provider import APIProvider

    func = AsyncMock(return_value={
        "choices": [{"message": {"content": f"response from {name}"}}],
        "usage": {"total_tokens": 10},
        "provider": name,
    })
    return APIProvider(
        name=name,
        client_func=func,
        priority=priority,
        enabled=enabled,
        api_key_env="",  # no env-var check
    )


def _make_manager_no_setup() -> "FallbackAPIManager":
    """Return a FallbackAPIManager whose _setup_providers is skipped."""
    from services.fallback_provider import FallbackAPIManager

    with patch.object(FallbackAPIManager, "_setup_providers", return_value=None):
        manager = FallbackAPIManager()
    manager.providers = []
    return manager


# ─────────────────────────────────────────────────────────────────────────────
# APIProvider dataclass
# ─────────────────────────────────────────────────────────────────────────────

class TestAPIProvider:

    def test_enabled_when_env_var_present(self):
        from services.fallback_provider import APIProvider

        with patch.dict(os.environ, {"MY_API_KEY": "secret"}):
            provider = APIProvider(
                name="test",
                client_func=AsyncMock(),
                priority=1,
                enabled=True,
                api_key_env="MY_API_KEY",
            )
        assert provider.enabled is True

    def test_disabled_when_env_var_missing(self):
        from services.fallback_provider import APIProvider

        env_without_key = {k: v for k, v in os.environ.items() if k != "MISSING_KEY_XYZ"}
        with patch.dict(os.environ, env_without_key, clear=True):
            provider = APIProvider(
                name="test",
                client_func=AsyncMock(),
                priority=1,
                enabled=True,
                api_key_env="MISSING_KEY_XYZ",
            )
        assert provider.enabled is False

    def test_no_env_var_check_stays_enabled(self):
        from services.fallback_provider import APIProvider

        provider = APIProvider(
            name="offline",
            client_func=AsyncMock(),
            priority=999,
            enabled=True,
            api_key_env="",  # empty string -> no check
        )
        assert provider.enabled is True

    def test_default_priority_is_zero(self):
        from services.fallback_provider import APIProvider

        provider = APIProvider(name="p", client_func=AsyncMock())
        assert provider.priority == 0

    def test_default_enabled_is_true(self):
        from services.fallback_provider import APIProvider

        provider = APIProvider(name="p", client_func=AsyncMock())
        assert provider.enabled is True


# ─────────────────────────────────────────────────────────────────────────────
# OfflineMockProvider
# ─────────────────────────────────────────────────────────────────────────────

class TestOfflineMockProvider:

    @pytest.fixture
    def provider(self):
        from services.fallback_provider import OfflineMockProvider
        return OfflineMockProvider()

    # -- response structure ---------------------------------------------------

    @pytest.mark.asyncio
    async def test_returns_choices_key(self, provider):
        messages = [{"role": "user", "content": "tell me something"}]
        result = await provider.chat_completion(messages)
        assert "choices" in result

    @pytest.mark.asyncio
    async def test_choices_contains_message_with_content(self, provider):
        messages = [{"role": "user", "content": "hello"}]
        result = await provider.chat_completion(messages)
        assert len(result["choices"]) > 0
        assert "message" in result["choices"][0]
        assert "content" in result["choices"][0]["message"]
        assert isinstance(result["choices"][0]["message"]["content"], str)

    @pytest.mark.asyncio
    async def test_returns_usage_key(self, provider):
        messages = [{"role": "user", "content": "hello"}]
        result = await provider.chat_completion(messages)
        assert "usage" in result

    @pytest.mark.asyncio
    async def test_returns_provider_key_offline_mock(self, provider):
        messages = [{"role": "user", "content": "hello"}]
        result = await provider.chat_completion(messages)
        assert result["provider"] == "offline_mock"

    # -- video template -------------------------------------------------------

    @pytest.mark.asyncio
    async def test_video_keyword_triggers_video_template(self, provider):
        messages = [{"role": "user", "content": "create a video about photosynthesis"}]
        result = await provider.chat_completion(messages)
        content = result["choices"][0]["message"]["content"]
        # Video template returns JSON with "scenes" key
        parsed = json.loads(content)
        assert "scenes" in parsed
        assert isinstance(parsed["scenes"], list)

    @pytest.mark.asyncio
    async def test_chinese_keyword_triggers_video_template(self, provider):
        messages = [{"role": "user", "content": "制作一个教学课程"}]
        result = await provider.chat_completion(messages)
        content = result["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        assert "scenes" in parsed

    @pytest.mark.asyncio
    async def test_video_template_has_three_scenes(self, provider):
        messages = [{"role": "user", "content": "make a video about math"}]
        result = await provider.chat_completion(messages)
        parsed = json.loads(result["choices"][0]["message"]["content"])
        assert len(parsed["scenes"]) == 3

    @pytest.mark.asyncio
    async def test_video_template_scene_fields(self, provider):
        messages = [{"role": "user", "content": "video about algebra"}]
        result = await provider.chat_completion(messages)
        parsed = json.loads(result["choices"][0]["message"]["content"])
        required_fields = {"id", "duration", "narration", "action", "param"}
        for scene in parsed["scenes"]:
            assert required_fields.issubset(scene.keys()), (
                f"Scene missing fields: {required_fields - scene.keys()}"
            )

    @pytest.mark.asyncio
    async def test_video_template_has_title(self, provider):
        messages = [{"role": "user", "content": "create a video lesson"}]
        result = await provider.chat_completion(messages)
        parsed = json.loads(result["choices"][0]["message"]["content"])
        assert "title" in parsed

    # -- basic template -------------------------------------------------------

    @pytest.mark.asyncio
    async def test_basic_template_for_non_video_content(self, provider):
        messages = [{"role": "user", "content": "what is the capital of France?"}]
        result = await provider.chat_completion(messages)
        content = result["choices"][0]["message"]["content"]
        # Basic template returns a plain string, not JSON
        assert isinstance(content, str)
        assert len(content) > 0

    @pytest.mark.asyncio
    async def test_basic_template_content_references_topic(self, provider):
        messages = [{"role": "user", "content": "explain gravity"}]
        result = await provider.chat_completion(messages)
        content = result["choices"][0]["message"]["content"]
        assert "explain gravity" in content

    @pytest.mark.asyncio
    async def test_basic_template_not_valid_json(self, provider):
        messages = [{"role": "user", "content": "tell me about the moon"}]
        result = await provider.chat_completion(messages)
        content = result["choices"][0]["message"]["content"]
        try:
            json.loads(content)
            is_json = True
        except (json.JSONDecodeError, ValueError):
            is_json = False
        assert not is_json, "Basic template should return plain text, not JSON"

    @pytest.mark.asyncio
    async def test_usage_total_tokens_is_int(self, provider):
        messages = [{"role": "user", "content": "hello"}]
        result = await provider.chat_completion(messages)
        assert isinstance(result["usage"]["total_tokens"], int)

    # -- first user message is used -------------------------------------------

    @pytest.mark.asyncio
    async def test_system_message_is_ignored_uses_first_user(self, provider):
        messages = [
            {"role": "system", "content": "You are an assistant."},
            {"role": "user", "content": "what is a video codec"},
        ]
        result = await provider.chat_completion(messages)
        content = result["choices"][0]["message"]["content"]
        # "video" appears in user message -> video template
        parsed = json.loads(content)
        assert "scenes" in parsed


# ─────────────────────────────────────────────────────────────────────────────
# FallbackAPIManager – provider registration
# ─────────────────────────────────────────────────────────────────────────────

class TestFallbackAPIManagerRegistration:

    def test_providers_sorted_by_priority_ascending(self):
        manager = _make_manager_no_setup()
        p1 = _make_mock_provider("p1", priority=10)
        p2 = _make_mock_provider("p2", priority=1)
        p3 = _make_mock_provider("p3", priority=5)

        # Mock circuit_breaker_manager to avoid side effects
        with patch("services.fallback_provider.circuit_breaker_manager"):
            manager.register_provider(p1)
            manager.register_provider(p2)
            manager.register_provider(p3)

        priorities = [p.priority for p in manager.providers]
        assert priorities == sorted(priorities)

    def test_register_provider_adds_to_list(self):
        manager = _make_manager_no_setup()
        p = _make_mock_provider("alpha", priority=1)

        with patch("services.fallback_provider.circuit_breaker_manager"):
            manager.register_provider(p)

        assert any(pr.name == "alpha" for pr in manager.providers)

    def test_disabled_provider_registered_but_not_active_in_fallback(self):
        manager = _make_manager_no_setup()
        disabled = _make_mock_provider("disabled_p", priority=1, enabled=False)

        with patch("services.fallback_provider.circuit_breaker_manager"):
            manager.register_provider(disabled)

        assert any(pr.name == "disabled_p" for pr in manager.providers)
        enabled_names = [p.name for p in manager.providers if p.enabled]
        assert "disabled_p" not in enabled_names


# ─────────────────────────────────────────────────────────────────────────────
# FallbackAPIManager – call_with_fallback
# ─────────────────────────────────────────────────────────────────────────────

class TestFallbackAPIManagerCallWithFallback:

    def _setup_manager_with_providers(self, providers):
        """Register providers into a fresh manager with circuit breaker mocked."""
        manager = _make_manager_no_setup()
        with patch("services.fallback_provider.circuit_breaker_manager"):
            for p in providers:
                manager.register_provider(p)
        return manager

    @pytest.mark.asyncio
    async def test_first_provider_succeeds_returns_result(self):
        p1 = _make_mock_provider("primary", priority=1)
        p2 = _make_mock_provider("secondary", priority=2)
        manager = self._setup_manager_with_providers([p1, p2])

        messages = [{"role": "user", "content": "hello"}]

        # For offline_mock path the code calls client_func directly;
        # for others it goes through circuit_breaker.call. We patch the
        # circuit breaker so it just calls the function directly.
        async def _passthrough(func, *args, **kwargs):
            return await func(*args, **kwargs)

        mock_cb = MagicMock()
        mock_cb.call = AsyncMock(side_effect=_passthrough)

        with patch("services.fallback_provider.circuit_breaker_manager") as mock_cbm:
            mock_cbm.get_circuit_breaker.return_value = mock_cb
            result = await manager.call_with_fallback(messages)

        assert result["provider_used"] == "primary"
        assert "providers_attempted" in result
        assert result["providers_attempted"] == ["primary"]

    @pytest.mark.asyncio
    async def test_first_fails_second_succeeds_fallback_works(self):
        p1 = _make_mock_provider("primary", priority=1)
        p2 = _make_mock_provider("secondary", priority=2)

        messages = [{"role": "user", "content": "hello"}]

        manager = self._setup_manager_with_providers([p1, p2])

        call_count = {"n": 0}

        async def circuit_call(func, *args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise ConnectionError("primary down")
            return await func(*args, **kwargs)

        mock_cb = MagicMock()
        mock_cb.call = AsyncMock(side_effect=circuit_call)

        with patch("services.fallback_provider.circuit_breaker_manager") as mock_cbm:
            mock_cbm.get_circuit_breaker.return_value = mock_cb
            result = await manager.call_with_fallback(messages)

        assert result["provider_used"] == "secondary"
        assert "primary" in result["providers_attempted"]
        assert "secondary" in result["providers_attempted"]

    @pytest.mark.asyncio
    async def test_all_providers_fail_raises_exception(self):
        p1 = _make_mock_provider("p1", priority=1)
        p2 = _make_mock_provider("p2", priority=2)

        # Give p2 the name "offline_mock" so it goes the direct path,
        # and make its client_func raise too.
        p2.name = "offline_mock"
        p2.client_func = AsyncMock(side_effect=RuntimeError("offline also broken"))

        manager = self._setup_manager_with_providers([p1, p2])

        mock_cb = MagicMock()
        mock_cb.call = AsyncMock(side_effect=RuntimeError("p1 failed"))

        with patch("services.fallback_provider.circuit_breaker_manager") as mock_cbm:
            mock_cbm.get_circuit_breaker.return_value = mock_cb
            with pytest.raises(Exception) as exc_info:
                await manager.call_with_fallback([{"role": "user", "content": "hi"}])

        error_msg = str(exc_info.value)
        assert "All API providers failed" in error_msg
        assert "p1" in error_msg or "offline_mock" in error_msg

    @pytest.mark.asyncio
    async def test_result_contains_provider_used_key(self):
        p1 = _make_mock_provider("solo", priority=1)
        manager = self._setup_manager_with_providers([p1])

        async def _passthrough(func, *args, **kwargs):
            return await func(*args, **kwargs)

        mock_cb = MagicMock()
        mock_cb.call = AsyncMock(side_effect=_passthrough)

        with patch("services.fallback_provider.circuit_breaker_manager") as mock_cbm:
            mock_cbm.get_circuit_breaker.return_value = mock_cb
            result = await manager.call_with_fallback([{"role": "user", "content": "hi"}])

        assert "provider_used" in result

    @pytest.mark.asyncio
    async def test_result_contains_providers_attempted_list(self):
        p1 = _make_mock_provider("only_one", priority=1)
        manager = self._setup_manager_with_providers([p1])

        async def _passthrough(func, *args, **kwargs):
            return await func(*args, **kwargs)

        mock_cb = MagicMock()
        mock_cb.call = AsyncMock(side_effect=_passthrough)

        with patch("services.fallback_provider.circuit_breaker_manager") as mock_cbm:
            mock_cbm.get_circuit_breaker.return_value = mock_cb
            result = await manager.call_with_fallback([{"role": "user", "content": "hi"}])

        assert isinstance(result["providers_attempted"], list)
        assert "only_one" in result["providers_attempted"]

    @pytest.mark.asyncio
    async def test_disabled_providers_are_skipped(self):
        p_disabled = _make_mock_provider("disabled_p", priority=1, enabled=False)
        p_enabled = _make_mock_provider("enabled_p", priority=2, enabled=True)
        manager = self._setup_manager_with_providers([p_disabled, p_enabled])

        async def _passthrough(func, *args, **kwargs):
            return await func(*args, **kwargs)

        mock_cb = MagicMock()
        mock_cb.call = AsyncMock(side_effect=_passthrough)

        with patch("services.fallback_provider.circuit_breaker_manager") as mock_cbm:
            mock_cbm.get_circuit_breaker.return_value = mock_cb
            result = await manager.call_with_fallback([{"role": "user", "content": "hi"}])

        assert "disabled_p" not in result["providers_attempted"]
        assert result["provider_used"] == "enabled_p"

    @pytest.mark.asyncio
    async def test_offline_mock_called_directly_without_circuit_breaker(self):
        """Providers named 'offline_mock' bypass the circuit breaker."""
        p = _make_mock_provider("offline_mock", priority=999)
        manager = self._setup_manager_with_providers([p])

        called_directly = {"flag": False}
        original_func = p.client_func

        async def tracking_func(*args, **kwargs):
            called_directly["flag"] = True
            return await original_func(*args, **kwargs)

        p.client_func = tracking_func

        mock_cb = MagicMock()
        mock_cb.call = AsyncMock()  # should NOT be called

        with patch("services.fallback_provider.circuit_breaker_manager") as mock_cbm:
            mock_cbm.get_circuit_breaker.return_value = mock_cb
            result = await manager.call_with_fallback([{"role": "user", "content": "hi"}])

        mock_cb.call.assert_not_called()
        assert called_directly["flag"] is True


# ─────────────────────────────────────────────────────────────────────────────
# FallbackAPIManager – get_provider_status
# ─────────────────────────────────────────────────────────────────────────────

class TestFallbackAPIManagerProviderStatus:

    def test_get_provider_status_returns_dict(self):
        manager = _make_manager_no_setup()
        p = _make_mock_provider("myp", priority=1)
        p.name = "offline_mock"  # use offline_mock path (no circuit breaker needed)

        with patch("services.fallback_provider.circuit_breaker_manager"):
            manager.register_provider(p)

        status = manager.get_provider_status()
        assert isinstance(status, dict)

    def test_offline_mock_shows_offline_note(self):
        manager = _make_manager_no_setup()
        from services.fallback_provider import APIProvider

        offline = APIProvider(
            name="offline_mock",
            client_func=AsyncMock(),
            priority=999,
            enabled=True,
            api_key_env="",
        )
        with patch("services.fallback_provider.circuit_breaker_manager"):
            manager.register_provider(offline)

        status = manager.get_provider_status()
        assert "offline_mock" in status
        assert status["offline_mock"].get("note") == "offline_provider"

    def test_disabled_provider_shows_disabled_note(self):
        manager = _make_manager_no_setup()
        from services.fallback_provider import APIProvider

        disabled = APIProvider(
            name="some_provider",
            client_func=AsyncMock(),
            priority=1,
            enabled=False,
            api_key_env="",
        )
        with patch("services.fallback_provider.circuit_breaker_manager"):
            manager.register_provider(disabled)

        status = manager.get_provider_status()
        assert "some_provider" in status
        assert status["some_provider"]["enabled"] is False

    def test_status_includes_priority_for_each_provider(self):
        manager = _make_manager_no_setup()
        from services.fallback_provider import APIProvider

        p = APIProvider(
            name="offline_mock",
            client_func=AsyncMock(),
            priority=999,
            enabled=True,
            api_key_env="",
        )
        with patch("services.fallback_provider.circuit_breaker_manager"):
            manager.register_provider(p)

        status = manager.get_provider_status()
        assert status["offline_mock"]["priority"] == 999


# ─────────────────────────────────────────────────────────────────────────────
# FallbackAPIManager – get_health_summary
# ─────────────────────────────────────────────────────────────────────────────

class TestFallbackAPIManagerHealthSummary:

    def _manager_with_offline_only(self):
        manager = _make_manager_no_setup()
        from services.fallback_provider import APIProvider

        offline = APIProvider(
            name="offline_mock",
            client_func=AsyncMock(),
            priority=999,
            enabled=True,
            api_key_env="",
        )
        with patch("services.fallback_provider.circuit_breaker_manager"):
            manager.register_provider(offline)
        return manager

    def test_health_summary_has_required_keys(self):
        manager = self._manager_with_offline_only()
        summary = manager.get_health_summary()
        required = {"total_providers", "healthy_providers", "degraded_providers",
                    "fallback_available", "system_health"}
        assert required.issubset(summary.keys())

    def test_fallback_always_available(self):
        manager = self._manager_with_offline_only()
        summary = manager.get_health_summary()
        assert summary["fallback_available"] is True

    def test_total_providers_excludes_offline_mock(self):
        manager = self._manager_with_offline_only()
        # Only offline_mock registered -> total_providers == 0 (offline not counted)
        summary = manager.get_health_summary()
        assert summary["total_providers"] == 0

    def test_system_health_degraded_when_no_healthy_providers(self):
        manager = self._manager_with_offline_only()
        summary = manager.get_health_summary()
        # No real providers, so healthy_providers == 0 -> "degraded"
        assert summary["system_health"] == "degraded"

    def test_system_health_healthy_when_closed_circuit_breaker(self):
        manager = _make_manager_no_setup()
        from services.fallback_provider import APIProvider

        real_p = APIProvider(
            name="real_provider",
            client_func=AsyncMock(),
            priority=1,
            enabled=True,
            api_key_env="",
        )
        mock_cb = MagicMock()
        mock_cb.get_metrics.return_value = {
            "state": "CLOSED",
            "failure_rate": 0.0,
            "total_requests": 5,
        }

        with patch("services.fallback_provider.circuit_breaker_manager") as mock_cbm:
            mock_cbm.get_circuit_breaker.return_value = mock_cb
            manager.register_provider(real_p)

        with patch("services.fallback_provider.circuit_breaker_manager") as mock_cbm:
            mock_cbm.get_circuit_breaker.return_value = mock_cb
            summary = manager.get_health_summary()

        assert summary["total_providers"] == 1
        assert summary["healthy_providers"] == 1
        assert summary["system_health"] == "healthy"

    def test_degraded_providers_equals_total_minus_healthy(self):
        manager = self._manager_with_offline_only()
        summary = manager.get_health_summary()
        assert summary["degraded_providers"] == summary["total_providers"] - summary["healthy_providers"]

    def test_summary_values_are_integers_or_bool(self):
        manager = self._manager_with_offline_only()
        summary = manager.get_health_summary()
        assert isinstance(summary["total_providers"], int)
        assert isinstance(summary["healthy_providers"], int)
        assert isinstance(summary["degraded_providers"], int)
        assert isinstance(summary["fallback_available"], bool)
        assert isinstance(summary["system_health"], str)
