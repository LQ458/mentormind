"""
Unit Tests – VideoScriptGenerator & Scene / VideoScript dataclasses
====================================================================

Tests cover:
  • VideoScript and Scene dataclass construction and defaults
  • _convert_to_video_script correctness
  • generate_script pipeline integration (all API calls mocked)
  • Max 18 scene cap
  • Scene ordering and ID propagation
  • Fallback when pipeline raises an exception
"""

from __future__ import annotations

import json
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def generator():
    """VideoScriptGenerator with API client mocked out."""
    with patch("services.api_client.APIClient") as MockAPIClient, \
         patch("prompts.loader.load_prompt",   return_value="mock"), \
         patch("prompts.loader.render_prompt", return_value="mock"):

        mock_client = MagicMock()
        mock_client.deepseek.chat_completion = AsyncMock()
        MockAPIClient.return_value = mock_client

        from core.modules.video_scripting import VideoScriptGenerator
        gen = VideoScriptGenerator.__new__(VideoScriptGenerator)
        gen.api_client = mock_client

        from core.modules.robust_video_generation import RobustVideoGenerationPipeline
        gen.robust_pipeline = RobustVideoGenerationPipeline(api_client=mock_client)

        return gen


def _bundle(n_scenes: int = 20, title: str = "Test") -> Dict[str, Any]:
    """Build a fake generation bundle as returned by build_generation_bundle."""
    return {
        "topic": title,
        "style": "general",
        "language": "en",
        "student_level": "beginner",
        "target_audience": "students",
        "duration_minutes": 10,
        "target_scene_count": 24,
        "syllabus": {},
        "storyboard": {},
        "render_plan": {
            "title": title,
            "scenes": [
                {
                    "id": f"scene_{i}",
                    "action": "show_text",
                    "param": f"Param content for scene {i}",
                    "narration": f"Narration for scene number {i}.",
                    "duration": 22.0,
                    "visual_type": "manim",
                    "canvas_config": {
                        "layout": "callout_card",
                        "font_size": 28,
                        "safe_scale": 0.82,
                        "max_chars": 72,
                        "graph": {"x_range": [-6, 6], "y_range": [-6, 6]},
                    },
                }
                for i in range(1, n_scenes + 1)
            ],
        },
        "validation": {
            "warnings": [],
            "scene_count": n_scenes,
            "estimated_total_seconds": n_scenes * 22.0,
            "render_plan": {"title": title, "scenes": []},
        },
        "review": {"approved": True},
        "prompt_versions": {},
    }


# ─────────────────────────────────────────────────────────────────────────────
# Scene dataclass
# ─────────────────────────────────────────────────────────────────────────────

class TestSceneDataclass:

    def test_scene_stores_all_fields(self):
        from core.modules.video_scripting import Scene
        scene = Scene(
            id="s1", duration=25.0,
            narration="Test narration.",
            action="show_text", param="Test param",
        )
        assert scene.id == "s1"
        assert scene.duration == 25.0
        assert scene.narration == "Test narration."
        assert scene.action == "show_text"
        assert scene.param == "Test param"

    def test_scene_default_visual_type(self):
        from core.modules.video_scripting import Scene
        scene = Scene(id="s1", duration=5.0, narration="n", action="plot", param="x")
        assert scene.visual_type == "manim"

    def test_scene_default_canvas_config_is_empty_dict(self):
        from core.modules.video_scripting import Scene
        scene = Scene(id="s1", duration=5.0, narration="n", action="plot", param="x")
        assert isinstance(scene.canvas_config, dict)

    def test_scene_default_audio_path_is_none(self):
        from core.modules.video_scripting import Scene
        scene = Scene(id="s1", duration=5.0, narration="n", action="show_text", param="p")
        assert scene.audio_path is None


# ─────────────────────────────────────────────────────────────────────────────
# VideoScript dataclass
# ─────────────────────────────────────────────────────────────────────────────

class TestVideoScriptDataclass:

    def _make_script(self, n: int = 3):
        from core.modules.video_scripting import Scene, VideoScript
        scenes = [
            Scene(id=f"s{i}", duration=20.0, narration="n", action="show_text", param="p")
            for i in range(1, n + 1)
        ]
        return VideoScript(title="Test", scenes=scenes, total_duration=n * 20.0)

    def test_title_stored(self):
        script = self._make_script()
        assert script.title == "Test"

    def test_engine_defaults_to_manim(self):
        script = self._make_script()
        assert script.engine == "manim"

    def test_scenes_list_length(self):
        script = self._make_script(5)
        assert len(script.scenes) == 5

    def test_total_duration_stored(self):
        script = self._make_script(3)
        assert script.total_duration == 60.0

    def test_debug_artifacts_default_empty_dict(self):
        script = self._make_script()
        assert isinstance(script.debug_artifacts, dict)


# ─────────────────────────────────────────────────────────────────────────────
# _convert_to_video_script
# ─────────────────────────────────────────────────────────────────────────────

class TestConvertToVideoScript:

    def test_converts_basic_render_plan(self, generator):
        bundle = _bundle(5)
        script = generator._convert_to_video_script(bundle["render_plan"])
        assert script.title == "Test"
        assert len(script.scenes) == 5

    def test_total_duration_summed_correctly(self, generator):
        bundle = _bundle(5)   # 5 × 22.0 = 110.0 s
        script = generator._convert_to_video_script(bundle["render_plan"])
        assert abs(script.total_duration - 110.0) < 0.01

    def test_scene_ids_preserved(self, generator):
        bundle = _bundle(3)
        script = generator._convert_to_video_script(bundle["render_plan"])
        assert [s.id for s in script.scenes] == ["scene_1", "scene_2", "scene_3"]

    def test_engine_always_manim(self, generator):
        bundle = _bundle(3)
        # Inject wrong engine into raw data to ensure override
        bundle["render_plan"]["scenes"][0]["visual_type"] = "html"
        script = generator._convert_to_video_script(bundle["render_plan"])
        for scene in script.scenes:
            assert scene.visual_type == "manim"

    def test_max_18_scene_cap_enforced(self, generator):
        """Even if 30 scenes are passed, only 18 are kept."""
        bundle = _bundle(30)
        script = generator._convert_to_video_script(bundle["render_plan"])
        assert len(script.scenes) <= 18

    def test_empty_render_plan_returns_empty_script(self, generator):
        script = generator._convert_to_video_script({})
        assert script.title == "Untitled Lesson"
        assert len(script.scenes) == 0
        assert script.total_duration == 0.0

    def test_missing_duration_defaults_to_5(self, generator):
        plan = {"title": "T", "scenes": [{"id": "s1", "action": "show_text", "param": "p"}]}
        script = generator._convert_to_video_script(plan)
        assert script.scenes[0].duration == 5.0

    def test_canvas_config_propagated(self, generator):
        plan = {
            "title": "T",
            "scenes": [{
                "id": "s1", "action": "show_text", "param": "p",
                "narration": "n", "duration": 22.0,
                "canvas_config": {"layout": "recap_card"},
            }],
        }
        script = generator._convert_to_video_script(plan)
        assert script.scenes[0].canvas_config == {"layout": "recap_card"}

    def test_debug_artifacts_attached(self, generator):
        bundle = _bundle(3)
        script = generator._convert_to_video_script(
            bundle["render_plan"], debug_artifacts={"key": "value"}
        )
        assert script.debug_artifacts["key"] == "value"


# ─────────────────────────────────────────────────────────────────────────────
# generate_script (end-to-end, pipeline mocked)
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerateScript:

    @pytest.mark.asyncio
    async def test_returns_video_script_instance(self, generator):
        from core.modules.video_scripting import VideoScript
        generator.robust_pipeline.build_generation_bundle = AsyncMock(
            return_value=_bundle(20)
        )
        script = await generator.generate_script(
            topic="Calculus", content="Derivatives and integrals."
        )
        assert isinstance(script, VideoScript)

    @pytest.mark.asyncio
    async def test_scenes_capped_at_18(self, generator):
        generator.robust_pipeline.build_generation_bundle = AsyncMock(
            return_value=_bundle(30)
        )
        script = await generator.generate_script(topic="Math", content="Content")
        assert len(script.scenes) <= 18

    @pytest.mark.asyncio
    async def test_engine_is_always_manim(self, generator):
        generator.robust_pipeline.build_generation_bundle = AsyncMock(
            return_value=_bundle(5)
        )
        script = await generator.generate_script(topic="Physics", content="Motion")
        assert script.engine == "manim"

    @pytest.mark.asyncio
    async def test_title_propagated_from_render_plan(self, generator):
        bundle = _bundle(5, title="Quantum Mechanics")
        generator.robust_pipeline.build_generation_bundle = AsyncMock(
            return_value=bundle
        )
        script = await generator.generate_script(topic="QM", content="Content")
        assert script.title == "Quantum Mechanics"

    @pytest.mark.asyncio
    async def test_debug_artifacts_attached_to_script(self, generator):
        generator.robust_pipeline.build_generation_bundle = AsyncMock(
            return_value=_bundle(5)
        )
        script = await generator.generate_script(topic="Biology", content="DNA")
        assert isinstance(script.debug_artifacts, dict)

    @pytest.mark.asyncio
    async def test_exception_in_pipeline_retries_and_recovers(self, generator):
        """If the pipeline raises on first call, the fallback call succeeds."""
        from core.modules.video_scripting import VideoScript

        call_count = 0

        async def side_effect(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("Simulated API failure")
            return _bundle(5)

        generator.robust_pipeline.build_generation_bundle = AsyncMock(
            side_effect=side_effect
        )
        script = await generator.generate_script(topic="Test", content="Content")
        assert isinstance(script, VideoScript)
        assert call_count == 2  # First failed, second succeeded

    @pytest.mark.asyncio
    async def test_language_passed_through_to_pipeline(self, generator):
        captured = {}

        async def capture(**kwargs):
            captured.update(kwargs)
            return _bundle(5)

        generator.robust_pipeline.build_generation_bundle = AsyncMock(
            side_effect=capture
        )
        await generator.generate_script(topic="Math", content="c", language="zh")
        assert captured.get("language") == "zh"

    @pytest.mark.asyncio
    async def test_student_level_passed_through(self, generator):
        captured = {}

        async def capture(**kwargs):
            captured.update(kwargs)
            return _bundle(5)

        generator.robust_pipeline.build_generation_bundle = AsyncMock(
            side_effect=capture
        )
        await generator.generate_script(
            topic="Math", content="c", student_level="advanced"
        )
        assert captured.get("student_level") == "advanced"

    @pytest.mark.asyncio
    async def test_existing_bundle_forwarded_to_pipeline(self, generator):
        captured = {}

        async def capture(**kwargs):
            captured.update(kwargs)
            return _bundle(5)

        generator.robust_pipeline.build_generation_bundle = AsyncMock(
            side_effect=capture
        )
        existing = {"syllabus": {"title": "Existing"}}
        await generator.generate_script(
            topic="T", content="c", existing_bundle=existing
        )
        assert captured.get("existing_bundle") == existing


# ─────────────────────────────────────────────────────────────────────────────
# _generate_mock_script
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerateMockScript:

    def test_math_style_includes_plot_scene(self, generator):
        script = generator._generate_mock_script("Derivatives", "math")
        actions = [s.action for s in script.scenes]
        assert "plot" in actions

    def test_general_style_no_plot_scene(self, generator):
        script = generator._generate_mock_script("History", "general")
        actions = [s.action for s in script.scenes]
        assert "plot" not in actions

    def test_mock_script_has_four_scenes(self, generator):
        script = generator._generate_mock_script("Topic", "general")
        assert len(script.scenes) == 4

    def test_mock_script_total_duration_positive(self, generator):
        script = generator._generate_mock_script("Topic", "general")
        assert script.total_duration > 0

    def test_mock_script_all_visual_types_are_manim(self, generator):
        script = generator._generate_mock_script("Topic", "math")
        for scene in script.scenes:
            assert scene.visual_type == "manim"

    def test_mock_script_title_contains_topic(self, generator):
        script = generator._generate_mock_script("Quantum Physics", "general")
        assert "Quantum Physics" in script.title
