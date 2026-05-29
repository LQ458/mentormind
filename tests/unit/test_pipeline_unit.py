"""
Unit Tests – RobustVideoGenerationPipeline
==========================================

Tests the internal methods of the pipeline without hitting any real APIs.
All external I/O is mocked via pytest fixtures and unittest.mock.
"""

from __future__ import annotations

import json
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def pipeline():
    from core.modules.robust_video_generation import RobustVideoGenerationPipeline

    client = MagicMock()
    client.deepseek = MagicMock()

    with patch("prompts.loader.load_prompt", return_value="mock"), \
         patch("prompts.loader.render_prompt", return_value="rendered_prompt"):
        instance = RobustVideoGenerationPipeline(api_client=client)
        # ContentCache is a process-wide singleton with disk persistence; its
        # results would leak across tests (a successful syllabus generation in
        # one test would short-circuit a fallback assertion in the next). Tests
        # exercise pipeline logic in isolation, so the cache must be off.
        instance.cache = None
        return instance


def _ok_response(payload: dict):
    """Build a successful APIResponse for a given JSON payload."""
    from services.api_client import APIResponse
    return APIResponse(
        success=True,
        data={"choices": [{"message": {"content": json.dumps(payload)}}]},
        status_code=200,
    )


def _fail_response(error="API error"):
    from services.api_client import APIResponse
    return APIResponse(success=False, error=error, status_code=500)


# ─────────────────────────────────────────────────────────────────────────────
# _normalize_action
# ─────────────────────────────────────────────────────────────────────────────

class TestNormalizeAction:

    @pytest.mark.parametrize("action", [
        "show_title", "show_text", "write_tex", "plot", "transform", "draw_shape",
    ])
    def test_valid_actions_preserved(self, pipeline, action):
        assert pipeline._normalize_action(action) == action

    @pytest.mark.parametrize("bad", [None, "", "SHOW_TEXT", "fly_in", 0, "animate"])
    def test_invalid_actions_become_show_text(self, pipeline, bad):
        assert pipeline._normalize_action(bad) == "show_text"

    def test_whitespace_stripped_before_comparison(self, pipeline):
        assert pipeline._normalize_action("  plot  ") == "plot"

    def test_case_insensitive_lowercasing(self, pipeline):
        # _normalize_action lowercases first, so "WRITE_TEX" → "write_tex" (valid)
        assert pipeline._normalize_action("WRITE_TEX") == "write_tex"
        # A nonsense action that is still not in the set after lowercasing → fallback
        assert pipeline._normalize_action("UNKNOWN_ACTION") == "show_text"


# ─────────────────────────────────────────────────────────────────────────────
# _normalize_layout
# ─────────────────────────────────────────────────────────────────────────────

class TestNormalizeLayout:

    @pytest.mark.parametrize("layout", [
        "title_card", "equation_focus", "graph_focus",
        "two_column", "callout_card", "recap_card",
    ])
    def test_valid_layouts_preserved(self, pipeline, layout):
        assert pipeline._normalize_layout(layout, "show_text") == layout

    @pytest.mark.parametrize("action,expected", [
        ("show_title", "title_card"),
        ("plot",       "graph_focus"),
        ("write_tex",  "equation_focus"),
        ("transform",  "equation_focus"),
        ("show_text",  "callout_card"),
        ("draw_shape", "callout_card"),
    ])
    def test_action_driven_layout_inference(self, pipeline, action, expected):
        assert pipeline._normalize_layout("garbage", action) == expected

    def test_none_layout_inferred_from_action(self, pipeline):
        assert pipeline._normalize_layout(None, "plot") == "graph_focus"


# ─────────────────────────────────────────────────────────────────────────────
# _normalize_duration
# ─────────────────────────────────────────────────────────────────────────────

class TestNormalizeDuration:

    narration = "Standard narration text used consistently across duration tests."

    @pytest.mark.parametrize("raw,lo,hi", [
        (0,     18.0, 60.0),   # zero → estimates from narration (24–55 s)
        (-99,   18.0, 60.0),   # negative → estimates from narration
        (30,    30.0, 30.0),
        (999,   60.0, 60.0),
        (18,    18.0, 18.0),
        (60,    60.0, 60.0),
        (18.0,  18.0, 18.0),
        (60.0,  60.0, 60.0),
    ])
    def test_clamp_behavior(self, pipeline, raw, lo, hi):
        result = pipeline._normalize_duration(raw, self.narration)
        assert lo <= result <= hi

    def test_string_number_parsed(self, pipeline):
        result = pipeline._normalize_duration("35", self.narration)
        assert result == 35.0

    def test_non_numeric_falls_back_to_narration_estimate(self, pipeline):
        result = pipeline._normalize_duration("not_a_number", self.narration)
        assert 18.0 <= result <= 60.0

    def test_rounded_to_one_decimal(self, pipeline):
        result = pipeline._normalize_duration(25.123456, self.narration)
        assert result == round(result, 1)


# ─────────────────────────────────────────────────────────────────────────────
# _estimate_duration_from_narration
# ─────────────────────────────────────────────────────────────────────────────

class TestEstimateDuration:

    def test_empty_narration_returns_minimum(self, pipeline):
        assert pipeline._estimate_duration_from_narration("") >= 24.0

    def test_short_narration_not_below_24(self, pipeline):
        assert pipeline._estimate_duration_from_narration("Hi") >= 24.0

    def test_very_long_narration_capped_at_55(self, pipeline):
        long = "word " * 400
        assert pipeline._estimate_duration_from_narration(long) <= 55.0

    def test_moderate_narration_sensible_range(self, pipeline):
        text = "This is a typical teaching narration with around thirty words total to read."
        result = pipeline._estimate_duration_from_narration(text)
        assert 24.0 <= result <= 55.0


# ─────────────────────────────────────────────────────────────────────────────
# _sanitize_plot_expression
# ─────────────────────────────────────────────────────────────────────────────

class TestSanitizePlotExpression:

    @pytest.mark.parametrize("raw,expected", [
        ("x**2",            "x**2"),
        ("x^2",             "x**2"),
        ("sin(x)",          "sin(x)"),
        ("",                "x"),
        ("  ",              "x"),
        # Allowed chars: [0-9a-zA-Z_+\-*/(). ] — semicolon stripped, / and space kept
        ("x; rm -rf /",    "x rm -rf /"),
        # Underscore, parens, letters all allowed; single-quote stripped
        ("__import__('os')", "__import__(os)"),
    ])
    def test_parametrized_cases(self, pipeline, raw, expected):
        assert pipeline._sanitize_plot_expression(raw) == expected

    def test_result_matches_safe_pattern(self, pipeline):
        import re
        safe_re = re.compile(r"^[0-9a-zA-Z_+\-*/(). ]+$")
        for expr in ["x**2", "sin(x)", "log(x)", "x + 1", "2*x - 3"]:
            result = pipeline._sanitize_plot_expression(expr)
            assert safe_re.match(result), f"Unsafe result: {result!r}"


# ─────────────────────────────────────────────────────────────────────────────
# _compact_text
# ─────────────────────────────────────────────────────────────────────────────

class TestCompactText:

    def test_short_text_unchanged(self, pipeline):
        text = "Hello world"
        assert pipeline._compact_text(text, 50) == text

    def test_long_text_truncated_with_ellipsis(self, pipeline):
        text = "a" * 200
        result = pipeline._compact_text(text, 50)
        assert len(result) == 50
        assert result.endswith("...")

    def test_whitespace_collapsed(self, pipeline):
        text = "word   word\n\nword\t\tword"
        result = pipeline._compact_text(text, 1000)
        assert "  " not in result
        assert "\n" not in result
        assert "\t" not in result

    def test_none_handled_safely(self, pipeline):
        result = pipeline._compact_text(None, 50)
        assert isinstance(result, str)
        assert len(result) <= 50


# ─────────────────────────────────────────────────────────────────────────────
# _normalize_range
# ─────────────────────────────────────────────────────────────────────────────

class TestNormalizeRange:

    def test_valid_range_returned_as_ints(self, pipeline):
        result = pipeline._normalize_range([-10.0, 10.0], [-6, 6])
        assert result == [-10, 10]
        assert all(isinstance(v, int) for v in result)

    def test_invalid_range_returns_fallback(self, pipeline):
        assert pipeline._normalize_range("bad",  [-6, 6]) == [-6, 6]
        assert pipeline._normalize_range(None,   [-6, 6]) == [-6, 6]
        assert pipeline._normalize_range([5, 3], [-6, 6]) == [-6, 6]  # lo >= hi
        assert pipeline._normalize_range([1],    [-6, 6]) == [-6, 6]  # wrong length

    def test_equal_bounds_returns_fallback(self, pipeline):
        assert pipeline._normalize_range([5, 5], [-6, 6]) == [-6, 6]


# ─────────────────────────────────────────────────────────────────────────────
# _contains_non_ascii
# ─────────────────────────────────────────────────────────────────────────────

class TestContainsNonAscii:

    @pytest.mark.parametrize("text,expected", [
        ("hello",            False),
        ("x^2 + y^2",       False),
        ("こんにちは",         True),
        ("E=mc²",            True),  # ² is non-ASCII
        ("α + β = γ",        True),
        ("",                 False),
    ])
    def test_detection(self, pipeline, text, expected):
        assert pipeline._contains_non_ascii(text) == expected


# ─────────────────────────────────────────────────────────────────────────────
# _parse_json_response
# ─────────────────────────────────────────────────────────────────────────────

class TestParseJsonResponse:

    @pytest.mark.parametrize("raw", [
        '{"key": "value"}',
        '  {"key": "value"}  ',
        '```json\n{"key": "value"}\n```',
        '```\n{"key": "value"}\n```',
    ])
    def test_valid_payloads_parsed(self, pipeline, raw):
        result = pipeline._parse_json_response(raw)
        assert isinstance(result, dict)
        assert result["key"] == "value"

    def test_trailing_comma_auto_repaired(self, pipeline):
        result = pipeline._parse_json_response('{"key": "v",}')
        assert result["key"] == "v"

    def test_unclosed_brace_auto_repaired(self, pipeline):
        result = pipeline._parse_json_response('{"key": "v"')
        assert result["key"] == "v"


# ─────────────────────────────────────────────────────────────────────────────
# _run_stage (async) – mocked API
# ─────────────────────────────────────────────────────────────────────────────

class TestRunStage:

    @pytest.mark.asyncio
    async def test_successful_stage_returns_parsed_dict(self, pipeline):
        payload = {"title": "Lesson", "chapters": []}
        pipeline.api_client.deepseek.chat_completion = AsyncMock(
            return_value=_ok_response(payload)
        )
        result = await pipeline._run_stage(
            "test_stage", "video/lesson_syllabus",
            {"topic": "x"}, {"fallback": True},
            temperature=0.2, max_tokens=100,
        )
        assert result["title"] == "Lesson"

    @pytest.mark.asyncio
    async def test_api_failure_returns_fallback(self, pipeline):
        pipeline.api_client.deepseek.chat_completion = AsyncMock(
            return_value=_fail_response()
        )
        fallback = {"fallback": True}
        result = await pipeline._run_stage(
            "test_stage", "video/lesson_syllabus",
            {"topic": "x"}, fallback,
            temperature=0.2, max_tokens=100,
        )
        assert result == fallback

    @pytest.mark.asyncio
    async def test_exception_in_api_returns_fallback(self, pipeline):
        pipeline.api_client.deepseek.chat_completion = AsyncMock(
            side_effect=ConnectionError("network down")
        )
        fallback = {"error_fallback": True}
        result = await pipeline._run_stage(
            "test_stage", "video/lesson_syllabus",
            {"topic": "x"}, fallback,
            temperature=0.2, max_tokens=100,
        )
        assert result == fallback

    @pytest.mark.asyncio
    async def test_non_dict_response_returns_fallback(self, pipeline):
        from services.api_client import APIResponse
        pipeline.api_client.deepseek.chat_completion = AsyncMock(
            return_value=APIResponse(
                success=True,
                data={"choices": [{"message": {"content": '["list", "not", "dict"]'}}]},
                status_code=200,
            )
        )
        fallback = {"non_dict_fallback": True}
        result = await pipeline._run_stage(
            "test_stage", "video/render_plan_builder",
            {"topic": "x"}, fallback,
            temperature=0.1, max_tokens=100,
        )
        assert result == fallback


# ─────────────────────────────────────────────────────────────────────────────
# _validate_render_plan
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateRenderPlan:

    def _make_scenes(self, n: int, pipeline) -> list:
        return [
            {
                "id": f"scene_{i}",
                "action": "show_text",
                "param": f"Content for scene {i}",
                "narration": "Valid narration text for the validation test suite.",
                "duration": 22.0,
            }
            for i in range(1, n + 1)
        ]

    def test_valid_plan_passes_through(self, pipeline):
        scenes = self._make_scenes(26, pipeline)
        result = pipeline._validate_render_plan(
            {"title": "Test", "scenes": scenes}, "en", 10
        )
        assert result["scene_count"] >= 24
        assert "render_plan" in result

    def test_empty_plan_padded(self, pipeline):
        result = pipeline._validate_render_plan({"scenes": []}, "en", 10)
        assert result["scene_count"] >= 24
        assert result["warnings"]

    def test_plan_with_corrupt_scenes_drops_them(self, pipeline):
        scenes = [
            "not a dict",
            None,
            42,
        ]
        result = pipeline._validate_render_plan(
            {"title": "Corrupt", "scenes": scenes}, "en", 10
        )
        # All bad scenes dropped → padded from fallback
        assert result["scene_count"] >= 24

    def test_duration_scaling_applied_when_too_short(self, pipeline):
        scenes = [
            {
                "id": f"s{i}", "action": "show_text",
                "param": "Param text", "narration": "Narration text here.",
                "duration": 5.0,
            }
            for i in range(1, 25)
        ]
        result = pipeline._validate_render_plan(
            {"title": "Short", "scenes": scenes}, "en", 10
        )
        assert result["estimated_total_seconds"] >= 600

    def test_title_fallback_when_missing(self, pipeline):
        result = pipeline._validate_render_plan({"scenes": []}, "en", 10)
        assert result["render_plan"]["title"] != ""

    def test_minimum_scene_count_scales_with_duration(self, pipeline):
        """10-min lesson → min 24 scenes;  18-min lesson → still at least 24."""
        for mins in [10, 15, 18]:
            result = pipeline._validate_render_plan({"scenes": []}, "en", mins)
            assert result["scene_count"] >= 24, \
                f"Expected ≥24 scenes for {mins}-min lesson, got {result['scene_count']}"


# ─────────────────────────────────────────────────────────────────────────────
# _apply_review_patches
# ─────────────────────────────────────────────────────────────────────────────

class TestApplyReviewPatches:

    def _make_plan_with_scene(self, scene_id: str, pipeline) -> dict:
        return {
            "title": "Test",
            "scenes": [
                {
                    "id": scene_id,
                    "action": "show_text",
                    "param": "Original param",
                    "narration": "Original narration for the test scene.",
                    "duration": 22.0,
                    "visual_type": "manim",
                    "canvas_config": {
                        "layout": "callout_card",
                        "font_size": 28, "safe_scale": 0.82, "max_chars": 72,
                        "graph": {"x_range": [-6, 6], "y_range": [-6, 6]},
                    },
                }
            ],
        }

    def test_valid_patch_applied_to_correct_scene(self, pipeline):
        plan = self._make_plan_with_scene("scene_1", pipeline)
        patches = [{"scene_id": "scene_1", "patch": {"param": "Updated param text"}}]
        updated_plan, applied = pipeline._apply_review_patches(plan, patches, "en")
        assert "scene_1" in applied
        scene = updated_plan["scenes"][0]
        assert scene["param"] == "Updated param text"

    def test_patch_for_unknown_scene_ignored(self, pipeline):
        plan = self._make_plan_with_scene("scene_1", pipeline)
        patches = [{"scene_id": "nonexistent_99", "patch": {"param": "X"}}]
        _, applied = pipeline._apply_review_patches(plan, patches, "en")
        assert "nonexistent_99" not in applied

    def test_non_dict_patch_data_ignored(self, pipeline):
        plan = self._make_plan_with_scene("scene_1", pipeline)
        patches = [{"scene_id": "scene_1", "patch": "not a dict"}]
        _, applied = pipeline._apply_review_patches(plan, patches, "en")
        assert applied == []

    def test_multiple_patches_all_applied(self, pipeline):
        plan = {
            "title": "Multi",
            "scenes": [
                {
                    "id": f"s{i}", "action": "show_text",
                    "param": f"original {i}",
                    "narration": "A narration for multi-patch testing purposes.",
                    "duration": 22.0,
                    "visual_type": "manim",
                    "canvas_config": {
                        "layout": "callout_card",
                        "font_size": 28, "safe_scale": 0.82, "max_chars": 72,
                        "graph": {"x_range": [-6, 6], "y_range": [-6, 6]},
                    },
                }
                for i in range(1, 4)
            ],
        }
        patches = [
            {"scene_id": "s1", "patch": {"param": "patched 1"}},
            {"scene_id": "s2", "patch": {"param": "patched 2"}},
        ]
        _, applied = pipeline._apply_review_patches(plan, patches, "en")
        assert set(applied) == {"s1", "s2"}


# ─────────────────────────────────────────────────────────────────────────────
# build_generation_bundle (end-to-end, all stages mocked)
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildGenerationBundle:

    def _full_render_plan(self, n_scenes: int = 26) -> dict:
        """Return a render plan with n valid scenes."""
        return {
            "title": "Derivatives",
            "scenes": [
                {
                    "id": f"scene_{i}",
                    "action": "show_text",
                    "param": f"Concept {i}",
                    "narration": "A valid narration for end-to-end pipeline test.",
                    "duration": 22.0,
                }
                for i in range(1, n_scenes + 1)
            ],
        }

    @pytest.mark.asyncio
    async def test_bundle_contains_required_keys(self, pipeline):
        pipeline.api_client.deepseek.chat_completion = AsyncMock(
            return_value=_ok_response(self._full_render_plan())
        )
        bundle = await pipeline.build_generation_bundle(
            topic="Derivatives",
            content="Intro to derivatives.",
            duration_minutes=10,
        )
        for key in ("topic", "style", "language", "student_level",
                    "syllabus", "storyboard", "render_plan", "validation",
                    "review", "prompt_versions"):
            assert key in bundle, f"Missing key {key!r} in generation bundle"

    @pytest.mark.asyncio
    async def test_bundle_render_plan_passes_quality(self, pipeline):
        pipeline.api_client.deepseek.chat_completion = AsyncMock(
            return_value=_ok_response(self._full_render_plan(26))
        )
        bundle = await pipeline.build_generation_bundle(
            topic="Derivatives",
            content="Content",
            duration_minutes=10,
        )
        scenes = bundle["render_plan"]["scenes"]
        assert len(scenes) >= 24

    @pytest.mark.asyncio
    async def test_bundle_uses_existing_syllabus(self, pipeline):
        existing_syllabus = {
            "title": "Pre-built Syllabus",
            "chapters": [{"id": "ch1", "title": "Intro"}],
        }
        pipeline.api_client.deepseek.chat_completion = AsyncMock(
            return_value=_ok_response(self._full_render_plan())
        )
        bundle = await pipeline.build_generation_bundle(
            topic="Test",
            content="Content",
            existing_bundle={"syllabus": existing_syllabus},
        )
        assert bundle["syllabus"]["title"] == "Pre-built Syllabus"

    @pytest.mark.asyncio
    async def test_bundle_duration_minutes_floor(self, pipeline):
        """duration_minutes below 10 is floored to 10."""
        pipeline.api_client.deepseek.chat_completion = AsyncMock(
            return_value=_ok_response(self._full_render_plan())
        )
        bundle = await pipeline.build_generation_bundle(
            topic="Test", content="Content", duration_minutes=3,
        )
        assert bundle["duration_minutes"] >= 10

    @pytest.mark.asyncio
    async def test_bundle_target_scene_count_in_range(self, pipeline):
        pipeline.api_client.deepseek.chat_completion = AsyncMock(
            return_value=_ok_response(self._full_render_plan())
        )
        bundle = await pipeline.build_generation_bundle(
            topic="Test", content="Content", duration_minutes=10,
        )
        assert 24 <= bundle["target_scene_count"] <= 32

    @pytest.mark.asyncio
    async def test_full_api_failure_still_returns_valid_bundle(self, pipeline):
        """When every API call fails, fallbacks ensure a valid bundle is returned."""
        pipeline.api_client.deepseek.chat_completion = AsyncMock(
            return_value=_fail_response("All APIs down")
        )
        bundle = await pipeline.build_generation_bundle(
            topic="Fallback Test", content="Content", duration_minutes=10,
        )
        assert "render_plan" in bundle
        assert len(bundle["render_plan"]["scenes"]) >= 24
