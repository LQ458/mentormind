"""
Video Quality Agent — evaluates and improves educational animation quality.

Principles derived from 3Blue1Brown, Khan Academy, and educational research:
1. Show, don't tell: animate concepts instead of displaying text about them
2. Concise narration: 30-60 words per scene, no filler
3. Progressive reveal: build complexity gradually with visual transformations
4. Examples first: concrete examples before abstract definitions
5. Animation density: something should always be moving on screen

Usage:
    agent = VideoQualityAgent()
    report = await agent.evaluate_render_plan(render_plan)
    improved = await agent.improve_render_plan(render_plan, report)
"""

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ── Quality Metrics ──────────────────────────────────────────────────────────

ANIMATION_ACTIONS = {"transform", "plot", "draw_shape"}
STATIC_ACTIONS = {"show_text", "show_title"}
VISUAL_ACTIONS = {"write_tex", "transform", "plot", "draw_shape"}

# Target ratios for a well-animated video
TARGET_ANIMATION_RATIO = 0.5  # At least 50% of scenes should have motion
TARGET_MAX_STATIC_RATIO = 0.25  # No more than 25% static text slides
TARGET_NARRATION_WORDS = (30, 60)  # Words per scene
TARGET_SCENE_DURATION = (10, 45)  # Seconds per scene
TARGET_SCENE_COUNT = (8, 14)  # Total scenes


class VideoQualityReport:
    """Quality assessment of a render plan."""

    def __init__(self):
        self.score: float = 0.0  # 0-100
        self.issues: List[str] = []
        self.suggestions: List[str] = []
        self.metrics: Dict[str, Any] = {}

    @property
    def grade(self) -> str:
        if self.score >= 85:
            return "A"
        if self.score >= 70:
            return "B"
        if self.score >= 55:
            return "C"
        return "D"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "score": self.score,
            "grade": self.grade,
            "issues": self.issues,
            "suggestions": self.suggestions,
            "metrics": self.metrics,
        }


class VideoQualityAgent:
    """Evaluates and improves educational animation quality."""

    def evaluate_render_plan(self, render_plan: Dict[str, Any]) -> VideoQualityReport:
        """Evaluate a render plan and return a quality report."""
        report = VideoQualityReport()
        scenes = render_plan.get("scenes", [])

        if not scenes:
            report.score = 0
            report.issues.append("No scenes in render plan")
            return report

        # 1. Animation density (30 points)
        animation_score = self._score_animation_density(scenes, report)

        # 2. Narration conciseness (25 points)
        narration_score = self._score_narration_quality(scenes, report)

        # 3. Scene count and duration (20 points)
        structure_score = self._score_structure(scenes, report)

        # 4. Action diversity (15 points)
        diversity_score = self._score_action_diversity(scenes, report)

        # 5. No-filler check (10 points)
        filler_score = self._score_filler_absence(scenes, report)

        report.score = (
            animation_score + narration_score + structure_score
            + diversity_score + filler_score
        )
        return report

    def _score_animation_density(self, scenes: List[Dict], report: VideoQualityReport) -> float:
        """Score: what percentage of scenes have animated actions?"""
        animated = sum(1 for s in scenes if s.get("action") in ANIMATION_ACTIONS)
        ratio = animated / len(scenes)
        report.metrics["animation_ratio"] = round(ratio, 2)
        report.metrics["animated_scenes"] = animated
        report.metrics["total_scenes"] = len(scenes)

        if ratio < 0.3:
            report.issues.append(
                f"Only {animated}/{len(scenes)} scenes have animations. "
                "Most scenes are static text — video will be boring."
            )
            report.suggestions.append(
                "Replace show_text scenes with transform (show equation morphing) "
                "or plot (visualize the concept as a graph)."
            )
        elif ratio < TARGET_ANIMATION_RATIO:
            report.suggestions.append(
                f"Animation ratio is {ratio:.0%}. Aim for ≥50% animated scenes."
            )

        return min(30, ratio * 60)

    def _score_narration_quality(self, scenes: List[Dict], report: VideoQualityReport) -> float:
        """Score: are narrations concise (30-60 words)?"""
        word_counts = []
        verbose_scenes = []
        for s in scenes:
            words = len((s.get("narration") or "").split())
            word_counts.append(words)
            if words > 80:
                verbose_scenes.append((s.get("id", "?"), words))

        avg_words = sum(word_counts) / max(len(word_counts), 1)
        report.metrics["avg_narration_words"] = round(avg_words, 1)
        report.metrics["max_narration_words"] = max(word_counts) if word_counts else 0

        if verbose_scenes:
            report.issues.append(
                f"{len(verbose_scenes)} scenes have narrations over 80 words: "
                + ", ".join(f"{sid} ({w}w)" for sid, w in verbose_scenes[:3])
            )
            report.suggestions.append(
                "Shorten narrations to 30-60 words. The animation should do the teaching, "
                "not the narration. Cut filler phrases and let visuals speak."
            )

        if avg_words <= 60:
            return 25
        if avg_words <= 80:
            return 18
        if avg_words <= 120:
            return 10
        return 5

    def _score_structure(self, scenes: List[Dict], report: VideoQualityReport) -> float:
        """Score: scene count and duration within targets?"""
        count = len(scenes)
        durations = [float(s.get("duration", 0)) for s in scenes]
        total = sum(durations)

        report.metrics["scene_count"] = count
        report.metrics["total_duration_seconds"] = round(total, 1)
        report.metrics["avg_scene_duration"] = round(total / max(count, 1), 1)

        score = 20.0
        if count > 18:
            report.issues.append(f"Too many scenes ({count}). Target 8-14 for a focused video.")
            score -= 8
        elif count < 6:
            report.issues.append(f"Too few scenes ({count}). Need at least 6-8 for substance.")
            score -= 5

        if total > 900:  # > 15 minutes
            report.issues.append(
                f"Total duration {total/60:.1f} min is too long. Target 5-10 minutes."
            )
            score -= 8
        elif total > 600:  # > 10 minutes
            report.suggestions.append(
                f"Duration {total/60:.1f} min. Could be tighter — aim for 5-8 minutes."
            )
            score -= 3

        return max(0, score)

    def _score_action_diversity(self, scenes: List[Dict], report: VideoQualityReport) -> float:
        """Score: does the video use a variety of animation types?"""
        action_counts: Dict[str, int] = {}
        for s in scenes:
            action = s.get("action", "show_text")
            action_counts[action] = action_counts.get(action, 0) + 1

        report.metrics["action_distribution"] = action_counts
        unique_actions = set(action_counts.keys())
        visual_used = unique_actions & VISUAL_ACTIONS

        score = min(15, len(visual_used) * 4)

        if "transform" not in action_counts:
            report.suggestions.append(
                "No transform scenes. Use equation morphing to show mathematical relationships."
            )
            score -= 3
        if "plot" not in action_counts:
            report.suggestions.append(
                "No plot scenes. Graphs help visualize functions and relationships."
            )
            score -= 2

        return max(0, score)

    def _score_filler_absence(self, scenes: List[Dict], report: VideoQualityReport) -> float:
        """Score: check for filler phrases in narrations."""
        filler_phrases = [
            "let's pause and think",
            "it's worth noting",
            "as we can see",
            "in other words",
            "let me explain",
            "to put it simply",
            "as you might imagine",
            "it goes without saying",
            "needless to say",
        ]
        filler_count = 0
        for s in scenes:
            narration = (s.get("narration") or "").lower()
            for phrase in filler_phrases:
                if phrase in narration:
                    filler_count += 1

        report.metrics["filler_phrases_found"] = filler_count

        if filler_count > 3:
            report.issues.append(
                f"Found {filler_count} filler phrases. Cut them — every word should teach."
            )
        elif filler_count > 0:
            report.suggestions.append(
                f"Found {filler_count} filler phrase(s). Consider removing for tighter narration."
            )

        return max(0, 10 - filler_count * 2)

    def improve_render_plan(
        self, render_plan: Dict[str, Any], report: VideoQualityReport
    ) -> Dict[str, Any]:
        """Apply automatic improvements based on the quality report."""
        scenes = render_plan.get("scenes", [])
        improved_scenes = []

        for scene in scenes:
            scene = dict(scene)  # copy

            # Trim verbose narrations
            narration = scene.get("narration", "")
            words = narration.split()
            if len(words) > 80:
                # Keep first 60 words — usually the most important content
                scene["narration"] = " ".join(words[:60])
                logger.info(f"Trimmed narration for {scene.get('id')}: {len(words)} → 60 words")

            # Cap scene duration
            duration = float(scene.get("duration", 20))
            if duration > 45:
                scene["duration"] = 40.0
            if duration < 10:
                scene["duration"] = 12.0

            improved_scenes.append(scene)

        # Drop excess scenes (keep first 14)
        if len(improved_scenes) > 14:
            logger.info(f"Trimming scene count from {len(improved_scenes)} to 14")
            improved_scenes = improved_scenes[:14]

        return {
            "title": render_plan.get("title", "Untitled"),
            "scenes": improved_scenes,
        }

    # ── Post-Render Evaluation ──────────────────────────────────────────────

    def evaluate_final_output(
        self,
        *,
        result: Any,
        request_data: dict,
        video_absolute_path: str | None = None,
        audio_absolute_path: str | None = None,
    ) -> Dict[str, Any]:
        """
        Evaluate the final generated video after rendering completes.
        Returns a quality dict with overall_score (0-10), component scores,
        strengths, improvement_areas, and confidence.

        Scoring weights (total = 10):
          - Render plan quality  : 3.0  (from VideoQualityAgent pre-render score)
          - Render success rate  : 2.5  (scenes successfully rendered / total)
          - Video file health    : 2.0  (file exists, size, valid streams)
          - Audio coverage       : 1.5  (audio exists, duration reasonable)
          - Content completeness : 1.0  (content validator score)
        """
        import os, json

        strengths: list[str] = []
        issues: list[str] = []
        component_scores: Dict[str, float] = {}

        # ── 1. Render plan quality (0-3.0) ──────────────────────────────────
        render_plan_score_100 = 0.0
        debug = {}
        if hasattr(result, "ai_insights") and isinstance(result.ai_insights, dict):
            debug = (result.ai_insights.get("generation_debug") or {})
            pipeline = debug.get("generation_pipeline") or {}
            qr = pipeline.get("quality_report") or {}
            render_plan_score_100 = float(qr.get("score", 0))
        elif isinstance(result, dict):
            debug = (result.get("ai_insights") or {}).get("generation_debug") or {}
            pipeline = debug.get("generation_pipeline") or {}
            qr = pipeline.get("quality_report") or {}
            render_plan_score_100 = float(qr.get("score", 0))

        rp_score = min(3.0, (render_plan_score_100 / 100) * 3.0)
        component_scores["render_plan_quality"] = round(rp_score, 2)
        if render_plan_score_100 >= 70:
            strengths.append(f"Strong render plan (score {render_plan_score_100:.0f}/100)")
        elif render_plan_score_100 > 0:
            issues.append(f"Render plan quality is mediocre ({render_plan_score_100:.0f}/100)")

        # ── 2. Render success rate (0-2.5) ──────────────────────────────────
        render_stats = debug.get("render_stats") or {}
        total_scenes = int(render_stats.get("total_scenes", 0))
        rendered_scenes = int(render_stats.get("rendered_scenes", 0))
        failed_scenes = int(render_stats.get("failed_scenes", 0))

        if total_scenes == 0:
            # Fallback: count from scene_audio
            scene_audio = debug.get("scene_audio") or []
            total_scenes = len(scene_audio)
            rendered_scenes = sum(
                1 for s in scene_audio
                if s.get("duration") and float(s["duration"]) > 0
            )
            failed_scenes = total_scenes - rendered_scenes

        if total_scenes > 0:
            success_ratio = rendered_scenes / total_scenes
            rs_score = success_ratio * 2.5
            if success_ratio >= 0.9:
                strengths.append(f"Excellent render rate: {rendered_scenes}/{total_scenes} scenes")
            elif success_ratio >= 0.7:
                issues.append(f"Some scenes failed: {rendered_scenes}/{total_scenes} rendered ({failed_scenes} failed)")
            else:
                issues.append(f"Low render success: only {rendered_scenes}/{total_scenes} scenes rendered ({failed_scenes} failed)")
        else:
            rs_score = 1.5 if (getattr(result, "video_url", None) or (isinstance(result, dict) and result.get("video_url"))) else 0.0
        component_scores["render_success_rate"] = round(rs_score, 2)

        # ── 3. Video file health (0-2.0) ────────────────────────────────────
        vf_score = 0.0
        if video_absolute_path and os.path.isfile(video_absolute_path):
            file_size_mb = os.path.getsize(video_absolute_path) / (1024 * 1024)
            vf_score += 0.8  # file exists
            if file_size_mb > 0.1:
                vf_score += 0.6  # non-trivial size
                strengths.append(f"Video file OK ({file_size_mb:.1f} MB)")
            else:
                issues.append(f"Video file suspiciously small ({file_size_mb:.2f} MB)")
            # Check video probe
            video_probe = debug.get("video_probe") or {}
            if video_probe.get("has_audio_stream") is True:
                vf_score += 0.6
            elif video_probe.get("has_audio_stream") is False:
                issues.append("Video file missing audio stream")
        else:
            issues.append("No video file produced")
        component_scores["video_file_health"] = round(min(2.0, vf_score), 2)

        # ── 4. Audio coverage (0-1.5) ───────────────────────────────────────
        af_score = 0.0
        if audio_absolute_path and os.path.isfile(audio_absolute_path):
            audio_size = os.path.getsize(audio_absolute_path)
            af_score += 0.8
            if audio_size > 10_000:  # > 10 KB
                af_score += 0.7
                strengths.append("Audio file present and valid")
            else:
                issues.append("Audio file too small — may be empty")
        else:
            # Check if audio_url exists at all
            audio_url = getattr(result, "audio_url", None) or (isinstance(result, dict) and result.get("audio_url"))
            if audio_url:
                af_score = 0.8  # URL exists but can't verify file
            else:
                issues.append("No audio produced")
        component_scores["audio_coverage"] = round(min(1.5, af_score), 2)

        # ── 5. Content completeness (0-1.0) ─────────────────────────────────
        cc_score = 0.0
        validation = (debug.get("generation_pipeline") or {}).get("validation") or {}
        content_val = validation.get("content_validation") or {}
        completeness = float(content_val.get("completeness_score", 0))
        if completeness > 0:
            cc_score = completeness * 1.0
            if completeness >= 0.8:
                strengths.append(f"Content completeness: {completeness:.0%}")
            elif completeness < 0.5:
                issues.append(f"Content incomplete ({completeness:.0%})")
        else:
            # No validation data — give partial credit if video exists
            cc_score = 0.5 if vf_score > 0 else 0.0
        component_scores["content_completeness"] = round(min(1.0, cc_score), 2)

        # ── Final score ─────────────────────────────────────────────────────
        overall = sum(component_scores.values())
        overall = round(max(0.0, min(10.0, overall)), 1)

        # Confidence based on how much data we had to evaluate
        data_points = sum([
            render_plan_score_100 > 0,
            total_scenes > 0,
            video_absolute_path is not None and os.path.isfile(video_absolute_path or ""),
            audio_absolute_path is not None and os.path.isfile(audio_absolute_path or ""),
            completeness > 0,
        ])
        confidence = round(min(1.0, data_points / 5), 2)

        grade = "A" if overall >= 8.5 else "B" if overall >= 7.0 else "C" if overall >= 5.5 else "D"

        return {
            "overall_score": overall,
            "grade": grade,
            "component_scores": component_scores,
            "strengths": strengths[:5],
            "improvement_areas": issues[:5],
            "confidence": confidence,
            "assessment_quality": "measured",
            "total_scenes": total_scenes,
            "rendered_scenes": rendered_scenes if total_scenes > 0 else None,
        }
