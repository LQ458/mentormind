"""
Unit Tests – Subject Detector
==============================

Tests cover:
  • SubjectDetection dataclass construction with defaults
  • _detect_framework keyword matching
  • _detect_subject_scores hit counting
  • _infer_difficulty heuristic
  • _extract_topics keyword extraction (max 5)
  • _detect_ap_course catalog lookup
  • SubjectDetector.detect_fast keyword-only path
  • SubjectDetector.detect async: fast path hit (no API call)
  • SubjectDetector.detect async: LLM fallback (fast path miss)
  • SubjectDetector.detect async: LLM returns unparseable response -> graceful degradation
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# SubjectDetection dataclass
# ─────────────────────────────────────────────────────────────────────────────

class TestSubjectDetectionDataclass:

    def test_required_fields(self):
        from core.agents.subject_detector import SubjectDetection
        sd = SubjectDetection(
            subject="math",
            framework="ap",
            difficulty="intermediate",
            topics=["calculus"],
            confidence=0.9,
        )
        assert sd.subject == "math"
        assert sd.framework == "ap"
        assert sd.difficulty == "intermediate"
        assert sd.topics == ["calculus"]
        assert sd.confidence == 0.9

    def test_optional_fields_default_to_none(self):
        from core.agents.subject_detector import SubjectDetection
        sd = SubjectDetection(
            subject="physics",
            framework=None,
            difficulty="beginner",
            topics=[],
            confidence=0.7,
        )
        assert sd.course_id is None
        assert sd.course_name is None

    def test_optional_fields_set(self):
        from core.agents.subject_detector import SubjectDetection
        sd = SubjectDetection(
            subject="math",
            framework="ap",
            difficulty="advanced",
            topics=["derivatives"],
            confidence=0.95,
            course_id="ap_calculus_bc",
            course_name="AP Calculus BC",
        )
        assert sd.course_id == "ap_calculus_bc"
        assert sd.course_name == "AP Calculus BC"

    def test_topics_is_list(self):
        from core.agents.subject_detector import SubjectDetection
        sd = SubjectDetection(
            subject="cs",
            framework=None,
            difficulty="intermediate",
            topics=["algorithm", "recursion"],
            confidence=0.75,
        )
        assert isinstance(sd.topics, list)
        assert len(sd.topics) == 2


# ─────────────────────────────────────────────────────────────────────────────
# _detect_framework
# ─────────────────────────────────────────────────────────────────────────────

class TestDetectFramework:

    def test_ap_detected(self):
        from core.agents.subject_detector import _detect_framework
        assert _detect_framework("ap calculus") == "ap"

    def test_a_level_detected_with_space(self):
        from core.agents.subject_detector import _detect_framework
        assert _detect_framework("a level physics") == "a_level"

    def test_a_level_detected_with_hyphen(self):
        from core.agents.subject_detector import _detect_framework
        assert _detect_framework("a-level mathematics") == "a_level"

    def test_gaokao_detected_english(self):
        from core.agents.subject_detector import _detect_framework
        assert _detect_framework("gaokao math") == "gaokao"

    def test_gaokao_detected_chinese(self):
        from core.agents.subject_detector import _detect_framework
        assert _detect_framework("高考数学") == "gaokao"

    def test_ib_detected(self):
        from core.agents.subject_detector import _detect_framework
        # "ib " with trailing space matches the keyword
        assert _detect_framework("ib math hl") == "ib"

    def test_random_text_returns_none(self):
        from core.agents.subject_detector import _detect_framework
        assert _detect_framework("random text about nothing") is None

    def test_cambridge_returns_a_level(self):
        from core.agents.subject_detector import _detect_framework
        assert _detect_framework("cambridge chemistry") == "a_level"

    def test_advanced_placement_returns_ap(self):
        from core.agents.subject_detector import _detect_framework
        assert _detect_framework("advanced placement biology") == "ap"


# ─────────────────────────────────────────────────────────────────────────────
# _detect_subject_scores
# ─────────────────────────────────────────────────────────────────────────────

class TestDetectSubjectScores:

    def test_math_keywords_counted(self):
        from core.agents.subject_detector import _detect_subject_scores
        scores = _detect_subject_scores("calculus derivatives integrals")
        assert "math" in scores
        assert scores["math"] >= 3

    def test_no_keywords_returns_empty(self):
        from core.agents.subject_detector import _detect_subject_scores
        scores = _detect_subject_scores("hello world nothing here")
        assert scores == {}

    def test_mixed_input_hits_multiple_subjects(self):
        from core.agents.subject_detector import _detect_subject_scores
        # "cells" -> biology, "calculus" -> math
        scores = _detect_subject_scores("calculus cells genetics")
        assert "math" in scores
        assert "biology" in scores

    def test_physics_keywords_counted(self):
        from core.agents.subject_detector import _detect_subject_scores
        scores = _detect_subject_scores("mechanics kinematics thermodynamics")
        assert "physics" in scores
        assert scores["physics"] >= 3

    def test_chinese_keywords_counted(self):
        from core.agents.subject_detector import _detect_subject_scores
        scores = _detect_subject_scores("微积分 导数 积分")
        assert "math" in scores
        assert scores["math"] >= 3

    def test_single_keyword_counted(self):
        from core.agents.subject_detector import _detect_subject_scores
        scores = _detect_subject_scores("algorithm design")
        assert "cs" in scores
        assert scores["cs"] == 1


# ─────────────────────────────────────────────────────────────────────────────
# _infer_difficulty
# ─────────────────────────────────────────────────────────────────────────────

class TestInferDifficulty:

    def test_advanced_signal(self):
        from core.agents.subject_detector import _infer_difficulty
        assert _infer_difficulty("advanced calculus") == "advanced"

    def test_beginner_signal_basic(self):
        from core.agents.subject_detector import _infer_difficulty
        assert _infer_difficulty("basic intro algebra") == "beginner"

    def test_beginner_signal_intro(self):
        from core.agents.subject_detector import _infer_difficulty
        assert _infer_difficulty("introduction to chemistry") == "beginner"

    def test_neutral_returns_intermediate(self):
        from core.agents.subject_detector import _infer_difficulty
        assert _infer_difficulty("calculus") == "intermediate"

    def test_hard_returns_advanced(self):
        from core.agents.subject_detector import _infer_difficulty
        assert _infer_difficulty("hard math problems") == "advanced"

    def test_chinese_beginner_signal(self):
        from core.agents.subject_detector import _infer_difficulty
        assert _infer_difficulty("入门物理") == "beginner"

    def test_chinese_advanced_signal(self):
        from core.agents.subject_detector import _infer_difficulty
        assert _infer_difficulty("竞赛数学") == "advanced"

    def test_advanced_takes_priority_over_beginner(self):
        from core.agents.subject_detector import _infer_difficulty
        # "advanced" comes before "basic" in check order
        result = _infer_difficulty("advanced basic intro")
        assert result == "advanced"


# ─────────────────────────────────────────────────────────────────────────────
# _extract_topics
# ─────────────────────────────────────────────────────────────────────────────

class TestExtractTopics:

    def test_returns_matched_keywords(self):
        from core.agents.subject_detector import _extract_topics
        topics = _extract_topics("calculus derivatives integrals algebra", "math")
        assert "calculus" in topics
        assert "derivatives" in topics
        assert "integrals" in topics
        assert "algebra" in topics

    def test_max_five_topics(self):
        from core.agents.subject_detector import _extract_topics
        # math has more than 5 EN keywords; pass all of them
        text = "calculus algebra geometry trigonometry statistics derivatives integrals linear algebra"
        topics = _extract_topics(text, "math")
        assert len(topics) <= 5

    def test_no_match_returns_empty(self):
        from core.agents.subject_detector import _extract_topics
        topics = _extract_topics("nothing relevant here", "math")
        assert topics == []

    def test_unknown_subject_returns_empty(self):
        from core.agents.subject_detector import _extract_topics
        topics = _extract_topics("calculus derivatives", "nonexistent_subject")
        assert topics == []

    def test_chinese_keywords_extracted(self):
        from core.agents.subject_detector import _extract_topics
        topics = _extract_topics("微积分 导数 积分", "math")
        assert len(topics) >= 1


# ─────────────────────────────────────────────────────────────────────────────
# _detect_ap_course
# ─────────────────────────────────────────────────────────────────────────────

class TestDetectApCourse:

    def _patch_catalog(self, courses):
        """Patch _get_ap_catalog to return a controlled catalog."""
        return patch(
            "core.agents.subject_detector._get_ap_catalog",
            return_value={"courses": courses},
        )

    def test_known_pattern_returns_course(self):
        from core.agents.subject_detector import _detect_ap_course
        fake_course = {
            "id": "ap_calculus_bc",
            "name": "AP Calculus BC",
            "subject": "math",
            "units": ["Limits", "Derivatives", "Integrals"],
        }
        with self._patch_catalog([fake_course]):
            result = _detect_ap_course("ap calculus bc")
        assert result is not None
        assert result["id"] == "ap_calculus_bc"
        assert result["name"] == "AP Calculus BC"

    def test_unknown_text_returns_none(self):
        from core.agents.subject_detector import _detect_ap_course
        with self._patch_catalog([]):
            result = _detect_ap_course("random text with no ap course")
        assert result is None

    def test_course_id_missing_from_catalog_returns_none(self):
        from core.agents.subject_detector import _detect_ap_course
        # Pattern matches but catalog has no entry for that id
        with self._patch_catalog([]):
            result = _detect_ap_course("ap calculus bc derivatives")
        assert result is None

    def test_longest_pattern_wins(self):
        from core.agents.subject_detector import _detect_ap_course
        # "ap physics c mechanics" should match before "ap physics 1"
        fake_mech = {
            "id": "ap_physics_c_mechanics",
            "name": "AP Physics C: Mechanics",
            "subject": "physics",
            "units": ["Kinematics", "Dynamics"],
        }
        with self._patch_catalog([fake_mech]):
            result = _detect_ap_course("ap physics c mechanics")
        assert result is not None
        assert result["id"] == "ap_physics_c_mechanics"


# ─────────────────────────────────────────────────────────────────────────────
# SubjectDetector.detect_fast
# ─────────────────────────────────────────────────────────────────────────────

class TestDetectFast:

    def _detector(self):
        from core.agents.subject_detector import SubjectDetector
        return SubjectDetector()

    def _empty_catalog(self):
        return patch(
            "core.agents.subject_detector._get_ap_catalog",
            return_value={"courses": []},
        )

    def test_strong_math_input_returns_math(self):
        det = self._detector()
        with self._empty_catalog():
            result = det.detect_fast("calculus algebra geometry")
        assert result is not None
        assert result.subject == "math"
        assert result.confidence >= 0.6

    def test_ap_calculus_bc_input(self):
        det = self._detector()
        fake_course = {
            "id": "ap_calculus_bc",
            "name": "AP Calculus BC",
            "subject": "math",
            "units": ["Limits", "Derivatives", "Integrals", "Series", "Parametric"],
        }
        with patch(
            "core.agents.subject_detector._get_ap_catalog",
            return_value={"courses": [fake_course]},
        ):
            result = det.detect_fast("AP Calculus BC derivatives integrals")
        assert result is not None
        assert result.subject == "math"
        assert result.framework == "ap"
        assert result.confidence == 0.95
        assert result.course_id == "ap_calculus_bc"

    def test_vague_single_word_returns_none(self):
        det = self._detector()
        with self._empty_catalog():
            result = det.detect_fast("homework")
        assert result is None

    def test_chinese_math_keywords_detected(self):
        det = self._detector()
        with self._empty_catalog():
            result = det.detect_fast("微积分 导数 积分")
        assert result is not None
        assert result.subject == "math"

    def test_ap_physics_c_mechanics_sets_course_id(self):
        det = self._detector()
        fake_course = {
            "id": "ap_physics_c_mechanics",
            "name": "AP Physics C: Mechanics",
            "subject": "physics",
            "units": ["Kinematics", "Dynamics", "Energy", "Rotation", "Oscillation"],
        }
        with patch(
            "core.agents.subject_detector._get_ap_catalog",
            return_value={"courses": [fake_course]},
        ):
            result = det.detect_fast("ap physics c mechanics")
        assert result is not None
        assert result.course_id == "ap_physics_c_mechanics"
        assert result.confidence == 0.95

    def test_confidence_below_threshold_returns_none(self):
        det = self._detector()
        with self._empty_catalog():
            # A single keyword that is ambiguous (appears in multiple subjects or only 1 hit
            # with competing subjects) — rely on tie scenario producing confidence=0.5
            result = det.detect_fast("history cells")  # 1 history hit + 1 biology hit -> tie
        assert result is None

    def test_framework_detected_in_result(self):
        det = self._detector()
        with self._empty_catalog():
            result = det.detect_fast("gaokao calculus algebra geometry trigonometry")
        assert result is not None
        assert result.framework == "gaokao"

    def test_difficulty_advanced_detected(self):
        det = self._detector()
        with self._empty_catalog():
            result = det.detect_fast("advanced calculus algebra geometry")
        assert result is not None
        assert result.difficulty == "advanced"

    def test_topics_list_populated(self):
        det = self._detector()
        with self._empty_catalog():
            result = det.detect_fast("calculus derivatives integrals algebra")
        assert result is not None
        assert isinstance(result.topics, list)
        assert len(result.topics) > 0

    def test_two_hit_subject_returns_0_75_confidence(self):
        det = self._detector()
        with self._empty_catalog():
            result = det.detect_fast("calculus algebra")
        assert result is not None
        assert result.confidence == 0.75

    def test_one_hit_single_subject_returns_0_65_confidence(self):
        det = self._detector()
        with self._empty_catalog():
            result = det.detect_fast("calculus")
        assert result is not None
        assert result.confidence == 0.65


# ─────────────────────────────────────────────────────────────────────────────
# SubjectDetector.detect (async)
# ─────────────────────────────────────────────────────────────────────────────

class TestDetectAsync:

    def _detector(self):
        from core.agents.subject_detector import SubjectDetector
        return SubjectDetector()

    def _make_llm_response(self, content: str):
        """Build a mock APIResponse object whose .data matches the expected shape."""
        from services.api_client import APIResponse
        return APIResponse(
            success=True,
            data={
                "choices": [
                    {"message": {"content": content}}
                ]
            },
            status_code=200,
        )

    @pytest.mark.asyncio
    async def test_fast_path_success_no_api_call(self):
        """When detect_fast returns a result, no LLM call should be made."""
        det = self._detector()
        fake_course = {
            "id": "ap_calculus_bc",
            "name": "AP Calculus BC",
            "subject": "math",
            "units": ["Limits", "Derivatives", "Integrals", "Series", "Parametric"],
        }
        mock_chat = AsyncMock()

        with patch("core.agents.subject_detector._get_ap_catalog", return_value={"courses": [fake_course]}), \
             patch("services.api_client.api_client") as mock_client:
            mock_client.deepseek.chat_completion = mock_chat
            result = await det.detect("AP Calculus BC derivatives integrals", language="en")

        mock_chat.assert_not_called()
        assert result is not None
        assert result.subject == "math"
        assert result.course_id == "ap_calculus_bc"

    @pytest.mark.asyncio
    async def test_fast_path_miss_triggers_llm_fallback(self):
        """When detect_fast returns None, the LLM should be called."""
        det = self._detector()
        llm_payload = json.dumps({
            "subject": "physics",
            "framework": None,
            "difficulty": "intermediate",
            "topics": ["quantum", "waves"],
            "course_name": None,
        })
        llm_response = self._make_llm_response(llm_payload)

        with patch("core.agents.subject_detector._get_ap_catalog", return_value={"courses": []}), \
             patch("core.agents.subject_detector.api_client") as mock_client, \
             patch("core.agents.subject_detector.get_language_instruction", return_value="Respond in English."):
            mock_client.deepseek.chat_completion = AsyncMock(return_value=llm_response)
            result = await det.detect("something completely vague xyz", language="en")

        mock_client.deepseek.chat_completion.assert_called_once()
        assert result is not None
        assert result.subject == "physics"
        assert result.confidence == 0.85

    @pytest.mark.asyncio
    async def test_llm_fallback_parses_json_correctly(self):
        """LLM response parsed into correct SubjectDetection fields."""
        det = self._detector()
        llm_payload = json.dumps({
            "subject": "chemistry",
            "framework": "ib",
            "difficulty": "advanced",
            "topics": ["organic", "reactions"],
            "course_name": None,
        })
        llm_response = self._make_llm_response(llm_payload)

        with patch("core.agents.subject_detector._get_ap_catalog", return_value={"courses": []}), \
             patch("core.agents.subject_detector.api_client") as mock_client, \
             patch("core.agents.subject_detector.get_language_instruction", return_value="Respond in English."):
            mock_client.deepseek.chat_completion = AsyncMock(return_value=llm_response)
            result = await det.detect("something vague xyz abc", language="en")

        assert result.subject == "chemistry"
        assert result.framework == "ib"
        assert result.difficulty == "advanced"
        assert "organic" in result.topics
        assert result.confidence == 0.85

    @pytest.mark.asyncio
    async def test_llm_returns_unparseable_response_graceful_degradation(self):
        """Unparseable LLM content returns safe default (general, confidence=0.3)."""
        det = self._detector()
        llm_response = self._make_llm_response("This is not valid JSON at all!!!")

        with patch("core.agents.subject_detector._get_ap_catalog", return_value={"courses": []}), \
             patch("core.agents.subject_detector.api_client") as mock_client, \
             patch("core.agents.subject_detector.get_language_instruction", return_value="Respond in English."):
            mock_client.deepseek.chat_completion = AsyncMock(return_value=llm_response)
            result = await det.detect("something vague xyz abc", language="en")

        assert result.subject == "general"
        assert result.framework is None
        assert result.confidence == 0.3
        assert result.topics == []

    @pytest.mark.asyncio
    async def test_llm_response_with_markdown_fences_parsed(self):
        """LLM response wrapped in ```json``` fences is stripped and parsed."""
        det = self._detector()
        inner = json.dumps({
            "subject": "biology",
            "framework": None,
            "difficulty": "beginner",
            "topics": ["cells", "genetics"],
            "course_name": None,
        })
        fenced_content = f"```json\n{inner}\n```"
        llm_response = self._make_llm_response(fenced_content)

        with patch("core.agents.subject_detector._get_ap_catalog", return_value={"courses": []}), \
             patch("core.agents.subject_detector.api_client") as mock_client, \
             patch("core.agents.subject_detector.get_language_instruction", return_value="Respond in English."):
            mock_client.deepseek.chat_completion = AsyncMock(return_value=llm_response)
            result = await det.detect("something vague xyz abc", language="en")

        assert result.subject == "biology"
        assert result.difficulty == "beginner"
        assert result.confidence == 0.85

    @pytest.mark.asyncio
    async def test_llm_resolves_course_name_to_course_id(self):
        """When LLM returns a course_name matching the catalog, course_id is resolved."""
        det = self._detector()
        fake_course = {
            "id": "ap_biology",
            "name": "AP Biology",
            "subject": "biology",
            "units": ["Cells", "Genetics", "Evolution"],
        }
        llm_payload = json.dumps({
            "subject": "biology",
            "framework": "ap",
            "difficulty": "intermediate",
            "topics": ["cells"],
            "course_name": "AP Biology",
        })
        llm_response = self._make_llm_response(llm_payload)

        with patch("core.agents.subject_detector._get_ap_catalog", return_value={"courses": [fake_course]}), \
             patch("core.agents.subject_detector.api_client") as mock_client, \
             patch("core.agents.subject_detector.get_language_instruction", return_value="Respond in English."):
            mock_client.deepseek.chat_completion = AsyncMock(return_value=llm_response)
            result = await det.detect("something vague xyz abc", language="en")

        assert result.course_id == "ap_biology"
        assert result.course_name == "AP Biology"
