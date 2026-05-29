"""
Unit Tests – API Client utilities
===================================

Tests cover:
  • APIResponse dataclass
  • get_language_instruction helper
  • DeepSeekClient construction (env var guard)
  • DeepSeekClient.chat_completion success and error paths (aiohttp mocked)
"""

from __future__ import annotations

import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# APIResponse dataclass
# ─────────────────────────────────────────────────────────────────────────────

class TestAPIResponse:

    def test_success_response_fields(self):
        from services.api_client import APIResponse
        resp = APIResponse(success=True, data={"key": "val"}, status_code=200)
        assert resp.success is True
        assert resp.data == {"key": "val"}
        assert resp.error is None
        assert resp.status_code == 200

    def test_failure_response_fields(self):
        from services.api_client import APIResponse
        resp = APIResponse(success=False, error="Not found", status_code=404)
        assert resp.success is False
        assert resp.error == "Not found"
        assert resp.data is None

    def test_default_status_code(self):
        from services.api_client import APIResponse
        resp = APIResponse(success=True)
        assert resp.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# get_language_instruction
# ─────────────────────────────────────────────────────────────────────────────

class TestGetLanguageInstruction:

    @pytest.mark.parametrize("lang,fragment", [
        ("en", "English"),
        ("zh", "中文"),
        ("ja", "日本語"),
        ("ko", "한국어"),
    ])
    def test_known_languages(self, lang, fragment):
        from services.api_client import get_language_instruction
        result = get_language_instruction(lang)
        assert fragment in result, (
            f"Expected {fragment!r} in instruction for {lang!r}: {result!r}"
        )

    def test_unknown_language_returns_non_empty_string(self):
        from services.api_client import get_language_instruction
        result = get_language_instruction("xx")
        assert isinstance(result, str) and len(result) > 5

    def test_return_type_is_string(self):
        from services.api_client import get_language_instruction
        for lang in ("en", "zh", "ja", "ko", "fr", "de"):
            assert isinstance(get_language_instruction(lang), str)


# ─────────────────────────────────────────────────────────────────────────────
# DeepSeekClient construction
#
# Despite the legacy class name, this client now wraps the SiliconFlow
# inference platform (the project switched providers; the class name stayed
# for backwards compatibility with downstream callers). The construction
# tests below assert the *current* behavior, not the historical one.
# ─────────────────────────────────────────────────────────────────────────────

class TestDeepSeekClientConstruction:

    def test_raises_without_api_key(self):
        from services.api_client import DeepSeekClient
        # Temporarily remove the env var
        old = os.environ.pop("SILICONFLOW_API_KEY", None)
        try:
            with pytest.raises(ValueError, match="SILICONFLOW_API_KEY"):
                DeepSeekClient()
        finally:
            if old is not None:
                os.environ["SILICONFLOW_API_KEY"] = old
            else:
                os.environ["SILICONFLOW_API_KEY"] = "test-key-placeholder"

    def test_constructs_with_api_key(self):
        os.environ["SILICONFLOW_API_KEY"] = "sk-test"
        from services.api_client import DeepSeekClient
        client = DeepSeekClient()
        assert client.api_key == "sk-test"

    def test_base_url_contains_deepseek(self):
        # Naming kept for backwards compatibility; current backend is SiliconFlow.
        os.environ["SILICONFLOW_API_KEY"] = "sk-test"
        from services.api_client import DeepSeekClient
        client = DeepSeekClient()
        assert "siliconflow" in client.base_url.lower()

    def test_auth_header_set(self):
        os.environ["SILICONFLOW_API_KEY"] = "sk-test-header"
        from services.api_client import DeepSeekClient
        client = DeepSeekClient()
        assert "Authorization" in client.headers
        assert "sk-test-header" in client.headers["Authorization"]


# ─────────────────────────────────────────────────────────────────────────────
# DeepSeekClient.chat_completion – HTTP mocked
# ─────────────────────────────────────────────────────────────────────────────

class TestDeepSeekChatCompletion:

    def _make_client(self):
        os.environ["SILICONFLOW_API_KEY"] = "sk-test"
        from services.api_client import DeepSeekClient
        return DeepSeekClient()

    def _mock_aiohttp_200(self, payload: dict):
        """Return a context manager stack that mocks aiohttp.ClientSession."""
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value=payload)
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_response)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_connector = MagicMock()
        mock_connector.__aenter__ = AsyncMock(return_value=mock_connector)
        mock_connector.__aexit__ = AsyncMock(return_value=False)

        return mock_session, mock_connector

    @pytest.mark.asyncio
    async def test_successful_request_returns_success_response(self):
        client = self._make_client()
        payload = {"choices": [{"message": {"content": "answer"}}]}

        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value=payload)
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_response)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_connector = MagicMock()

        with patch("aiohttp.TCPConnector", return_value=mock_connector), \
             patch("aiohttp.ClientSession", return_value=mock_session):
            result = await client.chat_completion(
                messages=[{"role": "user", "content": "hi"}]
            )

        assert result.success is True
        assert result.data == payload

    @pytest.mark.asyncio
    async def test_http_error_returns_failure_response(self):
        # Use a non-retryable status (400). 429/502/503/504 are deliberately
        # retried by the client so a single mocked 429 would burn through five
        # retries before settling on a `status_code=0` "max retries exceeded"
        # response — which is correct production behavior, not a bug.
        client = self._make_client()

        mock_response = AsyncMock()
        mock_response.status = 400
        mock_response.text = AsyncMock(return_value="Bad request")
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_response)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        with patch("aiohttp.TCPConnector", return_value=MagicMock()), \
             patch("aiohttp.ClientSession", return_value=mock_session):
            result = await client.chat_completion(
                messages=[{"role": "user", "content": "hi"}]
            )

        assert result.success is False
        assert result.status_code == 400

    @pytest.mark.asyncio
    async def test_network_exception_returns_failure_response(self):
        import aiohttp
        client = self._make_client()

        mock_session = MagicMock()
        mock_session.post = MagicMock(side_effect=aiohttp.ClientError("timeout"))
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        with patch("aiohttp.TCPConnector", return_value=MagicMock()), \
             patch("aiohttp.ClientSession", return_value=mock_session):
            result = await client.chat_completion(
                messages=[{"role": "user", "content": "hi"}]
            )

        assert result.success is False
        assert result.error is not None

    # ── Helpers for payload-capture tests ────────────────────────────────────
    @staticmethod
    def _capturing_session(captured: dict):
        """
        Build a mock aiohttp.ClientSession whose .post() is a regular callable
        (not async) that returns a proper async context manager — matching how
        aiohttp.ClientSession.post() is used in the codebase:

            async with session.post(url, json=payload, ...) as response:
                data = await response.json()

        `session.post(url, ...)` returns the context manager *synchronously*;
        `__aenter__` is then awaited to yield the response object.
        """

        class _FakeResponse:
            status = 200
            async def json(self):
                return {"choices": []}
            async def __aenter__(self):
                return self
            async def __aexit__(self, *_):
                return False

        class _FakePost:
            def __init__(self, url, headers=None, json=None, timeout=None):
                captured.update(json or {})
            async def __aenter__(self):
                return _FakeResponse()
            async def __aexit__(self, *_):
                return False

        mock_session = MagicMock()
        mock_session.post = MagicMock(side_effect=_FakePost)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        return mock_session

    @pytest.mark.asyncio
    async def test_default_model_is_deepseek_chat(self):
        # Default model is the SiliconFlow-hosted GLM-5.1; the test name is
        # historical (when the project actually used DeepSeek directly).
        client = self._make_client()
        captured = {}
        mock_session = self._capturing_session(captured)

        with patch("aiohttp.TCPConnector", return_value=MagicMock()), \
             patch("aiohttp.ClientSession", return_value=mock_session):
            await client.chat_completion(messages=[{"role": "user", "content": "hi"}])

        assert captured.get("model") == "Pro/zai-org/GLM-5.1"

    @pytest.mark.asyncio
    async def test_temperature_and_max_tokens_forwarded(self):
        client = self._make_client()
        captured = {}
        mock_session = self._capturing_session(captured)

        with patch("aiohttp.TCPConnector", return_value=MagicMock()), \
             patch("aiohttp.ClientSession", return_value=mock_session):
            await client.chat_completion(
                messages=[{"role": "user", "content": "hi"}],
                temperature=0.1,
                max_tokens=512,
            )

        assert captured.get("temperature") == 0.1
        assert captured.get("max_tokens") == 512

    @pytest.mark.asyncio
    async def test_stream_always_false(self):
        client = self._make_client()
        captured = {}
        mock_session = self._capturing_session(captured)

        with patch("aiohttp.TCPConnector", return_value=MagicMock()), \
             patch("aiohttp.ClientSession", return_value=mock_session):
            await client.chat_completion(messages=[{"role": "user", "content": "hi"}])

        assert captured.get("stream") is False
