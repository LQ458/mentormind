"""
Unit tests for VideoQualityAgent and VideoQualityReport.

Tests cover:
- VideoQualityReport: initial state, grade thresholds, to_dict structure
- evaluate_render_plan: animation density, narration quality, structure,
  action diversity, filler absence
- improve_render_plan: narration trimming, duration capping, scene count trimming
- evaluate_final_output: component scores, grade assignment, file health
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

import pytest

from core.agents.video_quality_agent import (
    ANIMATION_ACTIONS,
    STATIC_ACTIONS,
    TARGET_ANIMATION_RATIO,
    TARGET_NARRATION_WORDS,
    TARGET_SCENE_COUNT,
    VideoQualityAgent,
    VideoQualityReport,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_scene(
    scene_id: str = "s1",
    action: str = "show_text",
    narration: str = "This is a normal narration sentence for the scene.",
    duration: float = 20.0,
    param: str = "Some param",
) -> Dict[str, Any]:
    return {
        "id": scene_id,
        "action": action,
        "narration": narration,
        "duration": duration,
        "param": param,
    }


def _make_plan(scenes: List[Dict[str, Any]], title: str = "Test Lesson") -> Dict[str, Any]:
    return {"title": title, "scenes": scenes}


def _words(n: int) -> str:
    """Return a string of exactly n space-separated words."""
    return " ".join(f"word{i}" for i in range(n))


# ─────────────────────────────────────────────────────────────────────────────
# 1. VideoQualityReport
# ─────────────────────────────────────────────────────────────────────────────

class TestVideoQualityReport:

    def test_initial_values(self):
        report = VideoQualityReport()
        assert report.score == 0.0
        assert report.issues == []
        assert report.suggestions == []
        assert report.metrics == {}

    def test_grade_a_at_85(self):
        report = VideoQualityReport()
        report.score = 85.0
        assert report.grade == "A"

    def test_grade_a_above_85(self):
        report = VideoQualityReport()
        report.score = 100.0
        assert report.grade == "A"

    def test_grade_b_at_70(self):
        report = VideoQualityReport()
        report.score = 70.0
        assert report.grade == "B"

    def test_grade_b_below_85(self):
        report = VideoQualityReport()
        report.score = 84.9
        assert report.grade == "B"

    def test_grade_c_at_55(self):
        report = VideoQualityReport()
        report.score = 55.0
        assert report.grade == "C"

    def test_grade_c_below_70(self):
        report = VideoQualityReport()
        report.score = 69.9
        assert report.grade == "C"

    def test_grade_d_below_55(self):
        report = VideoQualityReport()
        report.score = 54.9
        assert report.grade == "D"

    def test_grade_d_at_zero(self):
        report = VideoQualityReport()
        report.score = 0.0
        assert report.grade == "D"

    def test_to_dict_returns_correct_structure(self):
        report = VideoQualityReport()
        report.score = 75.0
        report.issues = ["issue one"]
        report.suggestions = ["suggestion one"]
        report.metrics = {"animation_ratio": 0.6}

        d = report.to_dict()

        assert d["score"] == 75.0
        assert d["grade"] == "B"
        assert d["issues"] == ["issue one"]
        assert d["suggestions"] == ["suggestion one"]
        assert d["metrics"] == {"animation_ratio": 0.6}

    def test_to_dict_keys_present(self):
        report = VideoQualityReport()
        d = report.to_dict()
        for key in ("score", "grade", "issues", "suggestions", "metrics"):
            assert key in d


# ─────────────────────────────────────────────────────────────────────────────
# 2. evaluate_render_plan
# ─────────────────────────────────────────────────────────────────────────────

class TestEvaluateRenderPlan:

    @pytest.fixture
    def agent(self):
        return VideoQualityAgent()

    def test_empty_scenes_returns_zero_score(self, agent):
        report = agent.evaluate_render_plan({"scenes": []})
        assert report.score == 0

    def test_empty_scenes_has_no_scenes_issue(self, agent):
        report = agent.evaluate_render_plan({"scenes": []})
        assert any("No scenes" in issue for issue in report.issues)

    def test_all_animated_scenes_high_animation_score(self, agent):
        scenes = [
            _make_scene(f"s{i}", action="transform", narration=_words(40))
            for i in range(10)
        ]
        report = agent.evaluate_render_plan(_make_plan(scenes))
        # 30 pts max for animation, ratio=1.0 → min(30, 1.0*60)=30
        assert report.metrics["animation_ratio"] == 1.0
        assert report.score > 50

    def test_all_static_scenes_low_animation_score_with_issues(self, agent):
        scenes = [
            _make_scene(f"s{i}", action="show_text", narration=_words(40))
            for i in range(10)
        ]
        report = agent.evaluate_render_plan(_make_plan(scenes))
        assert report.metrics["animation_ratio"] == 0.0
        assert any("boring" in issue.lower() or "static" in issue.lower() for issue in report.issues)

    def test_narrations_under_60_words_full_narration_score(self, agent):
        # Exactly 10 scenes in range, 40-word narrations → avg ≤60 → 25 pts
        scenes = [
            _make_scene(f"s{i}", action="transform", narration=_words(40), duration=30)
            for i in range(10)
        ]
        report = agent.evaluate_render_plan(_make_plan(scenes))
        assert report.metrics["avg_narration_words"] <= 60

    def test_verbose_narrations_lower_score_and_issues(self, agent):
        # >80 words triggers issue
        scenes = [
            _make_scene(f"s{i}", action="show_text", narration=_words(100), duration=30)
            for i in range(10)
        ]
        report = agent.evaluate_render_plan(_make_plan(scenes))
        assert any("over 80 words" in issue or "80" in issue for issue in report.issues)
        # Narration score should be below the 25-pt maximum
        assert report.metrics["avg_narration_words"] > 80

    def test_scene_count_in_target_range_full_structure_score(self, agent):
        # 10 scenes in [8,14], duration 30s each → no structure issues
        scenes = [
            _make_scene(f"s{i}", action="transform", narration=_words(40), duration=30)
            for i in range(10)
        ]
        report = agent.evaluate_render_plan(_make_plan(scenes))
        assert report.metrics["scene_count"] == 10
        # No scene-count issues
        assert not any("Too many" in i or "Too few" in i for i in report.issues)

    def test_too_many_scenes_issue_and_reduced_score(self, agent):
        scenes = [
            _make_scene(f"s{i}", action="transform", narration=_words(40), duration=30)
            for i in range(20)
        ]
        report = agent.evaluate_render_plan(_make_plan(scenes))
        assert any("Too many" in issue for issue in report.issues)

    def test_too_few_scenes_issue(self, agent):
        scenes = [
            _make_scene(f"s{i}", action="transform", narration=_words(40), duration=30)
            for i in range(4)
        ]
        report = agent.evaluate_render_plan(_make_plan(scenes))
        assert any("Too few" in issue for issue in report.issues)

    def test_duration_too_long_issue(self, agent):
        # total > 900s → issue
        scenes = [
            _make_scene(f"s{i}", action="transform", narration=_words(40), duration=100)
            for i in range(10)
        ]
        report = agent.evaluate_render_plan(_make_plan(scenes))
        assert any("too long" in issue.lower() or "duration" in issue.lower() for issue in report.issues)

    def test_good_action_diversity_high_diversity_score(self, agent):
        # transform, plot, write_tex, draw_shape — all 4 VISUAL_ACTIONS
        actions = ["transform", "plot", "write_tex", "draw_shape", "transform", "plot",
                   "write_tex", "draw_shape", "transform", "plot"]
        scenes = [
            _make_scene(f"s{i}", action=actions[i], narration=_words(40), duration=30)
            for i in range(10)
        ]
        report = agent.evaluate_render_plan(_make_plan(scenes))
        # 4 visual actions × 4 pts = 16, capped to 15
        assert report.score > 40

    def test_no_transform_or_plot_suggestions(self, agent):
        # Only show_text and write_tex — missing transform and plot
        actions = ["show_text", "write_tex", "show_text", "write_tex",
                   "show_text", "write_tex", "show_text", "write_tex",
                   "show_text", "write_tex"]
        scenes = [
            _make_scene(f"s{i}", action=actions[i], narration=_words(40), duration=30)
            for i in range(10)
        ]
        report = agent.evaluate_render_plan(_make_plan(scenes))
        suggestion_text = " ".join(report.suggestions)
        assert "transform" in suggestion_text.lower() or "plot" in suggestion_text.lower()

    def test_filler_phrases_reduce_filler_score(self, agent):
        filler_narration = (
            "Let's pause and think about this concept. "
            "As we can see from the diagram. "
            "In other words the derivative is just a rate of change. "
            "It's worth noting that continuity is required. "
            "Needless to say this is important. word " * 5
        )
        scenes = [
            _make_scene(f"s{i}", action="show_text", narration=filler_narration, duration=30)
            for i in range(10)
        ]
        report = agent.evaluate_render_plan(_make_plan(scenes))
        assert report.metrics["filler_phrases_found"] > 3
        assert any("filler" in issue.lower() for issue in report.issues)

    def test_no_filler_phrases_full_filler_score(self, agent):
        clean_narration = _words(40)
        scenes = [
            _make_scene(f"s{i}", action="transform", narration=clean_narration, duration=30)
            for i in range(10)
        ]
        report = agent.evaluate_render_plan(_make_plan(scenes))
        assert report.metrics["filler_phrases_found"] == 0
        # filler score = 10 - 0*2 = 10
        # Verify it did not trigger a filler issue
        assert not any("filler" in issue.lower() for issue in report.issues)


# ─────────────────────────────────────────────────────────────────────────────
# 3. improve_render_plan
# ─────────────────────────────────────────────────────────────────────────────

class TestImproveRenderPlan:

    @pytest.fixture
    def agent(self):
        return VideoQualityAgent()

    @pytest.fixture
    def dummy_report(self):
        return VideoQualityReport()

    def test_verbose_narration_trimmed_to_60_words(self, agent, dummy_report):
        verbose = _words(100)
        scenes = [_make_scene("s1", narration=verbose, duration=30)]
        result = agent.improve_render_plan(_make_plan(scenes), dummy_report)
        improved_narration = result["scenes"][0]["narration"]
        assert len(improved_narration.split()) == 60

    def test_duration_above_45_capped_to_40(self, agent, dummy_report):
        scenes = [_make_scene("s1", narration=_words(40), duration=60)]
        result = agent.improve_render_plan(_make_plan(scenes), dummy_report)
        assert result["scenes"][0]["duration"] == 40.0

    def test_duration_below_10_increased_to_12(self, agent, dummy_report):
        scenes = [_make_scene("s1", narration=_words(40), duration=5)]
        result = agent.improve_render_plan(_make_plan(scenes), dummy_report)
        assert result["scenes"][0]["duration"] == 12.0

    def test_more_than_14_scenes_trimmed_to_14(self, agent, dummy_report):
        scenes = [
            _make_scene(f"s{i}", narration=_words(40), duration=30)
            for i in range(20)
        ]
        result = agent.improve_render_plan(_make_plan(scenes), dummy_report)
        assert len(result["scenes"]) == 14

    def test_normal_plan_unchanged(self, agent, dummy_report):
        narration = _words(50)
        scenes = [
            _make_scene(f"s{i}", narration=narration, duration=30)
            for i in range(10)
        ]
        result = agent.improve_render_plan(_make_plan(scenes), dummy_report)
        assert len(result["scenes"]) == 10
        for scene in result["scenes"]:
            assert len(scene["narration"].split()) == 50
            assert scene["duration"] == 30.0

    def test_title_preserved(self, agent, dummy_report):
        scenes = [_make_scene("s1", narration=_words(40), duration=30)]
        plan = _make_plan(scenes, title="My Lesson Title")
        result = agent.improve_render_plan(plan, dummy_report)
        assert result["title"] == "My Lesson Title"

    def test_narration_exactly_80_words_not_trimmed(self, agent, dummy_report):
        narration_80 = _words(80)
        scenes = [_make_scene("s1", narration=narration_80, duration=30)]
        result = agent.improve_render_plan(_make_plan(scenes), dummy_report)
        # 80 words is not > 80, so it should remain untrimmed
        assert len(result["scenes"][0]["narration"].split()) == 80


# ─────────────────────────────────────────────────────────────────────────────
# 4. evaluate_final_output
# ─────────────────────────────────────────────────────────────────────────────

class TestEvaluateFinalOutput:

    @pytest.fixture
    def agent(self):
        return VideoQualityAgent()

    def _result_dict(self, score: float = 0.0) -> Dict[str, Any]:
        """Build a minimal result dict with optional render plan quality score."""
        return {
            "ai_insights": {
                "generation_debug": {
                    "generation_pipeline": {
                        "quality_report": {"score": score},
                    }
                }
            }
        }

    def test_no_data_low_score_and_confidence(self, agent):
        result = agent.evaluate_final_output(result={}, request_data={})
        assert result["overall_score"] < 5.0
        assert result["confidence"] < 0.5

    def test_good_render_plan_score_contributes_component(self, agent):
        result_data = self._result_dict(score=80.0)
        out = agent.evaluate_final_output(result=result_data, request_data={})
        assert out["component_scores"]["render_plan_quality"] > 0.0

    def test_high_render_success_rate_adds_strength(self, agent):
        result_data = {
            "ai_insights": {
                "generation_debug": {
                    "render_stats": {
                        "total_scenes": 10,
                        "rendered_scenes": 10,
                        "failed_scenes": 0,
                    },
                    "generation_pipeline": {"quality_report": {"score": 0}},
                }
            }
        }
        out = agent.evaluate_final_output(result=result_data, request_data={})
        strengths_text = " ".join(out["strengths"])
        assert "render" in strengths_text.lower() or "10/10" in strengths_text

    def test_video_file_exists_and_large_gives_health_points(self, agent, tmp_path):
        video_file = tmp_path / "output.mp4"
        # Write > 0.1 MB of data
        video_file.write_bytes(b"x" * (200 * 1024))
        out = agent.evaluate_final_output(
            result={},
            request_data={},
            video_absolute_path=str(video_file),
        )
        assert out["component_scores"]["video_file_health"] > 0.8

    def test_no_video_file_reports_issue(self, agent):
        out = agent.evaluate_final_output(
            result={},
            request_data={},
            video_absolute_path=None,
        )
        issues_text = " ".join(out["improvement_areas"])
        assert "video" in issues_text.lower()

    def test_audio_file_exists_gives_coverage_points(self, agent, tmp_path):
        audio_file = tmp_path / "audio.mp3"
        # Write > 10 KB
        audio_file.write_bytes(b"a" * 20_000)
        out = agent.evaluate_final_output(
            result={},
            request_data={},
            audio_absolute_path=str(audio_file),
        )
        assert out["component_scores"]["audio_coverage"] > 0.0
        strengths_text = " ".join(out["strengths"])
        assert "audio" in strengths_text.lower()

    def test_grade_a_at_8_5(self, agent, tmp_path):
        # Construct a scenario that achieves overall >= 8.5
        # render_plan_quality max 3.0 (score=100)
        # render_success_rate max 2.5 (10/10 scenes)
        # video_file_health max ~1.4 (file exists, large, no probe data)
        # audio_coverage max 1.5 (audio file, large)
        # content_completeness 0.5 fallback when video exists
        video_file = tmp_path / "video.mp4"
        video_file.write_bytes(b"v" * (500 * 1024))
        audio_file = tmp_path / "audio.mp3"
        audio_file.write_bytes(b"a" * 50_000)

        result_data = {
            "ai_insights": {
                "generation_debug": {
                    "render_stats": {
                        "total_scenes": 10,
                        "rendered_scenes": 10,
                        "failed_scenes": 0,
                    },
                    "generation_pipeline": {
                        "quality_report": {"score": 100},
                        "validation": {
                            "content_validation": {"completeness_score": 1.0}
                        },
                    },
                }
            }
        }
        out = agent.evaluate_final_output(
            result=result_data,
            request_data={},
            video_absolute_path=str(video_file),
            audio_absolute_path=str(audio_file),
        )
        assert out["overall_score"] >= 8.5
        assert out["grade"] == "A"

    def test_grade_b_range(self, agent, tmp_path):
        """Build a scenario that lands overall_score in [7.0, 8.5) → grade B.

        Components:
          render_plan_quality: score=100 → 3.0
          render_success_rate: 10/10 → 2.5
          video_file_health:   file exists + >0.1MB → 1.4  (no audio stream)
          audio_coverage:      no audio → 0.0
          content_completeness: completeness=0, but video exists → 0.5
        Total: 3.0 + 2.5 + 1.4 + 0.0 + 0.5 = 7.4 → grade B
        """
        video_file = tmp_path / "video.mp4"
        video_file.write_bytes(b"\x00" * 200_000)  # >0.1 MB
        result_data = {
            "ai_insights": {
                "generation_debug": {
                    "render_stats": {"total_scenes": 10, "rendered_scenes": 10, "failed_scenes": 0},
                    "generation_pipeline": {"quality_report": {"score": 100}},
                }
            }
        }
        out = agent.evaluate_final_output(
            result=result_data, request_data={},
            video_absolute_path=str(video_file),
        )
        assert 7.0 <= out["overall_score"] < 8.5
        assert out["grade"] == "B"

    def test_grade_c_range(self, agent, tmp_path):
        """Build a scenario that lands overall_score in [5.5, 7.0) → grade C.

        Components:
          render_plan_quality: score=80 → 2.4
          render_success_rate: 7/10 → 1.75
          video_file_health:   file exists but tiny → 0.8
          audio_coverage:      no audio → 0.0
          content_completeness: completeness=0.5 → 0.5
        Total: 2.4 + 1.75 + 0.8 + 0.0 + 0.5 = 5.45... round up with completeness
        """
        video_file = tmp_path / "video.mp4"
        video_file.write_bytes(b"\x00" * 50)  # tiny file
        result_data = {
            "ai_insights": {
                "generation_debug": {
                    "render_stats": {"total_scenes": 10, "rendered_scenes": 7, "failed_scenes": 3},
                    "generation_pipeline": {
                        "quality_report": {"score": 80},
                        "validation": {"content_validation": {"completeness_score": 0.6}},
                    },
                }
            }
        }
        out = agent.evaluate_final_output(
            result=result_data, request_data={},
            video_absolute_path=str(video_file),
        )
        assert 5.5 <= out["overall_score"] < 7.0
        assert out["grade"] == "C"

    def test_grade_d_range(self, agent):
        """Minimal data → low score → grade D."""
        result_data = {
            "ai_insights": {
                "generation_debug": {
                    "render_stats": {"total_scenes": 10, "rendered_scenes": 2, "failed_scenes": 8},
                    "generation_pipeline": {"quality_report": {"score": 20}},
                }
            }
        }
        out = agent.evaluate_final_output(result=result_data, request_data={})
        assert out["overall_score"] < 5.5
        assert out["grade"] == "D"

    def test_grade_d_for_no_data(self, agent):
        out = agent.evaluate_final_output(result={}, request_data={})
        assert out["grade"] == "D"

    def test_output_has_required_keys(self, agent):
        out = agent.evaluate_final_output(result={}, request_data={})
        for key in (
            "overall_score", "grade", "component_scores",
            "strengths", "improvement_areas", "confidence",
        ):
            assert key in out

    def test_component_scores_has_all_components(self, agent):
        out = agent.evaluate_final_output(result={}, request_data={})
        for key in (
            "render_plan_quality",
            "render_success_rate",
            "video_file_health",
            "audio_coverage",
            "content_completeness",
        ):
            assert key in out["component_scores"]

    def test_overall_score_bounded_0_to_10(self, agent):
        out = agent.evaluate_final_output(result={}, request_data={})
        assert 0.0 <= out["overall_score"] <= 10.0

    def test_confidence_bounded_0_to_1(self, agent):
        out = agent.evaluate_final_output(result={}, request_data={})
        assert 0.0 <= out["confidence"] <= 1.0

    def test_confidence_increases_with_more_data(self, agent, tmp_path):
        video_file = tmp_path / "video.mp4"
        video_file.write_bytes(b"v" * (200 * 1024))
        audio_file = tmp_path / "audio.mp3"
        audio_file.write_bytes(b"a" * 20_000)

        result_data = {
            "ai_insights": {
                "generation_debug": {
                    "render_stats": {"total_scenes": 10, "rendered_scenes": 9, "failed_scenes": 1},
                    "generation_pipeline": {
                        "quality_report": {"score": 75},
                        "validation": {"content_validation": {"completeness_score": 0.9}},
                    },
                }
            }
        }
        out_full = agent.evaluate_final_output(
            result=result_data,
            request_data={},
            video_absolute_path=str(video_file),
            audio_absolute_path=str(audio_file),
        )
        out_empty = agent.evaluate_final_output(result={}, request_data={})
        assert out_full["confidence"] > out_empty["confidence"]

    def test_nonexistent_video_path_reports_no_video_issue(self, agent):
        out = agent.evaluate_final_output(
            result={},
            request_data={},
            video_absolute_path="/nonexistent/path/video.mp4",
        )
        issues_text = " ".join(out["improvement_areas"])
        assert "video" in issues_text.lower()
        assert out["component_scores"]["video_file_health"] == 0.0

    def test_result_as_object_with_ai_insights(self, agent):
        """result can be an object with .ai_insights attribute."""
        from types import SimpleNamespace
        result_obj = SimpleNamespace(
            ai_insights={
                "generation_debug": {
                    "generation_pipeline": {"quality_report": {"score": 90}},
                }
            }
        )
        out = agent.evaluate_final_output(result=result_obj, request_data={})
        assert out["component_scores"]["render_plan_quality"] > 2.0
