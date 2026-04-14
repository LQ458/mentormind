"""
Unit tests for backend/core/content/unit_generator.py

Covers:
  - _parse_json_from_response helper
  - UnitContentGenerator._get_framework_display static method
  - UnitContentGenerator._generate_content (async, mocked API)
  - UnitContentGenerator.generate (async, mocked)
  - UnitContentGenerator.generate_unit_test (async, mocked)
"""

from __future__ import annotations

import json
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Module-level patches applied before the module under test is imported so
# that top-level `from config import config` and
# `from services.api_client import api_client` don't trigger real network or
# filesystem access.
# ---------------------------------------------------------------------------

# Minimal ModelConfig stand-in
_MOCK_MODEL_CONFIG = MagicMock(name="ModelConfig")

_MOCK_CONFIG = MagicMock(name="config")
_MOCK_CONFIG.get_models.return_value = {
    "deepseek_v3": _MOCK_MODEL_CONFIG,
    "deepseek_r1": _MOCK_MODEL_CONFIG,
}

_MOCK_API_CLIENT = MagicMock(name="api_client")
_MOCK_API_CLIENT.deepseek = MagicMock(name="deepseek")
_MOCK_API_CLIENT.deepseek.chat_completion = AsyncMock()


def _make_chat_response(content: str) -> MagicMock:
    """Build a minimal APIResponse-like object with the given content string."""
    resp = MagicMock(name="APIResponse")
    resp.data = {
        "choices": [{"message": {"content": content}}]
    }
    return resp


# Apply module-level patches before any import of the module under test.
with (
    patch.dict(
        "sys.modules",
        {
            "config": MagicMock(config=_MOCK_CONFIG),
            "services.api_client": MagicMock(
                api_client=_MOCK_API_CLIENT,
                get_language_instruction=MagicMock(return_value="Respond in English."),
            ),
        },
    ),
):
    from core.content.unit_generator import (
        UnitContentGenerator,
        _parse_json_from_response,
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_mock_api_client():
    """Reset shared mock state before each test to prevent ordering leaks."""
    _MOCK_API_CLIENT.reset_mock()
    _MOCK_API_CLIENT.deepseek = MagicMock()
    _MOCK_API_CLIENT.deepseek.chat_completion = AsyncMock()
    yield


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SAMPLE_DICT = {"key": "value", "number": 42}
_SAMPLE_JSON = json.dumps(_SAMPLE_DICT)

_UNIT_DATA: Dict[str, Any] = {
    "title": "Introduction to Calculus",
    "topics": ["Limits", "Derivatives"],
    "learning_objectives": ["Understand limits", "Compute derivatives"],
}

_PLAN_DATA: Dict[str, Any] = {
    "subject": "mathematics",
    "framework": "ap",
    "course_name": "",
    "difficulty_level": "intermediate",
}


# ===========================================================================
# _parse_json_from_response
# ===========================================================================


class TestParseJsonFromResponse:
    """Tests for the _parse_json_from_response helper function."""

    def test_json_code_block_with_label(self):
        """```json ... ``` block is parsed correctly."""
        text = f"```json\n{_SAMPLE_JSON}\n```"
        result = _parse_json_from_response(text)
        assert result == _SAMPLE_DICT

    def test_code_block_without_label(self):
        """``` ... ``` block without 'json' label is parsed correctly."""
        text = f"```\n{_SAMPLE_JSON}\n```"
        result = _parse_json_from_response(text)
        assert result == _SAMPLE_DICT

    def test_raw_json_text(self):
        """Plain JSON string (no code fences) is parsed correctly."""
        result = _parse_json_from_response(_SAMPLE_JSON)
        assert result == _SAMPLE_DICT

    def test_invalid_json_returns_none(self):
        """Malformed JSON returns None instead of raising."""
        result = _parse_json_from_response("not valid json {{")
        assert result is None

    def test_empty_string_returns_none(self):
        """Empty string input returns None."""
        result = _parse_json_from_response("")
        assert result is None


# ===========================================================================
# UnitContentGenerator._get_framework_display
# ===========================================================================


class TestGetFrameworkDisplay:
    """Tests for the static helper _get_framework_display."""

    def test_course_name_takes_priority(self):
        """When course_name is provided it is returned as-is."""
        result = UnitContentGenerator._get_framework_display("ap", "My Custom Course")
        assert result == "My Custom Course"

    def test_framework_ap(self):
        result = UnitContentGenerator._get_framework_display("ap", None)
        assert result == "Advanced Placement (AP)"

    def test_framework_gaokao(self):
        result = UnitContentGenerator._get_framework_display("gaokao", None)
        assert result == "高考 (Gaokao)"

    def test_framework_none(self):
        """None framework falls back to 'General curriculum'."""
        result = UnitContentGenerator._get_framework_display(None, None)
        assert result == "General curriculum"

    def test_unknown_framework(self):
        """Unknown framework string falls back to 'General curriculum'."""
        result = UnitContentGenerator._get_framework_display("unknown_framework", None)
        assert result == "General curriculum"


# ===========================================================================
# UnitContentGenerator._generate_content
# ===========================================================================


class TestGenerateContent:
    """Tests for UnitContentGenerator._generate_content (async)."""

    def _make_generator(self) -> UnitContentGenerator:
        gen = UnitContentGenerator.__new__(UnitContentGenerator)
        gen.v3_config = _MOCK_MODEL_CONFIG
        gen.r1_config = _MOCK_MODEL_CONFIG
        return gen

    @pytest.mark.asyncio
    async def test_successful_api_call_returns_parsed_json(self):
        """A successful API response with valid JSON is returned as a dict."""
        generator = self._make_generator()
        payload = {"questions": [{"q": "What is a limit?"}]}
        response = _make_chat_response(json.dumps(payload))

        with (
            patch(
                "core.content.unit_generator.api_client",
                _MOCK_API_CLIENT,
            ),
            patch(
                "core.content.unit_generator.api_client.deepseek.chat_completion",
                AsyncMock(return_value=response),
            ) as mock_call,
            patch(
                "prompts.loader.render_subject_prompt",
                return_value="mock prompt",
            ),
        ):
            # Patch the import inside _generate_content
            with patch.dict(
                "sys.modules",
                {"prompts.loader": MagicMock(render_subject_prompt=MagicMock(return_value="mock prompt"))},
            ):
                _MOCK_API_CLIENT.deepseek.chat_completion = AsyncMock(return_value=response)
                result = await generator._generate_content(
                    "quiz", "mathematics", "ap", {"language_instruction": "English"}, use_reasoning=True
                )

        assert result == payload

    @pytest.mark.asyncio
    async def test_api_exception_returns_none(self):
        """An exception from the API layer is caught and None is returned."""
        generator = self._make_generator()

        with patch.dict(
            "sys.modules",
            {"prompts.loader": MagicMock(render_subject_prompt=MagicMock(return_value="mock prompt"))},
        ):
            _MOCK_API_CLIENT.deepseek.chat_completion = AsyncMock(
                side_effect=RuntimeError("Network error")
            )
            result = await generator._generate_content(
                "study_guide", "mathematics", None, {}, use_reasoning=False
            )

        assert result is None

    @pytest.mark.asyncio
    async def test_unparseable_response_returns_none(self):
        """An API response with non-JSON content returns None."""
        generator = self._make_generator()
        response = _make_chat_response("Sorry, I cannot help with that.")

        with patch.dict(
            "sys.modules",
            {"prompts.loader": MagicMock(render_subject_prompt=MagicMock(return_value="mock prompt"))},
        ):
            _MOCK_API_CLIENT.deepseek.chat_completion = AsyncMock(return_value=response)
            result = await generator._generate_content(
                "flashcard", "biology", None, {}, use_reasoning=False
            )

        assert result is None


# ===========================================================================
# UnitContentGenerator.generate
# ===========================================================================


class TestGenerate:
    """Tests for UnitContentGenerator.generate (async, parallel dispatch)."""

    def _make_generator(self) -> UnitContentGenerator:
        gen = UnitContentGenerator.__new__(UnitContentGenerator)
        gen.v3_config = _MOCK_MODEL_CONFIG
        gen.r1_config = _MOCK_MODEL_CONFIG
        return gen

    @pytest.mark.asyncio
    async def test_generates_requested_content_types(self):
        """All requested content types appear in the output dict."""
        generator = self._make_generator()

        study_guide_payload = {"sections": [{"title": "Limits", "content": "..."}]}
        quiz_payload = {"questions": [{"q": "What is a limit?", "a": "A value approached"}]}

        async def fake_generate_content(prompt_type, subject, framework, variables, use_reasoning=False):
            if prompt_type == "study_guide":
                return study_guide_payload
            if prompt_type == "quiz":
                return quiz_payload
            return None

        with (
            patch.object(generator, "_generate_content", side_effect=fake_generate_content),
            patch.object(generator, "_fetch_educational_images", new=AsyncMock(return_value=[])),
            patch.dict(
                "sys.modules",
                {
                    "prompts.loader": MagicMock(render_subject_prompt=MagicMock(return_value="p")),
                    "core.content.diagram_generator": MagicMock(
                        process_study_guide_sections=lambda s: s
                    ),
                    "services.api_client": MagicMock(
                        api_client=_MOCK_API_CLIENT,
                        get_language_instruction=MagicMock(return_value="English"),
                    ),
                },
            ),
        ):
            result = await generator.generate(
                _UNIT_DATA, _PLAN_DATA, ["study_guide", "quiz"], language="en"
            )

        assert "study_guide" in result
        assert "quiz" in result
        assert result["study_guide"] == study_guide_payload
        assert result["quiz"] == quiz_payload

    @pytest.mark.asyncio
    async def test_failed_content_type_is_none_others_present(self):
        """When one content type fails, others still appear in the output."""
        generator = self._make_generator()

        flashcard_payload = {"cards": [{"front": "Limit", "back": "Approached value"}]}

        async def fake_generate_content(prompt_type, subject, framework, variables, use_reasoning=False):
            if prompt_type == "flashcard":
                return flashcard_payload
            raise RuntimeError("generation failed")

        with (
            patch.object(generator, "_generate_content", side_effect=fake_generate_content),
            patch.object(generator, "_fetch_educational_images", new=AsyncMock(return_value=[])),
            patch.dict(
                "sys.modules",
                {
                    "prompts.loader": MagicMock(render_subject_prompt=MagicMock(return_value="p")),
                    "services.api_client": MagicMock(
                        api_client=_MOCK_API_CLIENT,
                        get_language_instruction=MagicMock(return_value="English"),
                    ),
                },
            ),
        ):
            result = await generator.generate(
                _UNIT_DATA, _PLAN_DATA, ["study_guide", "flashcards"], language="en"
            )

        # study_guide failed (exception), flashcards succeeded
        assert result.get("study_guide") is None
        assert result["flashcards"] == flashcard_payload

    @pytest.mark.asyncio
    async def test_image_fetch_failure_does_not_crash(self):
        """If image fetching raises an exception, generation still completes."""
        generator = self._make_generator()

        study_guide_payload = {"sections": []}

        async def fake_generate_content(prompt_type, subject, framework, variables, use_reasoning=False):
            return study_guide_payload

        async def failing_image_fetch(title, topics, max_images=3):
            raise ConnectionError("image service unavailable")

        with (
            patch.object(generator, "_generate_content", side_effect=fake_generate_content),
            patch.object(generator, "_fetch_educational_images", side_effect=failing_image_fetch),
            patch.dict(
                "sys.modules",
                {
                    "prompts.loader": MagicMock(render_subject_prompt=MagicMock(return_value="p")),
                    "core.content.diagram_generator": MagicMock(
                        process_study_guide_sections=lambda s: s
                    ),
                    "services.api_client": MagicMock(
                        api_client=_MOCK_API_CLIENT,
                        get_language_instruction=MagicMock(return_value="English"),
                    ),
                },
            ),
        ):
            result = await generator.generate(
                _UNIT_DATA, _PLAN_DATA, ["study_guide"], language="en"
            )

        # Generation completed despite image failure
        assert "study_guide" in result
        assert result["study_guide"] == study_guide_payload


# ===========================================================================
# UnitContentGenerator.generate_unit_test
# ===========================================================================


class TestGenerateUnitTest:
    """Tests for UnitContentGenerator.generate_unit_test (async)."""

    def _make_generator(self) -> UnitContentGenerator:
        gen = UnitContentGenerator.__new__(UnitContentGenerator)
        gen.v3_config = _MOCK_MODEL_CONFIG
        gen.r1_config = _MOCK_MODEL_CONFIG
        return gen

    @pytest.mark.asyncio
    async def test_returns_parsed_quiz_json_on_success(self):
        """generate_unit_test returns parsed JSON dict when API succeeds."""
        generator = self._make_generator()
        quiz_payload = {"questions": [{"q": "Evaluate the limit", "a": "0"}]}

        with (
            patch.object(
                generator,
                "_generate_content",
                new=AsyncMock(return_value=quiz_payload),
            ),
            patch.dict(
                "sys.modules",
                {
                    "prompts.loader": MagicMock(render_subject_prompt=MagicMock(return_value="p")),
                    "services.api_client": MagicMock(
                        api_client=_MOCK_API_CLIENT,
                        get_language_instruction=MagicMock(return_value="English"),
                    ),
                },
            ),
        ):
            result = await generator.generate_unit_test(_UNIT_DATA, _PLAN_DATA, language="en")

        assert result == quiz_payload

    @pytest.mark.asyncio
    async def test_returns_none_on_api_failure(self):
        """generate_unit_test returns None when _generate_content returns None."""
        generator = self._make_generator()

        with (
            patch.object(
                generator,
                "_generate_content",
                new=AsyncMock(return_value=None),
            ),
            patch.dict(
                "sys.modules",
                {
                    "prompts.loader": MagicMock(render_subject_prompt=MagicMock(return_value="p")),
                    "services.api_client": MagicMock(
                        api_client=_MOCK_API_CLIENT,
                        get_language_instruction=MagicMock(return_value="English"),
                    ),
                },
            ),
        ):
            result = await generator.generate_unit_test(_UNIT_DATA, _PLAN_DATA, language="en")

        assert result is None
