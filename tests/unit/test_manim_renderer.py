"""
Unit Tests – ManimService (manim_renderer.py)
=============================================

Tests cover:
  • Code generation correctness and safety for all scene actions
  • Theme color injection
  • Bullet list parsing
  • LaTeX → plain-text fallback
  • Code sanitisation (non-ASCII MathTex replacement)
  • _compact_for_code helper
  • Generated code is valid Python syntax
"""

from __future__ import annotations

import ast
import os
import re
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def svc(tmp_path):
    """ManimService with filesystem redirected to tmp_path."""
    with patch("core.rendering.manim_renderer.config") as mock_cfg:
        mock_cfg.DATA_DIR = str(tmp_path)
        from core.rendering.manim_renderer import ManimService
        service = ManimService.__new__(ManimService)
        service.output_dir = str(tmp_path / "videos" / "manim")
        service.render_quality = "l"
        service.render_timeout_seconds = 60
        os.makedirs(service.output_dir, exist_ok=True)
        return service


@pytest.fixture
def make_scene():
    from core.modules.video_scripting import Scene

    def _f(
        scene_id="s1",
        action="show_text",
        param="Hello world",
        narration="Test narration.",
        duration=22.0,
        canvas_config=None,
        audio_path=None,
    ):
        return Scene(
            id=scene_id,
            duration=duration,
            narration=narration,
            action=action,
            param=param,
            visual_type="manim",
            canvas_config=canvas_config or {
                "layout": "callout_card",
                "font_size": 28,
                "safe_scale": 0.82,
                "max_chars": 72,
                "graph": {"x_range": [-6, 6], "y_range": [-6, 6]},
            },
            audio_path=audio_path,
        )
    return _f


@pytest.fixture
def make_script(make_scene):
    from core.modules.video_scripting import VideoScript

    def _f(title="Test Lesson", scenes=None, total_duration=22.0):
        if scenes is None:
            scenes = [make_scene()]
        return VideoScript(
            title=title,
            scenes=scenes,
            total_duration=total_duration,
            engine="manim",
        )
    return _f


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _is_valid_python(code: str) -> bool:
    """Return True iff `code` parses as valid Python 3."""
    try:
        ast.parse(code)
        return True
    except SyntaxError:
        return False


THEME = {
    "BG":      "#1E1E2E",
    "ACCENT":  "#89B4FA",
    "TEXT":    "#CDD6F4",
    "HEADING": "#F5C2E7",
    "GREEN":   "#A6E3A1",
    "PEACH":   "#FAB387",
    "YELLOW":  "#F9E2AF",
    "MAUVE":   "#CBA6F7",
    "RED":     "#F38BA8",
}


# ─────────────────────────────────────────────────────────────────────────────
# Code generation – structure & theme
# ─────────────────────────────────────────────────────────────────────────────

class TestCodeGenerationStructure:

    def test_generated_code_is_valid_python(self, svc, make_script, make_scene):
        """Generated Manim code must parse as valid Python for every action type."""
        with patch.object(svc, "_check_latex_availability", return_value=True):
            for action in ("show_text", "show_title", "write_tex",
                           "plot", "transform", "draw_shape"):
                scene = make_scene(
                    action=action,
                    param="x**2" if action == "plot" else
                          r"x^2 -> 2x" if action == "transform" else
                          r"x^2" if action == "write_tex" else
                          "circle" if action == "draw_shape" else
                          "Introduction to Derivatives",
                )
                script = make_script(scenes=[scene])
                code = svc._generate_manim_code(script)
                assert _is_valid_python(code), (
                    f"Invalid Python for action={action!r}:\n{code}"
                )

    def test_code_contains_lesson_scene_class(self, svc, make_script):
        with patch.object(svc, "_check_latex_availability", return_value=True):
            code = svc._generate_manim_code(make_script())
        assert "class LessonScene(Scene):" in code

    def test_code_contains_construct_method(self, svc, make_script):
        with patch.object(svc, "_check_latex_availability", return_value=True):
            code = svc._generate_manim_code(make_script())
        assert "def construct(self):" in code

    def test_code_contains_manim_import(self, svc, make_script):
        with patch.object(svc, "_check_latex_availability", return_value=True):
            code = svc._generate_manim_code(make_script())
        assert "from manim import *" in code

    def test_theme_colors_injected(self, svc, make_script):
        with patch.object(svc, "_check_latex_availability", return_value=True):
            code = svc._generate_manim_code(make_script())
        for hex_val in THEME.values():
            assert hex_val in code, f"Theme color {hex_val!r} not found in generated code"

    def test_background_color_set(self, svc, make_script):
        with patch.object(svc, "_check_latex_availability", return_value=True):
            code = svc._generate_manim_code(make_script())
        assert "background_color" in code
        assert THEME["BG"] in code

    def test_audio_path_injected_when_present(self, svc, make_scene, make_script):
        scene = make_scene(audio_path="/tmp/audio.mp3")
        with patch.object(svc, "_check_latex_availability", return_value=True):
            code = svc._generate_manim_code(make_script(scenes=[scene]))
        assert "add_sound" in code
        assert "/tmp/audio.mp3" in code

    def test_no_audio_when_path_is_none(self, svc, make_scene, make_script):
        scene = make_scene(audio_path=None)
        with patch.object(svc, "_check_latex_availability", return_value=True):
            code = svc._generate_manim_code(make_script(scenes=[scene]))
        assert "add_sound" not in code


# ─────────────────────────────────────────────────────────────────────────────
# Per-action code generation
# ─────────────────────────────────────────────────────────────────────────────

class TestActionCodeGeneration:

    def _code_for_action(self, svc, make_scene, make_script, action, param,
                         canvas=None, has_latex=True) -> str:
        scene = make_scene(action=action, param=param,
                           canvas_config=canvas)
        with patch.object(svc, "_check_latex_availability", return_value=has_latex):
            return svc._generate_manim_code(make_script(scenes=[scene]))

    # plot
    def test_plot_creates_axes(self, svc, make_scene, make_script):
        code = self._code_for_action(svc, make_scene, make_script, "plot", "x**2")
        assert "Axes(" in code
        assert "ax.plot" in code

    def test_plot_uses_expression(self, svc, make_scene, make_script):
        code = self._code_for_action(svc, make_scene, make_script, "plot", "sin(x)")
        assert "sin(x)" in code

    def test_plot_fades_out(self, svc, make_scene, make_script):
        code = self._code_for_action(svc, make_scene, make_script, "plot", "x**2")
        assert "FadeOut(ax)" in code

    # write_tex (LaTeX available, ASCII only)
    def test_write_tex_uses_mathtex_with_latex(self, svc, make_scene, make_script):
        code = self._code_for_action(
            svc, make_scene, make_script, "write_tex", r"x^2 + y^2", has_latex=True
        )
        assert "MathTex(" in code

    def test_write_tex_falls_back_to_text_without_latex(
        self, svc, make_scene, make_script
    ):
        code = self._code_for_action(
            svc, make_scene, make_script, "write_tex", r"x^2 + y^2", has_latex=False
        )
        assert "Text(" in code
        assert "MathTex(" not in code

    def test_write_tex_non_ascii_falls_back_to_text(
        self, svc, make_scene, make_script
    ):
        code = self._code_for_action(
            svc, make_scene, make_script,
            "write_tex", "中文公式 E=mc²", has_latex=True
        )
        assert "Text(" in code

    # transform
    def test_transform_morphs_two_expressions(self, svc, make_scene, make_script):
        code = self._code_for_action(
            svc, make_scene, make_script,
            "transform", r"x^2 -> 2x", has_latex=True
        )
        assert "TransformMatchingTex" in code

    def test_transform_without_arrow_falls_back_to_text(
        self, svc, make_scene, make_script
    ):
        code = self._code_for_action(
            svc, make_scene, make_script,
            "transform", "no separator here", has_latex=True
        )
        assert "Text(" in code

    # draw_shape
    @pytest.mark.parametrize("param,expected_shape", [
        ("circle",      "Circle("),
        ("square",      "Square("),
        ("rectangle",   "Square("),
        ("triangle",    "Triangle("),
        ("arrow",       "Arrow("),
        ("unknown_xyz", "Square("),   # unknown → default square
    ])
    def test_draw_shape_uses_correct_mobject(
        self, svc, make_scene, make_script, param, expected_shape
    ):
        code = self._code_for_action(svc, make_scene, make_script, "draw_shape", param)
        assert expected_shape in code, (
            f"Expected {expected_shape!r} for param={param!r}"
        )

    def test_draw_shape_grows_and_fades(self, svc, make_scene, make_script):
        code = self._code_for_action(
            svc, make_scene, make_script, "draw_shape", "circle"
        )
        assert "GrowFromCenter" in code
        assert "FadeOut" in code

    # show_title
    def test_show_title_creates_underline_bar(self, svc, make_scene, make_script):
        code = self._code_for_action(
            svc, make_scene, make_script, "show_title", "Introduction"
        )
        assert "Line(" in code          # accent bar
        assert "Write(title)" in code

    def test_show_title_uses_heading_color(self, svc, make_scene, make_script):
        code = self._code_for_action(
            svc, make_scene, make_script, "show_title", "Introduction"
        )
        assert "HEADING_COLOR" in code

    # show_text
    def test_show_text_single_line_uses_animate_with_audio(
        self, svc, make_scene, make_script
    ):
        code = self._code_for_action(
            svc, make_scene, make_script,
            "show_text", "A single plain sentence here."
        )
        assert "animate_with_audio" in code

    def test_show_text_bullet_list_uses_animate_bullets(
        self, svc, make_scene, make_script
    ):
        bullets = "- First point\n- Second point\n- Third point"
        code = self._code_for_action(
            svc, make_scene, make_script, "show_text", bullets
        )
        assert "animate_bullets" in code

    # layout-based colour selection
    @pytest.mark.parametrize("layout,expected_color", [
        ("title_card",     "HEADING_COLOR"),
        ("equation_focus", "MAUVE_COLOR"),
        ("graph_focus",    "ACCENT_COLOR"),
        ("recap_card",     "GREEN_COLOR"),
        ("callout_card",   "ACCENT_COLOR"),
    ])
    def test_layout_color_mapping(
        self, svc, make_scene, make_script, layout, expected_color
    ):
        canvas = {
            "layout": layout, "font_size": 28,
            "safe_scale": 0.82, "max_chars": 72,
            "graph": {"x_range": [-6, 6], "y_range": [-6, 6]},
        }
        scene = make_scene(
            action="show_text" if layout != "graph_focus" else "plot",
            param="x**2" if layout == "graph_focus" else "Some text",
            canvas_config=canvas,
        )
        with patch.object(svc, "_check_latex_availability", return_value=True):
            code = svc._generate_manim_code(make_script(scenes=[scene]))
        assert expected_color in code


# ─────────────────────────────────────────────────────────────────────────────
# Multi-scene code generation
# ─────────────────────────────────────────────────────────────────────────────

class TestMultiSceneCodeGeneration:

    def test_multiple_scenes_all_rendered(self, svc, make_scene, make_script):
        scenes = [
            make_scene(scene_id="s1", action="show_title", param="Intro"),
            make_scene(scene_id="s2", action="show_text",  param="Body text"),
            make_scene(scene_id="s3", action="plot",        param="x**2",
                       canvas_config={"layout": "graph_focus", "font_size": 28,
                                      "safe_scale": 0.82, "max_chars": 36,
                                      "graph": {"x_range": [-6, 6], "y_range": [-6, 6]}}),
        ]
        with patch.object(svc, "_check_latex_availability", return_value=True):
            code = svc._generate_manim_code(make_script(scenes=scenes))
        assert "# Scene: s1" in code
        assert "# Scene: s2" in code
        assert "# Scene: s3" in code
        assert _is_valid_python(code)

    def test_18_scenes_script_valid_python(self, svc, make_scene, make_script):
        scenes = [make_scene(scene_id=f"s{i}") for i in range(1, 19)]
        with patch.object(svc, "_check_latex_availability", return_value=True):
            code = svc._generate_manim_code(make_script(scenes=scenes))
        assert _is_valid_python(code)


# ─────────────────────────────────────────────────────────────────────────────
# _extract_bullets
# ─────────────────────────────────────────────────────────────────────────────

class TestExtractBullets:

    @pytest.mark.parametrize("text,min_bullets", [
        ("- Alpha\n- Beta\n- Gamma",          3),
        ("• First\n• Second",                 2),
        ("* A\n* B\n* C",                     3),
        ("1. One\n2. Two\n3. Three",          3),
        ("1) One\n2) Two",                    2),
        ("Just a single plain sentence here", 1),  # no bullets → returns [text]
        ("",                                  1),  # empty → returns [text]
    ])
    def test_bullet_detection(self, svc, text, min_bullets):
        result = svc._extract_bullets(text, 100)
        assert len(result) >= min_bullets

    def test_each_bullet_within_max_chars(self, svc):
        text = "- " + "word " * 50 + "\n- " + "word " * 50
        result = svc._extract_bullets(text, 40)
        for bullet in result:
            assert len(bullet) <= 40, f"Bullet too long: {len(bullet)} > 40"

    def test_long_bullet_truncated_with_ellipsis(self, svc):
        text = "- " + "a" * 200 + "\n- " + "b" * 200
        result = svc._extract_bullets(text, 50)
        for bullet in result:
            assert len(bullet) <= 50

    def test_non_bullet_text_returned_as_single_item(self, svc):
        result = svc._extract_bullets("Plain sentence.", 100)
        assert result == ["Plain sentence."]


# ─────────────────────────────────────────────────────────────────────────────
# _compact_for_code
# ─────────────────────────────────────────────────────────────────────────────

class TestCompactForCode:

    def test_short_text_unchanged(self, svc):
        assert svc._compact_for_code("Hello", 50) == "Hello"

    def test_long_text_truncated(self, svc):
        result = svc._compact_for_code("a" * 100, 50)
        assert len(result) <= 50
        assert result.endswith("...")

    def test_triple_quotes_escaped(self, svc):
        text = 'Say """hello"""'
        result = svc._compact_for_code(text, 200)
        assert '"""' not in result

    def test_whitespace_collapsed(self, svc):
        result = svc._compact_for_code("a  b\n\nc", 100)
        assert "  " not in result
        assert "\n" not in result

    def test_none_input_handled(self, svc):
        result = svc._compact_for_code(None, 50)
        assert isinstance(result, str)


# ─────────────────────────────────────────────────────────────────────────────
# _sanitize_generated_code
# ─────────────────────────────────────────────────────────────────────────────

class TestSanitizeGeneratedCode:

    def test_ascii_mathtex_preserved(self, svc):
        code = "eq = MathTex(r'x^2 + y^2', color=MAUVE_COLOR)"
        result = svc._sanitize_generated_code(code)
        assert "MathTex(" in result

    def test_non_ascii_mathtex_replaced_with_text(self, svc):
        code = "eq = MathTex(r'中文数学', color=MAUVE_COLOR)"
        result = svc._sanitize_generated_code(code)
        assert "MathTex(" not in result
        assert "Text(" in result

    def test_text_label_in_mathtex_replaced(self, svc):
        code = r"eq = MathTex(r'x^2 \text{where x is real}', color=MAUVE_COLOR)"
        result = svc._sanitize_generated_code(code)
        assert "MathTex(" not in result
        assert "Text(" in result

    def test_multiple_mathtex_selectively_replaced(self, svc):
        code = (
            "eq1 = MathTex(r'x^2', color=MAUVE_COLOR)\n"
            "eq2 = MathTex(r'中文', color=MAUVE_COLOR)"
        )
        result = svc._sanitize_generated_code(code)
        # First stays, second is replaced
        assert result.count("MathTex(") == 1
        assert result.count("Text(") == 1

    def test_non_mathtex_code_untouched(self, svc):
        code = "text = Text('Hello', font_size=28)"
        result = svc._sanitize_generated_code(code)
        assert result == code


# ─────────────────────────────────────────────────────────────────────────────
# _latex_to_plain_text
# ─────────────────────────────────────────────────────────────────────────────

class TestLatexToPlainText:

    @pytest.mark.parametrize("latex,expected_fragment", [
        (r"\frac{a}{b}",         "(a)/(b)"),
        (r"\neq",                "≠"),
        (r"\leq",                "≤"),
        (r"\geq",                "≥"),
        (r"\cdot",               "·"),
        (r"\times",              "×"),
        (r"\to",                 "→"),
        (r"\text{hello}",        "hello"),
        # \quad → space, but final .strip() removes a lone space; test with context
        (r"\quad x",             "x"),
    ])
    def test_replacement_conversions(self, svc, latex, expected_fragment):
        result = svc._latex_to_plain_text(latex)
        assert expected_fragment in result, (
            f"Expected {expected_fragment!r} in _latex_to_plain_text({latex!r}) = {result!r}"
        )

    def test_braces_removed(self, svc):
        result = svc._latex_to_plain_text(r"x^{2}")
        assert "{" not in result
        assert "}" not in result

    def test_backslashes_removed(self, svc):
        result = svc._latex_to_plain_text(r"\alpha + \beta")
        assert "\\" not in result


# ─────────────────────────────────────────────────────────────────────────────
# _fix_code_with_llm (async, mocked)
# ─────────────────────────────────────────────────────────────────────────────

class TestFixCodeWithLLM:
    # NOTE: _fix_code_with_llm imports APIClient *inside* the function body
    # (`from services.api_client import APIClient`), so we must patch the class
    # in the services.api_client module, not in manim_renderer's namespace.

    @pytest.mark.asyncio
    async def test_returns_fixed_code_on_success(self, svc):
        fixed = "from manim import *\nclass LessonScene(Scene): pass"
        from services.api_client import APIResponse
        mock_response = APIResponse(
            success=True,
            data={"choices": [{"message": {"content": f"```python\n{fixed}\n```"}}]},
            status_code=200,
        )
        with patch("services.api_client.APIClient") as MockClient, \
             patch("prompts.loader.render_prompt", return_value="fix this"):
            mock_instance = MagicMock()
            mock_instance.deepseek.chat_completion = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_instance

            result = await svc._fix_code_with_llm("broken code", "SyntaxError")

        assert result == fixed

    @pytest.mark.asyncio
    async def test_returns_none_on_api_failure(self, svc):
        from services.api_client import APIResponse
        mock_response = APIResponse(success=False, error="error", status_code=500)
        with patch("services.api_client.APIClient") as MockClient, \
             patch("prompts.loader.render_prompt", return_value="fix"):
            mock_instance = MagicMock()
            mock_instance.deepseek.chat_completion = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_instance

            result = await svc._fix_code_with_llm("broken", "error")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_exception(self, svc):
        with patch("services.api_client.APIClient") as MockClient, \
             patch("prompts.loader.render_prompt", return_value="fix"):
            mock_instance = MagicMock()
            mock_instance.deepseek.chat_completion = AsyncMock(
                side_effect=RuntimeError("network error")
            )
            MockClient.return_value = mock_instance

            result = await svc._fix_code_with_llm("broken", "error")

        assert result is None

    @pytest.mark.asyncio
    async def test_strips_non_python_markdown_prefix(self, svc):
        fixed = "from manim import *"
        from services.api_client import APIResponse
        response = APIResponse(
            success=True,
            data={"choices": [{"message": {"content": f"```\n{fixed}\n```"}}]},
            status_code=200,
        )
        with patch("services.api_client.APIClient") as MockClient, \
             patch("prompts.loader.render_prompt", return_value="fix"):
            mock_instance = MagicMock()
            mock_instance.deepseek.chat_completion = AsyncMock(return_value=response)
            MockClient.return_value = mock_instance

            result = await svc._fix_code_with_llm("broken", "err")

        assert result == fixed
