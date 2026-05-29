"""
Video Quality Definition & Verification Tests
==============================================

This module defines MentorMind's educational video quality standard and
verifies every component of the pipeline against it.

Quality Dimensions
------------------
1. Structural Completeness   – every scene carries the required fields
2. Action Validity           – actions are from the allowed set
3. Duration Bounds           – per-scene 18-60 s; total ≥ requested minutes × 60 s
4. Scene Count               – minimum 24 scenes (deterministic floor)
5. Narration Quality         – non-empty, within character limits
6. Canvas Config Integrity   – valid layout, positive numeric values
7. Plot Expression Safety    – only safe Python math characters
8. LaTeX Safety              – no unsupported environments; non-ASCII falls back
9. Language Consistency      – narration language matches requested language
10. Fallback Determinism     – fallback methods always yield valid output
"""

from __future__ import annotations

import ast
import re
import sys
import os
from typing import Any, Dict, List

import pytest

# ─────────────────────────────────────────────────────────────────────────────
# Helpers – quality-contract assertions reused across tests
# ─────────────────────────────────────────────────────────────────────────────

ALLOWED_ACTIONS  = {"show_title", "show_text", "write_tex", "plot", "transform", "draw_shape"}
ALLOWED_LAYOUTS  = {"title_card", "equation_focus", "graph_focus", "two_column", "callout_card", "recap_card"}

SCENE_MIN_DURATION = 18.0   # seconds
SCENE_MAX_DURATION = 60.0   # seconds
MIN_SCENE_COUNT    = 24
MAX_NARRATION_CHARS = 1200
MIN_NARRATION_CHARS = 5

SAFE_PLOT_RE = re.compile(r"^[0-9a-zA-Z_+\-*/(). ]+$")


def assert_scene_quality(scene: Dict[str, Any], *, index: int) -> None:
    """Assert every quality constraint for a single scene dict."""
    tag = f"Scene[{index}] id={scene.get('id', '?')!r}"

    # 1. Structural completeness
    for field in ("id", "action", "param", "narration", "duration", "canvas_config"):
        assert field in scene, f"{tag}: missing required field {field!r}"

    # 2. Action validity
    assert scene["action"] in ALLOWED_ACTIONS, (
        f"{tag}: action {scene['action']!r} not in ALLOWED_ACTIONS"
    )

    # 3. Duration bounds
    dur = float(scene["duration"])
    assert SCENE_MIN_DURATION <= dur <= SCENE_MAX_DURATION, (
        f"{tag}: duration {dur}s outside [{SCENE_MIN_DURATION}, {SCENE_MAX_DURATION}]"
    )

    # 4. Narration quality
    narration = str(scene.get("narration", ""))
    assert len(narration) >= MIN_NARRATION_CHARS, (
        f"{tag}: narration too short ({len(narration)} chars)"
    )
    assert len(narration) <= MAX_NARRATION_CHARS, (
        f"{tag}: narration too long ({len(narration)} chars, max {MAX_NARRATION_CHARS})"
    )

    # 5. Canvas config integrity
    canvas = scene.get("canvas_config", {})
    assert isinstance(canvas, dict), f"{tag}: canvas_config must be a dict"
    assert canvas.get("layout") in ALLOWED_LAYOUTS, (
        f"{tag}: layout {canvas.get('layout')!r} not in ALLOWED_LAYOUTS"
    )
    font_size = canvas.get("font_size", 0)
    assert isinstance(font_size, (int, float)) and font_size > 0, (
        f"{tag}: font_size must be a positive number, got {font_size!r}"
    )
    safe_scale = canvas.get("safe_scale", 0)
    assert isinstance(safe_scale, (int, float)) and 0 < safe_scale <= 2.0, (
        f"{tag}: safe_scale {safe_scale!r} outside (0, 2.0]"
    )

    # 6. Plot expression safety
    if scene["action"] == "plot":
        param = str(scene["param"])
        assert SAFE_PLOT_RE.match(param), (
            f"{tag}: plot param {param!r} contains unsafe characters"
        )

    # 7. visual_type must always be 'manim'
    assert scene.get("visual_type") == "manim", (
        f"{tag}: visual_type must be 'manim', got {scene.get('visual_type')!r}"
    )


def assert_render_plan_quality(
    render_plan: Dict[str, Any],
    duration_minutes: int,
) -> None:
    """Assert quality constraints across the full render plan."""
    scenes = render_plan.get("scenes", [])

    # Scene count
    assert len(scenes) >= MIN_SCENE_COUNT, (
        f"Render plan has only {len(scenes)} scenes; minimum is {MIN_SCENE_COUNT}"
    )

    # Per-scene quality
    for i, scene in enumerate(scenes):
        assert_scene_quality(scene, index=i + 1)

    # Total duration
    total_seconds = sum(float(s.get("duration", 0)) for s in scenes)
    min_total = duration_minutes * 60
    assert total_seconds >= min_total, (
        f"Total duration {total_seconds:.1f}s is less than requested "
        f"{duration_minutes} min ({min_total}s)"
    )

    # Title present
    assert render_plan.get("title"), "Render plan must have a non-empty title"


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def pipeline_instance():
    from unittest.mock import MagicMock, patch
    from core.modules.robust_video_generation import RobustVideoGenerationPipeline

    client = MagicMock()
    with patch("prompts.loader.load_prompt", return_value="mock"), \
         patch("prompts.loader.render_prompt", return_value="mock"):
        instance = RobustVideoGenerationPipeline(api_client=client)
        # See note in test_pipeline_unit.py — disk-backed cache leaks across tests.
        instance.cache = None
        return instance


# ─────────────────────────────────────────────────────────────────────────────
# 1. Quality-contract unit tests – scene normalisation
# ─────────────────────────────────────────────────────────────────────────────

class TestSceneQualityContract:
    """Assert the quality contract is enforced by the normalisation layer."""

    def test_valid_scene_passes_quality_check(self, pipeline_instance):
        scene = {
            "id": "scene_1",
            "action": "show_text",
            "param": "Introduction to derivatives",
            "narration": "Let us start by exploring what a derivative measures.",
            "duration": 25.0,
            "visual_type": "manim",
            "canvas_config": {
                "layout": "callout_card",
                "font_size": 28,
                "safe_scale": 0.82,
                "max_chars": 72,
                "graph": {"x_range": [-6, 6], "y_range": [-6, 6]},
            },
        }
        # Should not raise
        assert_scene_quality(scene, index=1)

    def test_normalised_scene_meets_quality_contract(self, pipeline_instance):
        """After _normalize_scene, the scene must satisfy every quality constraint."""
        raw = {
            "id": None,
            "action": "INVALID_ACTION",
            "param": "some param",
            "narration": "A detailed narration about the topic that goes into depth.",
            "duration": -5,  # invalid – should be clamped
            "canvas_config": {},
        }
        pipeline_instance._normalize_scene(raw, "scene_test", "en")
        assert_scene_quality(raw, index=0)

    def test_scene_with_missing_narration_gets_fallback(self, pipeline_instance):
        raw = {
            "action": "show_text",
            "param": "Fallback param used as narration",
            "duration": 22.0,
        }
        pipeline_instance._normalize_scene(raw, "scene_1", "en")
        assert len(raw["narration"]) >= MIN_NARRATION_CHARS

    def test_all_fallback_scenes_pass_quality_contract(self, pipeline_instance):
        """Every scene in every fallback render plan must satisfy quality."""
        fallback = pipeline_instance._fallback_render_plan("Calculus", {}, "en")
        for i, raw_scene in enumerate(fallback["scenes"], start=1):
            scene = dict(raw_scene)
            pipeline_instance._normalize_scene(scene, scene.get("id", f"s{i}"), "en")
            assert_scene_quality(scene, index=i)


# ─────────────────────────────────────────────────────────────────────────────
# 2. Duration quality
# ─────────────────────────────────────────────────────────────────────────────

class TestDurationQuality:

    @pytest.mark.parametrize("raw_duration, expected_min, expected_max", [
        (0,    18.0, 60.0),   # zero → estimate from narration (≥ 24 s floor)
        (-10,  18.0, 60.0),   # negative → estimate from narration
        (30,   30.0, 30.0),   # valid → unchanged
        (1000, 60.0, 60.0),   # over cap → maximum ceiling
        (18,   18.0, 18.0),   # exactly at min bound
        (60,   60.0, 60.0),   # exactly at max bound
        ("abc", 18.0, 60.0),  # non-numeric string → estimated from narration
    ])
    def test_normalize_duration_bounds(
        self, pipeline_instance, raw_duration, expected_min, expected_max
    ):
        narration = "A medium-length narration sentence used for estimation."
        result = pipeline_instance._normalize_duration(raw_duration, narration)
        assert expected_min <= result <= expected_max, (
            f"Duration {result} outside [{expected_min}, {expected_max}] "
            f"for input {raw_duration!r}"
        )

    def test_estimated_duration_respects_bounds(self, pipeline_instance):
        # Very short narration
        short = pipeline_instance._estimate_duration_from_narration("Hi")
        assert 18.0 <= short <= 55.0

        # Very long narration
        long_text = "word " * 300
        long_dur = pipeline_instance._estimate_duration_from_narration(long_text)
        assert 18.0 <= long_dur <= 55.0

    def test_validation_scales_durations_to_meet_requested_length(
        self, pipeline_instance
    ):
        """If total duration < requested, durations must be scaled up."""
        # Build a render plan whose scenes are too short
        scenes = [
            {"id": f"scene_{i}", "action": "show_text", "param": f"text {i}",
             "narration": "Short narration used for testing duration scaling logic.",
             "duration": 5.0,  # below the 18 s floor — validation should lift it
             "visual_type": "manim",
             "canvas_config": {"layout": "callout_card", "font_size": 28,
                               "safe_scale": 0.82, "max_chars": 72,
                               "graph": {"x_range": [-6, 6], "y_range": [-6, 6]}}}
            for i in range(1, 25)
        ]
        render_plan = {"title": "Test", "scenes": scenes}
        validation = pipeline_instance._validate_render_plan(render_plan, "en", 10)
        total = validation["estimated_total_seconds"]
        assert total >= 10 * 60, (
            f"Expected total ≥ 600 s after scaling, got {total:.1f} s"
        )


# ─────────────────────────────────────────────────────────────────────────────
# 3. Action & layout quality
# ─────────────────────────────────────────────────────────────────────────────

class TestActionAndLayoutQuality:

    @pytest.mark.parametrize("action", list(ALLOWED_ACTIONS))
    def test_valid_action_preserved(self, pipeline_instance, action):
        assert pipeline_instance._normalize_action(action) == action

    @pytest.mark.parametrize("bad_action", [
        "SHOW_TEXT", "animate", "fly_in", None, 123, "", "draw_circle",
    ])
    def test_invalid_action_falls_back_to_show_text(self, pipeline_instance, bad_action):
        assert pipeline_instance._normalize_action(bad_action) == "show_text"

    @pytest.mark.parametrize("layout", list(ALLOWED_LAYOUTS))
    def test_valid_layout_preserved(self, pipeline_instance, layout):
        assert pipeline_instance._normalize_layout(layout, "show_text") == layout

    @pytest.mark.parametrize("action,expected_layout", [
        ("show_title", "title_card"),
        ("plot",       "graph_focus"),
        ("write_tex",  "equation_focus"),
        ("transform",  "equation_focus"),
    ])
    def test_layout_inferred_from_action(
        self, pipeline_instance, action, expected_layout
    ):
        result = pipeline_instance._normalize_layout("unknown_layout", action)
        assert result == expected_layout

    def test_unknown_action_and_layout_defaults_to_callout_card(
        self, pipeline_instance
    ):
        result = pipeline_instance._normalize_layout("anything", "show_text")
        assert result == "callout_card"


# ─────────────────────────────────────────────────────────────────────────────
# 4. LaTeX quality & safety
# ─────────────────────────────────────────────────────────────────────────────

class TestLatexQuality:

    def test_simple_expression_survives_sanitisation(self, pipeline_instance):
        expr, action = pipeline_instance._deep_sanitize_latex(r"x^2 + y^2 = r^2")
        assert action == "write_tex"
        assert "x^2" in expr

    def test_align_environment_stripped(self, pipeline_instance):
        raw = r"\begin{align} a &= b \\ c &= d \end{align}"
        expr, action = pipeline_instance._deep_sanitize_latex(raw)
        # Should produce write_tex (short enough after stripping)
        assert "\\begin" not in expr

    def test_unsupported_commands_removed(self, pipeline_instance):
        raw = r"\displaystyle x^2 \label{eq1} \tag{1}"
        expr, _ = pipeline_instance._deep_sanitize_latex(raw)
        for cmd in (r"\displaystyle", r"\label", r"\tag"):
            assert cmd not in expr, f"{cmd!r} should be removed but found in {expr!r}"

    def test_multiline_align_keeps_first_line_only(self, pipeline_instance):
        raw = r"a = b \\ c = d \\ e = f"
        expr, _ = pipeline_instance._deep_sanitize_latex(raw)
        assert r"\\" not in expr

    def test_overly_complex_expression_demoted_to_show_text(
        self, pipeline_instance
    ):
        # A \begin{} without a matching \end{} survives the env-stripping pass,
        # so the final "\\begin still present" guard triggers show_text.
        raw = r"\begin{foo} some content without a closing end tag here"
        _, action = pipeline_instance._deep_sanitize_latex(raw)
        assert action == "show_text"

    def test_non_ascii_param_redirected_to_show_text(self, pipeline_instance):
        """Chinese characters in a write_tex scene should fall back to plain text."""
        raw = {
            "action": "write_tex",
            "param": "这是中文公式 E=mc^2",
            "narration": "A narration describing the equation in Chinese context here.",
            "duration": 25.0,
        }
        pipeline_instance._normalize_scene(raw, "scene_1", "zh")
        assert raw["action"] == "show_text", (
            "Non-ASCII in write_tex param must flip the action to show_text"
        )

    def test_latex_sanitize_strips_non_math_punctuation(self, pipeline_instance):
        # _sanitize_latex strips chars outside [0-9a-zA-Z\\{}_^=()+\-*/., ]
        # Semicolons and backticks are stripped; letters/keywords are preserved.
        expr = pipeline_instance._sanitize_latex("x^2 + \\alpha; `inject`")
        assert ";" not in expr
        assert "`" not in expr

    def test_empty_latex_returns_safe_default(self, pipeline_instance):
        expr, action = pipeline_instance._deep_sanitize_latex("   ")
        assert expr == "x"
        assert action == "write_tex"


# ─────────────────────────────────────────────────────────────────────────────
# 5. Plot expression safety
# ─────────────────────────────────────────────────────────────────────────────

class TestPlotExpressionSafety:

    @pytest.mark.parametrize("expr,expected", [
        ("x**2",            "x**2"),
        ("sin(x)",          "sin(x)"),
        ("x^2",             "x**2"),           # ^ converted to **
        ("x + 1",           "x + 1"),
        ("",                "x"),              # empty → safe default
        # Semicolon stripped; parentheses, letters, slash, space are allowed:
        ("x; os.system(1)", "x os.system(1)"), # ; stripped, rest kept
        ("x\nimport os",    "ximport os"),      # newline not in safe chars → stripped
    ])
    def test_plot_expression_sanitisation(
        self, pipeline_instance, expr, expected
    ):
        result = pipeline_instance._sanitize_plot_expression(expr)
        assert result == expected, f"sanitize_plot_expression({expr!r}) → {result!r}, expected {expected!r}"

    @pytest.mark.parametrize("expr", [
        "x**2", "sin(x)", "cos(x)", "x + 1", "2*x - 3",
        "x**3 + 2*x", "sqrt(x)", "log(x + 1)",
    ])
    def test_sanitised_plot_expressions_are_python_safe(
        self, pipeline_instance, expr
    ):
        result = pipeline_instance._sanitize_plot_expression(expr)
        assert SAFE_PLOT_RE.match(result), (
            f"Sanitised expression {result!r} contains unsafe characters"
        )


# ─────────────────────────────────────────────────────────────────────────────
# 6. Narration quality
# ─────────────────────────────────────────────────────────────────────────────

class TestNarrationQuality:

    def test_compact_text_within_limit(self, pipeline_instance):
        long_text = "word " * 500
        result = pipeline_instance._compact_text(long_text, 100)
        assert len(result) <= 100

    def test_compact_text_truncated_with_ellipsis(self, pipeline_instance):
        result = pipeline_instance._compact_text("a" * 200, 50)
        assert result.endswith("...")
        assert len(result) == 50

    def test_compact_text_short_input_unchanged(self, pipeline_instance):
        text = "Short text"
        assert pipeline_instance._compact_text(text, 100) == text

    def test_compact_text_collapses_whitespace(self, pipeline_instance):
        text = "word    word\n\nword\tword"
        result = pipeline_instance._compact_text(text, 1000)
        assert "\n" not in result
        assert "\t" not in result
        assert "  " not in result

    @pytest.mark.parametrize("language,expected_substring", [
        ("en", "why"),       # hook narration in English contains 'why'
        ("zh", "直觉"),       # hook narration in Chinese contains 直觉
    ])
    def test_fallback_narration_matches_language(
        self, pipeline_instance, language, expected_substring
    ):
        result = pipeline_instance._fallback_narration(
            "Calculus", "hook", language, ""
        )
        assert expected_substring in result, (
            f"Expected {expected_substring!r} in {language!r} hook narration: {result!r}"
        )

    def test_narration_char_limit_in_normalised_scene(self, pipeline_instance):
        raw = {
            "action": "show_text",
            "param": "x",
            "narration": "word " * 1000,   # far over 1200 chars
            "duration": 25.0,
        }
        pipeline_instance._normalize_scene(raw, "scene_1", "en")
        assert len(raw["narration"]) <= MAX_NARRATION_CHARS


# ─────────────────────────────────────────────────────────────────────────────
# 7. Canvas config quality
# ─────────────────────────────────────────────────────────────────────────────

class TestCanvasConfigQuality:

    def test_missing_canvas_config_gets_defaults(self, pipeline_instance):
        raw = {
            "action": "show_text",
            "param": "Something",
            "narration": "A valid narration sentence for the scene.",
            "duration": 25.0,
        }
        pipeline_instance._normalize_scene(raw, "s1", "en")
        cc = raw["canvas_config"]
        assert "layout" in cc
        assert "font_size" in cc
        assert "safe_scale" in cc
        assert "max_chars" in cc
        assert "graph" in cc

    @pytest.mark.parametrize("layout,max_chars_cap", [
        ("graph_focus",    36),
        ("equation_focus", 48),
        ("callout_card",   72),
        ("title_card",     72),
    ])
    def test_max_chars_capped_per_layout(
        self, pipeline_instance, layout, max_chars_cap
    ):
        raw = {
            "action": "show_text",
            "param": "x",
            "narration": "Valid narration text for this test scene.",
            "duration": 25.0,
            "canvas_config": {"layout": layout, "max_chars": 9999},
        }
        pipeline_instance._normalize_scene(raw, "s1", "en")
        assert raw["canvas_config"]["max_chars"] <= max_chars_cap

    @pytest.mark.parametrize("layout,expected_font", [
        ("title_card",      48),
        ("equation_focus",  40),
        ("callout_card",    28),
    ])
    def test_default_font_size_by_layout(
        self, pipeline_instance, layout, expected_font
    ):
        assert pipeline_instance._default_font_size(layout) == expected_font

    def test_graph_range_validated_and_normalised(self, pipeline_instance):
        raw = {
            "action": "plot",
            "param": "x**2",
            "narration": "Graph of x squared function visualisation.",
            "duration": 25.0,
            "canvas_config": {
                "layout": "graph_focus",
                "graph": {"x_range": [-10, 10], "y_range": [-5, 5]},
            },
        }
        pipeline_instance._normalize_scene(raw, "s1", "en")
        g = raw["canvas_config"]["graph"]
        assert g["x_range"] == [-10, 10]
        assert g["y_range"] == [-5, 5]

    def test_invalid_graph_range_replaced_by_default(self, pipeline_instance):
        raw = {
            "action": "plot",
            "param": "x**2",
            "narration": "Another narration sentence used to validate graph defaults.",
            "duration": 25.0,
            "canvas_config": {"graph": {"x_range": "bad", "y_range": None}},
        }
        pipeline_instance._normalize_scene(raw, "s1", "en")
        g = raw["canvas_config"]["graph"]
        assert g["x_range"] == [-6, 6]
        assert g["y_range"] == [-6, 6]


# ─────────────────────────────────────────────────────────────────────────────
# 8. Render plan validation quality
# ─────────────────────────────────────────────────────────────────────────────

class TestRenderPlanValidationQuality:

    def test_empty_scenes_triggers_fallback(self, pipeline_instance):
        validation = pipeline_instance._validate_render_plan(
            {"title": "Empty", "scenes": []}, "en", 10
        )
        assert validation["scene_count"] >= MIN_SCENE_COUNT
        assert validation["warnings"]

    def test_non_dict_scenes_dropped_with_warning(self, pipeline_instance):
        bad_plan = {
            "title": "Bad",
            "scenes": ["not a dict", 42, None],
        }
        validation = pipeline_instance._validate_render_plan(bad_plan, "en", 10)
        assert any("not an object" in w or "dropped" in w for w in validation["warnings"])

    def test_too_few_scenes_padded_with_fallbacks(self, pipeline_instance):
        """A plan with only 5 scenes must be padded to at least MIN_SCENE_COUNT."""
        minimal_scenes = [
            {
                "id": f"s{i}", "action": "show_text",
                "param": f"Content for scene {i}",
                "narration": "Some narration that is valid for padding test.",
                "duration": 20.0,
            }
            for i in range(1, 6)
        ]
        validation = pipeline_instance._validate_render_plan(
            {"title": "Short", "scenes": minimal_scenes}, "en", 10
        )
        assert validation["scene_count"] >= MIN_SCENE_COUNT

    def test_validation_output_structure(self, pipeline_instance):
        validation = pipeline_instance._validate_render_plan(
            {"title": "Test", "scenes": []}, "en", 10
        )
        for key in ("warnings", "scene_count", "estimated_total_seconds", "render_plan"):
            assert key in validation, f"Missing key {key!r} in validation output"

    def test_full_quality_contract_after_validation(self, pipeline_instance):
        """The validated render plan must satisfy the full quality contract."""
        # 30 scenes × 22 s = 660 s > 600 s (10 min) → no scaling needed
        raw_plan = {
            "title": "Derivatives",
            "scenes": [
                {
                    "id": f"scene_{i}",
                    "action": "show_text",
                    "param": f"Concept number {i} explained clearly.",
                    "narration": "A well-formed narration with enough content.",
                    "duration": 22.0,
                }
                for i in range(1, 31)
            ],
        }
        validation = pipeline_instance._validate_render_plan(raw_plan, "en", 10)
        plan = validation["render_plan"]
        assert_render_plan_quality(plan, duration_minutes=10)


# ─────────────────────────────────────────────────────────────────────────────
# 9. JSON parsing quality
# ─────────────────────────────────────────────────────────────────────────────

class TestJsonParsingQuality:

    @pytest.mark.parametrize("raw,expected_key", [
        ('{"title": "Lesson"}', "title"),
        ('```json\n{"title": "Lesson"}\n```', "title"),
        ('```\n{"title": "Lesson"}\n```', "title"),
        ('  \n{"title":"Lesson"}\n', "title"),
    ])
    def test_parse_json_response_handles_formats(
        self, pipeline_instance, raw, expected_key
    ):
        result = pipeline_instance._parse_json_response(raw)
        assert isinstance(result, dict)
        assert expected_key in result

    def test_trailing_comma_repair(self, pipeline_instance):
        broken = '{"key": "value",}'
        result = pipeline_instance._attempt_json_repair(broken)
        import json
        parsed = json.loads(result)
        assert parsed["key"] == "value"

    def test_unclosed_braces_repair(self, pipeline_instance):
        broken = '{"key": "value"'
        result = pipeline_instance._attempt_json_repair(broken)
        import json
        parsed = json.loads(result)
        assert parsed["key"] == "value"

    def test_missing_object_separator_repair(self, pipeline_instance):
        broken = '{"a": 1}{"b": 2}'
        result = pipeline_instance._attempt_json_repair(broken)
        # After repair, should have a comma between objects (but still be wrapped)
        assert "}, {" in result or "}," in result


# ─────────────────────────────────────────────────────────────────────────────
# 10. Fallback determinism quality
# ─────────────────────────────────────────────────────────────────────────────

class TestFallbackDeterminismQuality:

    @pytest.mark.parametrize("topic,language", [
        ("Calculus",          "en"),
        ("微积分",             "zh"),
        ("Linear Algebra",    "en"),
        ("量子力学",           "zh"),
        ("Statistics",        "en"),
    ])
    def test_fallback_syllabus_always_valid(
        self, pipeline_instance, topic, language
    ):
        syllabus = pipeline_instance._fallback_syllabus(topic, "general", "beginner")
        assert syllabus["title"] == topic
        assert isinstance(syllabus["chapters"], list)
        assert len(syllabus["chapters"]) >= 4
        for ch in syllabus["chapters"]:
            assert "id" in ch
            assert "title" in ch

    @pytest.mark.parametrize("topic,language", [
        ("Calculus", "en"),
        ("微积分",    "zh"),
    ])
    def test_fallback_render_plan_passes_quality_contract(
        self, pipeline_instance, topic, language
    ):
        plan = pipeline_instance._fallback_render_plan(topic, {}, language)
        assert "scenes" in plan
        assert "title" in plan
        for i, scene in enumerate(plan["scenes"], start=1):
            scene_copy = dict(scene)
            pipeline_instance._normalize_scene(scene_copy, scene_copy.get("id", f"s{i}"), language)
            assert_scene_quality(scene_copy, index=i)

    def test_fallback_storyboard_has_minimum_scenes(self, pipeline_instance):
        syllabus = pipeline_instance._fallback_syllabus("Test", "general", "beginner")
        storyboard = pipeline_instance._fallback_storyboard("Test", "", syllabus, "en")
        assert len(storyboard["scenes"]) >= 24

    def test_fallback_is_deterministic(self, pipeline_instance):
        """Calling fallback twice with same input must produce identical output."""
        plan_a = pipeline_instance._fallback_render_plan("Calculus", {}, "en")
        plan_b = pipeline_instance._fallback_render_plan("Calculus", {}, "en")
        assert len(plan_a["scenes"]) == len(plan_b["scenes"])
        for a, b in zip(plan_a["scenes"], plan_b["scenes"]):
            assert a["id"] == b["id"]
            assert a["action"] == b["action"]


# ─────────────────────────────────────────────────────────────────────────────
# 11. Multi-language quality
# ─────────────────────────────────────────────────────────────────────────────

class TestMultiLanguageQuality:

    @pytest.mark.parametrize("language", ["en", "zh", "ja", "ko"])
    def test_get_language_instruction_returns_non_empty(self, language):
        from services.api_client import get_language_instruction
        result = get_language_instruction(language)
        assert isinstance(result, str) and len(result) > 10

    def test_unknown_language_returns_default(self):
        from services.api_client import get_language_instruction
        result = get_language_instruction("xx")
        # Unknown language falls back to Chinese per codebase default
        assert isinstance(result, str) and len(result) > 0

    @pytest.mark.parametrize("language,expected_not_in_narration", [
        ("en", "直觉"),    # Chinese characters should not appear in English narration
        ("zh", "why"),     # English "why" should not appear in Chinese narration
    ])
    def test_fallback_narration_language_separation(
        self, pipeline_instance, language, expected_not_in_narration
    ):
        result = pipeline_instance._fallback_narration(
            "Derivatives", "hook", language, ""
        )
        assert expected_not_in_narration not in result, (
            f"Narration for {language!r} should not contain {expected_not_in_narration!r}"
        )
