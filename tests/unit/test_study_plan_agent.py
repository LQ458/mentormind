"""
Unit tests for backend/core/agents/study_plan_agent.py

Imports use the sys.path insertion in tests/conftest.py which adds backend/ to
sys.path, so all imports are relative to the backend package root.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Module-level patches: config and api_client must be mocked BEFORE the
# study_plan_agent module is imported, because it performs top-level imports
# of both.  We use sys.modules injection so the real modules are never loaded.
# ---------------------------------------------------------------------------

# Minimal config mock
_mock_config = MagicMock()
_mock_config.get_models.return_value = {
    "deepseek_v3": {"model": "deepseek-chat", "api_key": "test"}
}

# Minimal api_client mock (async chat_completion)
_mock_api_client = MagicMock()
_mock_api_client.deepseek = MagicMock()
_mock_api_client.deepseek.chat_completion = AsyncMock()

_mock_get_language_instruction = MagicMock(return_value="Respond in English.")

# Use scoped patch.dict so we don't permanently pollute sys.modules
# (which would break test_config.py's import of config.config)
_services_api_client_mod = MagicMock()
_services_api_client_mod.api_client = _mock_api_client
_services_api_client_mod.get_language_instruction = _mock_get_language_instruction

with patch.dict(
    "sys.modules",
    {
        "config": MagicMock(config=_mock_config),
        "services.api_client": _services_api_client_mod,
    },
):
    from core.agents.study_plan_agent import (  # noqa: E402
        PlanResponse,
        PlanStage,
        StudyPlanAgent,
        _count_diagnostic_turns,
        _detection_to_dict,
        _wants_to_start,
    )
    from core.agents.subject_detector import SubjectDetection  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_mock_api_client():
    """Reset shared mock state before each test to prevent ordering leaks."""
    _mock_api_client.reset_mock()
    _mock_api_client.deepseek = MagicMock()
    _mock_api_client.deepseek.chat_completion = AsyncMock()
    _mock_get_language_instruction.reset_mock()
    _mock_get_language_instruction.return_value = "Respond in English."
    yield


def _make_llm_response(content: str) -> MagicMock:
    """Build a mock object that mimics api_client response shape."""
    mock_resp = MagicMock()
    mock_resp.data = {
        "choices": [{"message": {"content": content}}]
    }
    return mock_resp


def _make_detection(
    subject: str = "math",
    framework: str | None = "ap",
    difficulty: str = "intermediate",
    topics: List[str] | None = None,
    confidence: float = 0.9,
    course_id: str | None = "ap_calculus_bc",
    course_name: str | None = "AP Calculus BC",
) -> SubjectDetection:
    return SubjectDetection(
        subject=subject,
        framework=framework,
        difficulty=difficulty,
        topics=topics or ["limits", "derivatives"],
        confidence=confidence,
        course_id=course_id,
        course_name=course_name,
    )


def _make_agent() -> StudyPlanAgent:
    """Create a StudyPlanAgent with a mocked SubjectDetector."""
    with patch("core.agents.study_plan_agent.config", _mock_config):
        agent = StudyPlanAgent()
    agent.subject_detector = MagicMock()
    agent.subject_detector.detect = AsyncMock(return_value=_make_detection())
    return agent


# ---------------------------------------------------------------------------
# 1. PlanStage and PlanResponse
# ---------------------------------------------------------------------------

class TestPlanStageEnum:
    def test_has_four_values(self):
        assert len(PlanStage) == 4

    def test_expected_values(self):
        names = {s.name for s in PlanStage}
        assert names == {"OPENING", "DIAGNOSTIC", "PLAN_REVIEW", "LOCKED"}


class TestPlanResponseDataclass:
    def test_construction_required_fields(self):
        r = PlanResponse(stage=PlanStage.OPENING, content="Hello")
        assert r.stage == PlanStage.OPENING
        assert r.content == "Hello"

    def test_optional_fields_default_to_none(self):
        r = PlanResponse(stage=PlanStage.OPENING, content="Hello")
        assert r.thinking_process is None
        assert r.proposed_plan is None
        assert r.diagnostic_question is None
        assert r.next_action_label is None
        assert r.detected_subject is None

    def test_construction_with_all_fields(self):
        plan = {"title": "My Plan", "units": []}
        r = PlanResponse(
            stage=PlanStage.PLAN_REVIEW,
            content="Here's your plan",
            thinking_process="Thinking...",
            proposed_plan=plan,
            diagnostic_question="How many weeks?",
            next_action_label="Let's go!",
            detected_subject={"subject": "math"},
        )
        assert r.proposed_plan == plan
        assert r.detected_subject == {"subject": "math"}


# ---------------------------------------------------------------------------
# 2. _wants_to_start
# ---------------------------------------------------------------------------

class TestWantsToStart:
    def test_just_start_returns_true(self):
        assert _wants_to_start("just start") is True

    def test_generate_returns_true(self):
        assert _wants_to_start("generate") is True

    def test_chinese_start_signal_returns_true(self):
        assert _wants_to_start("开始") is True

    def test_unrelated_text_returns_false(self):
        assert _wants_to_start("hello there") is False

    def test_case_insensitive_just_start(self):
        assert _wants_to_start("Just Start") is True

    def test_go_returns_true(self):
        assert _wants_to_start("go") is True

    def test_begin_returns_true(self):
        assert _wants_to_start("begin") is True

    def test_proceed_returns_true(self):
        assert _wants_to_start("proceed") is True

    def test_empty_string_returns_false(self):
        assert _wants_to_start("") is False

    def test_random_sentence_returns_false(self):
        assert _wants_to_start("I have a question about derivatives") is False


# ---------------------------------------------------------------------------
# 3. _count_diagnostic_turns
# ---------------------------------------------------------------------------

class TestCountDiagnosticTurns:
    def test_empty_history_returns_zero(self):
        assert _count_diagnostic_turns([]) == 0

    def test_no_assistant_messages_returns_zero(self):
        history = [
            {"role": "user", "content": "Hello"},
            {"role": "user", "content": "What do I do?"},
        ]
        assert _count_diagnostic_turns(history) == 0

    def test_two_assistant_messages_returns_two(self):
        history = [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Question 1"},
            {"role": "user", "content": "Answer 1"},
            {"role": "assistant", "content": "Question 2"},
        ]
        assert _count_diagnostic_turns(history) == 2

    def test_mixed_messages_counted_correctly(self):
        history = [
            {"role": "user", "content": "I'm studying AP Calculus"},
            {"role": "assistant", "content": "Great! Question 1"},
            {"role": "user", "content": "I know basic derivatives"},
            {"role": "assistant", "content": "Question 2"},
            {"role": "user", "content": "I have 8 weeks"},
            {"role": "assistant", "content": "Question 3"},
        ]
        assert _count_diagnostic_turns(history) == 3

    def test_only_assistant_messages(self):
        history = [
            {"role": "assistant", "content": "Q1"},
            {"role": "assistant", "content": "Q2"},
        ]
        assert _count_diagnostic_turns(history) == 2


# ---------------------------------------------------------------------------
# 4. _detection_to_dict
# ---------------------------------------------------------------------------

class TestDetectionToDict:
    def test_converts_all_fields(self):
        detection = _make_detection()
        result = _detection_to_dict(detection)
        assert result == {
            "subject": "math",
            "framework": "ap",
            "difficulty": "intermediate",
            "topics": ["limits", "derivatives"],
            "confidence": 0.9,
            "course_id": "ap_calculus_bc",
            "course_name": "AP Calculus BC",
        }

    def test_none_framework_preserved(self):
        detection = _make_detection(framework=None, course_id=None, course_name=None)
        result = _detection_to_dict(detection)
        assert result["framework"] is None
        assert result["course_id"] is None
        assert result["course_name"] is None

    def test_returns_dict_type(self):
        detection = _make_detection()
        result = _detection_to_dict(detection)
        assert isinstance(result, dict)


# ---------------------------------------------------------------------------
# 5. StudyPlanAgent.get_next_response  (async, mocked API)
# ---------------------------------------------------------------------------

class TestStudyPlanAgentGetNextResponse:

    # -----------------------------------------------------------------------
    # OPENING stage
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_opening_no_user_input_returns_opening_prompt(self):
        agent = _make_agent()
        # Empty history — no user message
        response = await agent.get_next_response([], PlanStage.OPENING, language="en")
        assert response.stage == PlanStage.OPENING
        assert "subject" in response.content.lower() or "preparing" in response.content.lower()

    @pytest.mark.asyncio
    async def test_opening_no_input_assistant_last_returns_opening(self):
        """If the last message in history is from assistant, stay in opening."""
        agent = _make_agent()
        history = [{"role": "assistant", "content": "What subject?"}]
        response = await agent.get_next_response(history, PlanStage.OPENING, language="en")
        assert response.stage == PlanStage.OPENING

    @pytest.mark.asyncio
    async def test_opening_with_user_input_detects_subject_moves_to_diagnostic(self):
        agent = _make_agent()
        # Provide a diagnostic-style LLM response
        _mock_api_client.deepseek.chat_completion = AsyncMock(
            return_value=_make_llm_response("Great! Can you solve basic derivatives?")
        )
        history = [{"role": "user", "content": "AP Calculus BC"}]
        response = await agent.get_next_response(history, PlanStage.OPENING, language="en")
        # Subject detection should have been called
        agent.subject_detector.detect.assert_called_once()
        # Stage transitions to DIAGNOSTIC
        assert response.stage == PlanStage.DIAGNOSTIC

    # -----------------------------------------------------------------------
    # DIAGNOSTIC stage
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_diagnostic_first_turn_asks_question_via_llm(self):
        agent = _make_agent()
        agent._cached_detection = _make_detection()
        _mock_api_client.deepseek.chat_completion = AsyncMock(
            return_value=_make_llm_response("Can you solve basic integrals?")
        )
        history = [{"role": "user", "content": "AP Calculus BC"}]
        response = await agent.get_next_response(history, PlanStage.DIAGNOSTIC, language="en")
        assert response.stage == PlanStage.DIAGNOSTIC
        assert response.content == "Can you solve basic integrals?"
        assert response.diagnostic_question == "Can you solve basic integrals?"
        _mock_api_client.deepseek.chat_completion.assert_called_once()

    @pytest.mark.asyncio
    async def test_diagnostic_after_3_turns_auto_advances_to_plan_review(self):
        agent = _make_agent()
        agent._cached_detection = _make_detection()
        plan_json = json.dumps({"title": "AP Calculus BC Mastery", "units": [{"title": "Limits"}]})
        plan_content = f"Here's your plan!\n\n```json\n{plan_json}\n```"
        _mock_api_client.deepseek.chat_completion = AsyncMock(
            return_value=_make_llm_response(plan_content)
        )
        # 3 assistant messages in history → auto-advance
        history = [
            {"role": "user", "content": "AP Calculus BC"},
            {"role": "assistant", "content": "Q1"},
            {"role": "user", "content": "A1"},
            {"role": "assistant", "content": "Q2"},
            {"role": "user", "content": "A2"},
            {"role": "assistant", "content": "Q3"},
            {"role": "user", "content": "A3"},
        ]
        response = await agent.get_next_response(history, PlanStage.DIAGNOSTIC, language="en")
        assert response.stage == PlanStage.PLAN_REVIEW

    @pytest.mark.asyncio
    async def test_diagnostic_start_signal_jumps_to_plan_review(self):
        agent = _make_agent()
        agent._cached_detection = _make_detection()
        plan_json = json.dumps({"title": "AP Calc", "units": []})
        plan_content = f"Sure!\n\n```json\n{plan_json}\n```"
        _mock_api_client.deepseek.chat_completion = AsyncMock(
            return_value=_make_llm_response(plan_content)
        )
        history = [
            {"role": "user", "content": "AP Calculus BC"},
            {"role": "assistant", "content": "Q1"},
            {"role": "user", "content": "just start"},
        ]
        response = await agent.get_next_response(history, PlanStage.DIAGNOSTIC, language="en")
        assert response.stage == PlanStage.PLAN_REVIEW

    # -----------------------------------------------------------------------
    # PLAN_REVIEW stage
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_plan_review_generates_plan_parses_json_block(self):
        agent = _make_agent()
        agent._cached_detection = _make_detection()
        plan_dict = {"title": "AP Calculus BC Mastery", "units": [{"title": "Limits"}]}
        plan_content = f"Here's your plan!\n\n```json\n{json.dumps(plan_dict)}\n```"
        _mock_api_client.deepseek.chat_completion = AsyncMock(
            return_value=_make_llm_response(plan_content)
        )
        history = [
            {"role": "user", "content": "AP Calculus BC"},
            {"role": "user", "content": "I have 8 weeks"},
        ]
        response = await agent.get_next_response(history, PlanStage.PLAN_REVIEW, language="en")
        assert response.stage == PlanStage.PLAN_REVIEW
        assert response.proposed_plan == plan_dict
        assert response.thinking_process == "Here's your plan!"
        assert response.next_action_label is not None

    @pytest.mark.asyncio
    async def test_plan_review_malformed_json_proposed_plan_is_none(self):
        agent = _make_agent()
        agent._cached_detection = _make_detection()
        bad_content = "Here's your plan!\n\n```json\n{this is not valid json\n```"
        _mock_api_client.deepseek.chat_completion = AsyncMock(
            return_value=_make_llm_response(bad_content)
        )
        history = [{"role": "user", "content": "AP Calculus BC"}]
        response = await agent.get_next_response(history, PlanStage.PLAN_REVIEW, language="en")
        assert response.stage == PlanStage.PLAN_REVIEW
        assert response.proposed_plan is None

    @pytest.mark.asyncio
    async def test_plan_review_no_json_block_proposed_plan_is_none(self):
        agent = _make_agent()
        agent._cached_detection = _make_detection()
        plain_content = "I'll create a study plan for you based on your responses."
        _mock_api_client.deepseek.chat_completion = AsyncMock(
            return_value=_make_llm_response(plain_content)
        )
        history = [{"role": "user", "content": "AP Calculus BC"}]
        response = await agent.get_next_response(history, PlanStage.PLAN_REVIEW, language="en")
        assert response.proposed_plan is None
        assert response.thinking_process == plain_content

    # -----------------------------------------------------------------------
    # LOCKED stage
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_locked_go_signal_returns_saving_message(self):
        # Note: "go" is also in _START_SIGNALS, so get_next_response fast-paths to
        # _handle_plan_review. Test via _handle_co_creation directly to verify the
        # LOCKED branch itself, and use "ok" (not a start signal) via get_next_response.
        agent = _make_agent()
        agent._cached_detection = _make_detection()
        # "ok" is in the co-creation confirmation words but NOT in _START_SIGNALS
        history = [{"role": "user", "content": "ok"}]
        response = await agent.get_next_response(history, PlanStage.LOCKED, language="en")
        assert response.stage == PlanStage.LOCKED
        assert "saving" in response.content.lower() or "perfect" in response.content.lower()

    @pytest.mark.asyncio
    async def test_locked_co_creation_direct_go_keyword(self):
        """_handle_co_creation itself returns LOCKED for 'go'; the fast-path in
        get_next_response intercepts 'go' and calls _handle_plan_review instead."""
        agent = _make_agent()
        agent._cached_detection = _make_detection()
        plan_dict = {"title": "AP Calc", "units": []}
        plan_content = f"Plan!\n\n```json\n{json.dumps(plan_dict)}\n```"
        _mock_api_client.deepseek.chat_completion = AsyncMock(
            return_value=_make_llm_response(plan_content)
        )
        # "go" triggers the start-signal fast-path → _handle_plan_review → PLAN_REVIEW
        history = [{"role": "user", "content": "go"}]
        response = await agent.get_next_response(history, PlanStage.LOCKED, language="en")
        assert response.stage == PlanStage.PLAN_REVIEW

    @pytest.mark.asyncio
    async def test_locked_yes_signal_returns_saving_message(self):
        agent = _make_agent()
        # "yes" is not in _START_SIGNALS so it reaches _handle_co_creation
        history = [{"role": "user", "content": "yes"}]
        response = await agent.get_next_response(history, PlanStage.LOCKED, language="en")
        assert response.stage == PlanStage.LOCKED

    @pytest.mark.asyncio
    async def test_locked_without_go_signal_regenerates_plan(self):
        agent = _make_agent()
        agent._cached_detection = _make_detection()
        plan_dict = {"title": "Revised Plan", "units": []}
        plan_content = f"Updated plan!\n\n```json\n{json.dumps(plan_dict)}\n```"
        _mock_api_client.deepseek.chat_completion = AsyncMock(
            return_value=_make_llm_response(plan_content)
        )
        history = [
            {"role": "user", "content": "AP Calculus BC"},
            {"role": "user", "content": "Can you make more units?"},
        ]
        response = await agent.get_next_response(history, PlanStage.LOCKED, language="en")
        # Should re-generate — falls through to _handle_plan_review
        assert response.stage == PlanStage.PLAN_REVIEW
        assert response.proposed_plan == plan_dict

    # -----------------------------------------------------------------------
    # Language variants
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_opening_chinese_language_returns_chinese_content(self):
        agent = _make_agent()
        response = await agent.get_next_response([], PlanStage.OPENING, language="zh")
        assert response.stage == PlanStage.OPENING
        # Chinese prompt should contain Chinese characters
        assert any(ord(c) > 127 for c in response.content)

    @pytest.mark.asyncio
    async def test_locked_go_chinese_language_returns_chinese_saving_message(self):
        agent = _make_agent()
        # Use "fine" which is in the co-creation confirmation words but not _START_SIGNALS
        history = [{"role": "user", "content": "fine"}]
        response = await agent.get_next_response(history, PlanStage.LOCKED, language="zh")
        assert response.stage == PlanStage.LOCKED
        # Chinese saving message should contain Chinese characters
        assert any(ord(c) > 127 for c in response.content)

    # -----------------------------------------------------------------------
    # detected_subject propagation
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_diagnostic_response_includes_detected_subject(self):
        agent = _make_agent()
        detection = _make_detection()
        agent._cached_detection = detection
        _mock_api_client.deepseek.chat_completion = AsyncMock(
            return_value=_make_llm_response("What are your weakest units?")
        )
        history = [{"role": "user", "content": "AP Calculus BC"}]
        response = await agent.get_next_response(history, PlanStage.DIAGNOSTIC, language="en")
        assert response.detected_subject is not None
        assert response.detected_subject["subject"] == "math"
        assert response.detected_subject["framework"] == "ap"

    @pytest.mark.asyncio
    async def test_plan_review_response_includes_detected_subject(self):
        agent = _make_agent()
        detection = _make_detection()
        agent._cached_detection = detection
        plan_dict = {"title": "AP Calculus BC Mastery", "units": []}
        plan_content = f"Plan!\n\n```json\n{json.dumps(plan_dict)}\n```"
        _mock_api_client.deepseek.chat_completion = AsyncMock(
            return_value=_make_llm_response(plan_content)
        )
        history = [{"role": "user", "content": "AP Calculus BC"}]
        response = await agent.get_next_response(history, PlanStage.PLAN_REVIEW, language="en")
        assert response.detected_subject is not None
        assert response.detected_subject["course_name"] == "AP Calculus BC"
