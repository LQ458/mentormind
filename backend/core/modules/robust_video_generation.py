"""
Robust staged generation for MentorMind videos.

Pipeline:
1. Syllabus planner
2. Storyboard builder
3. Render-plan compiler
4. Deterministic validation and repair
5. Optional review pass
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any, Dict, List, Optional

from prompts.loader import load_prompt, render_prompt
from services.api_client import APIClient, get_language_instruction

logger = logging.getLogger(__name__)

ALLOWED_ACTIONS = {
    "show_title",
    "show_text",
    "write_tex",
    "plot",
    "transform",
    "draw_shape",
}

ALLOWED_LAYOUTS = {
    "title_card",
    "equation_focus",
    "graph_focus",
    "two_column",
    "callout_card",
    "recap_card",
}

DEFAULT_GRAPH = {"x_range": [-6, 6], "y_range": [-6, 6]}


class RobustVideoGenerationPipeline:
    """Generate a teaching-oriented render plan with explicit validation artifacts."""

    def __init__(self, api_client: Optional[APIClient] = None):
        self.api_client = api_client or APIClient()

    async def build_generation_bundle(
        self,
        topic: str,
        content: str,
        style: str = "general",
        language: str = "en",
        student_level: str = "beginner",
        target_audience: str = "students",
        duration_minutes: int = 10,
        custom_requirements: Optional[str] = None,
        existing_bundle: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        duration_minutes = max(10, int(duration_minutes or 10))
        # Increase scene count significantly for long-form lessons
        target_scene_count = max(24, min(32, duration_minutes + 14))
        language_instruction = get_language_instruction(language)
        
        # Reuse syllabus if available from previous attempt to save time and tokens
        syllabus = existing_bundle.get("syllabus") if existing_bundle else None
        
        if not syllabus:
            syllabus_fallback = self._fallback_syllabus(topic, style, student_level)
            syllabus = await self._run_stage(
                "syllabus",
                "video/lesson_syllabus",
                {
                    "topic": topic,
                    "content": content,
                    "style": style,
                    "language_instruction": language_instruction,
                    "student_level": student_level,
                    "target_audience": target_audience,
                    "duration_minutes": duration_minutes,
                    "target_scene_count": target_scene_count,
                    "custom_requirements": custom_requirements or "None provided.",
                },
                syllabus_fallback,
                temperature=0.2,
                max_tokens=3200,
            )

        storyboard_fallback = self._fallback_storyboard(topic, content, syllabus, language)
        storyboard = await self._run_stage(
            "storyboard",
            "video/storyboard_builder",
            {
                "topic": topic,
                "style": style,
                "student_level": student_level,
                "target_audience": target_audience,
                "duration_minutes": duration_minutes,
                "target_scene_count": target_scene_count,
                "custom_requirements": custom_requirements or "None provided.",
                "language_instruction": language_instruction,
                "syllabus_json": json.dumps(syllabus, ensure_ascii=False, indent=2),
            },
            storyboard_fallback,
            temperature=0.2,
            max_tokens=8000,
        )

        render_fallback = self._fallback_render_plan(topic, storyboard, language)
        render_plan = await self._run_stage(
            "render_plan",
            "video/render_plan_builder",
            {
                "topic": topic,
                "style": style,
                "student_level": student_level,
                "duration_minutes": duration_minutes,
                "language_instruction": language_instruction,
                "storyboard_json": json.dumps(storyboard, ensure_ascii=False, indent=2),
            },
            render_fallback,
            temperature=0.1,
            max_tokens=8000,
        )

        validation = self._validate_render_plan(render_plan, language, duration_minutes)
        repaired_render_plan = validation["render_plan"]

        review = await self._review_render_plan(topic, style, repaired_render_plan)
        if review.get("recommended_fixes"):
            repaired_render_plan, review_applied = self._apply_review_patches(
                repaired_render_plan,
                review["recommended_fixes"],
                language,
            )
            validation["review_applied"] = review_applied

        prompt_versions = {
            name: self._prompt_version(name)
            for name in [
                "video/lesson_syllabus",
                "video/storyboard_builder",
                "video/render_plan_builder",
                "video/render_plan_review",
            ]
        }

        return {
            "topic": topic,
            "style": style,
            "language": language,
            "student_level": student_level,
            "target_audience": target_audience,
            "duration_minutes": duration_minutes,
            "target_scene_count": target_scene_count,
            "syllabus": syllabus,
            "storyboard": storyboard,
            "render_plan": repaired_render_plan,
            "validation": validation,
            "review": review,
            "prompt_versions": prompt_versions,
        }

    async def _run_stage(
        self,
        stage_name: str,
        prompt_name: str,
        variables: Dict[str, Any],
        fallback: Dict[str, Any],
        *,
        temperature: float,
        max_tokens: int,
    ) -> Dict[str, Any]:
        prompt = render_prompt(prompt_name, **variables)
        try:
            response = await self.api_client.deepseek.chat_completion(
                messages=[
                    {"role": "system", "content": "Return strict JSON only."},
                    {"role": "user", "content": prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            if not response.success:
                logger.warning("Stage %s failed: %s", stage_name, response.error)
                return fallback

            content = response.data["choices"][0]["message"]["content"]
            parsed = self._parse_json_response(content)
            if isinstance(parsed, dict):
                return parsed

            logger.warning("Stage %s returned non-dict JSON, using fallback", stage_name)
            return fallback
        except Exception as exc:
            logger.warning("Stage %s exception: %s", stage_name, exc)
            return fallback

    async def _review_render_plan(self, topic: str, style: str, render_plan: Dict[str, Any]) -> Dict[str, Any]:
        fallback = {"approved": True, "issues": [], "recommended_fixes": []}
        prompt = render_prompt(
            "video/render_plan_review",
            topic=topic,
            style=style,
            render_plan_json=json.dumps(render_plan, ensure_ascii=False, indent=2),
        )
        try:
            response = await self.api_client.deepseek.chat_completion(
                messages=[
                    {"role": "system", "content": "Return strict JSON only."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=1800,
            )
            if not response.success:
                return fallback
            parsed = self._parse_json_response(response.data["choices"][0]["message"]["content"])
            return parsed if isinstance(parsed, dict) else fallback
        except Exception:
            return fallback

    def _apply_review_patches(
        self,
        render_plan: Dict[str, Any],
        patches: List[Dict[str, Any]],
        language: str,
    ) -> tuple[Dict[str, Any], List[str]]:
        applied: List[str] = []
        scene_map = {scene.get("id"): scene for scene in render_plan.get("scenes", [])}
        for patch in patches:
            scene_id = patch.get("scene_id")
            scene = scene_map.get(scene_id)
            patch_data = patch.get("patch")
            if not scene or not isinstance(patch_data, dict):
                continue
            scene.update(patch_data)
            self._normalize_scene(scene, scene_id or "scene", language)
            applied.append(scene_id)
        return render_plan, applied

    def _validate_render_plan(self, render_plan: Dict[str, Any], language: str, duration_minutes: int) -> Dict[str, Any]:
        scenes = render_plan.get("scenes") or []
        warnings: List[str] = []
        validated_scenes: List[Dict[str, Any]] = []
        # Target higher scene count for stability
        minimum_scene_count = max(24, min(32, duration_minutes + 14))

        if not scenes:
            warnings.append("Render plan returned no scenes; using deterministic fallback scenes.")
            render_plan = self._fallback_render_plan(render_plan.get("title") or "Lesson", {}, language)
            scenes = render_plan["scenes"]

        for index, raw_scene in enumerate(scenes, start=1):
            if not isinstance(raw_scene, dict):
                warnings.append(f"Scene {index} was not an object and was dropped.")
                continue
            scene = dict(raw_scene)
            scene_id = scene.get("id") or f"scene_{index}"
            self._normalize_scene(scene, scene_id, language)
            validated_scenes.append(scene)

        if len(validated_scenes) < minimum_scene_count:
            warnings.append("Render plan had too few valid scenes; appending recap-safe fallbacks.")
            fallback = self._fallback_render_plan(render_plan.get("title") or "Lesson", {}, language)["scenes"]
            for scene in fallback:
                if len(validated_scenes) >= minimum_scene_count:
                    break
                copied_scene = dict(scene)
                copied_scene["id"] = f"scene_{len(validated_scenes) + 1}"
                validated_scenes.append(copied_scene)

        total_duration = sum(float(scene.get("duration") or 0.0) for scene in validated_scenes)
        minimum_total_duration = duration_minutes * 60
        if total_duration < minimum_total_duration and validated_scenes:
            scale_factor = minimum_total_duration / max(total_duration, 1.0)
            warnings.append("Scaled scene durations upward to honor the requested lesson length.")
            for scene in validated_scenes:
                scene["duration"] = max(18.0, min(60.0, round(float(scene["duration"]) * scale_factor, 1)))

        fixed_plan = {
            "title": render_plan.get("title") or "Untitled Lesson",
            "scenes": validated_scenes,
        }
        return {
            "warnings": warnings,
            "scene_count": len(fixed_plan["scenes"]),
            "estimated_total_seconds": sum(float(scene.get("duration") or 0.0) for scene in fixed_plan["scenes"]),
            "render_plan": fixed_plan,
        }

    def _normalize_scene(self, scene: Dict[str, Any], scene_id: str, language: str) -> None:
        scene["id"] = scene_id
        narration = self._compact_text(scene.get("narration") or scene.get("param") or scene_id, 1200)
        scene["narration"] = narration
        scene["action"] = self._normalize_action(scene.get("action"))
        scene["visual_type"] = "manim"

        canvas = scene.get("canvas_config")
        if not isinstance(canvas, dict):
            canvas = {}
        canvas["layout"] = self._normalize_layout(canvas.get("layout"), scene["action"])
        canvas["position"] = canvas.get("position") or self._default_position(canvas["layout"])
        canvas["font_size"] = self._safe_int(canvas.get("font_size"), self._default_font_size(canvas["layout"]))
        requested_max_chars = self._safe_int(canvas.get("max_chars"), 80)
        if canvas["layout"] == "graph_focus":
            requested_max_chars = min(requested_max_chars, 36)
        elif canvas["layout"] == "equation_focus":
            requested_max_chars = min(requested_max_chars, 48)
        else:
            requested_max_chars = min(requested_max_chars, 72)
        canvas["max_chars"] = requested_max_chars
        canvas["safe_scale"] = self._safe_float(canvas.get("safe_scale"), 0.82)
        graph = canvas.get("graph") if isinstance(canvas.get("graph"), dict) else {}
        canvas["graph"] = {
            "x_range": self._normalize_range(graph.get("x_range"), DEFAULT_GRAPH["x_range"]),
            "y_range": self._normalize_range(graph.get("y_range"), DEFAULT_GRAPH["y_range"]),
        }
        scene["canvas_config"] = canvas

        scene["param"] = self._normalize_param(
            scene.get("param"),
            scene["action"],
            scene.get("on_screen_text") or narration,
            canvas["max_chars"],
            language,
        )
        scene["duration"] = self._normalize_duration(scene.get("duration"), narration)

    def _normalize_action(self, action: Any) -> str:
        action_str = str(action or "show_text").strip().lower()
        return action_str if action_str in ALLOWED_ACTIONS else "show_text"

    def _normalize_layout(self, layout: Any, action: str) -> str:
        layout_str = str(layout or "").strip().lower()
        if layout_str in ALLOWED_LAYOUTS:
            return layout_str
        if action == "show_title":
            return "title_card"
        if action == "plot":
            return "graph_focus"
        if action in {"write_tex", "transform"}:
            return "equation_focus"
        return "callout_card"

    def _normalize_param(
        self,
        param: Any,
        action: str,
        fallback_text: str,
        max_chars: int,
        language: str,
    ) -> str:
        text = str(param or fallback_text or "").strip()
        if action == "plot":
            return self._sanitize_plot_expression(text)
        if action in {"write_tex", "transform"}:
            if self._contains_non_ascii(text):
                return self._compact_text(fallback_text, max_chars)
            return self._sanitize_latex(text) or "x^2"
        return self._compact_text(text, max_chars)

    def _normalize_duration(self, duration: Any, narration: str) -> float:
        try:
            numeric = float(duration)
        except (TypeError, ValueError):
            numeric = 0.0
        if numeric <= 0:
            numeric = self._estimate_duration_from_narration(narration)
        return max(18.0, min(60.0, round(numeric, 1)))

    def _estimate_duration_from_narration(self, narration: str) -> float:
        words = len(narration.split())
        chars = len(narration)
        if words > 0:
            estimate = words / 2.1
        else:
            estimate = chars / 5.5
        return max(24.0, min(55.0, estimate))

    def _sanitize_plot_expression(self, expression: str) -> str:
        expr = expression.strip() or "x"
        expr = expr.replace("^", "**")
        expr = re.sub(r"[^0-9a-zA-Z_+\-*/(). ]", "", expr)
        return expr or "x"

    def _sanitize_latex(self, expression: str) -> str:
        expr = expression.strip()
        expr = expr.replace("**", "^")
        expr = re.sub(r"[^0-9a-zA-Z\\{}_^=()+\-*/., ]", "", expr)
        return expr

    def _compact_text(self, text: str, max_chars: int) -> str:
        clean = re.sub(r"\s+", " ", str(text or "")).strip()
        if len(clean) <= max_chars:
            return clean
        return clean[: max_chars - 3].rstrip() + "..."

    def _normalize_range(self, value: Any, fallback: List[int]) -> List[int]:
        if (
            isinstance(value, list)
            and len(value) == 2
            and all(isinstance(item, (int, float)) for item in value)
            and value[0] < value[1]
        ):
            return [int(value[0]), int(value[1])]
        return list(fallback)

    def _default_position(self, layout: str) -> str:
        if layout == "title_card":
            return "center"
        if layout == "recap_card":
            return "top"
        return "center"

    def _default_font_size(self, layout: str) -> int:
        if layout == "title_card":
            return 48
        if layout == "equation_focus":
            return 40
        return 28

    def _safe_int(self, value: Any, fallback: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return fallback

    def _safe_float(self, value: Any, fallback: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return fallback

    def _contains_non_ascii(self, text: str) -> bool:
        return any(ord(char) > 127 for char in text)

    def _parse_json_response(self, content: str) -> Any:
        payload = content.strip()
        if "```json" in payload:
            payload = payload.split("```json", 1)[1].split("```", 1)[0]
        elif "```" in payload:
            payload = payload.split("```", 1)[1].split("```", 1)[0]
        payload = payload.strip()
        
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            # Attempt to fix common LLM JSON errors
            fixed_payload = self._attempt_json_repair(payload)
            try:
                return json.loads(fixed_payload)
            except json.JSONDecodeError:
                # Fallback to regex search
                match = re.search(r"\{.*\}", fixed_payload, re.DOTALL)
                if match:
                    try:
                        return json.loads(match.group(0))
                    except json.JSONDecodeError:
                        pass
                raise

    def _attempt_json_repair(self, payload: str) -> str:
        """Fix common LLM JSON errors like trailing commas or unescaped characters."""
        # 1. Remove trailing commas before closing braces/brackets
        repaired = re.sub(r",\s*([\]}])", r"\1", payload)
        # 2. Fix missing commas between key-value pairs
        repaired = re.sub(r'("[\w\d_]+")\s*:\s*([^,\]}]+)\s*("[\w\d_]+")\s*:', r'\1: \2, \3:', repaired)
        # 3. Fix missing commas between objects in an array
        repaired = re.sub(r'\}\s*\{', '}, {', repaired)
        # 4. Handle truncated JSON by closing open braces/brackets
        open_braces = repaired.count("{") - repaired.count("}")
        open_brackets = repaired.count("[") - repaired.count("]")
        if open_brackets > 0:
            repaired += "]" * open_brackets
        if open_braces > 0:
            repaired += "}" * open_braces
        return repaired

    def _prompt_version(self, prompt_name: str) -> str:
        content = load_prompt(prompt_name)
        return hashlib.sha1(content.encode("utf-8")).hexdigest()[:10]

    def _fallback_syllabus(self, topic: str, style: str, student_level: str) -> Dict[str, Any]:
        visual_flavor = "rigorous" if style == "math" else "discovery"
        return {
            "title": topic,
            "big_idea": f"Understand the core idea behind {topic} and apply it with confidence.",
            "target_level": student_level,
            "visual_flavor": visual_flavor,
            "teaching_arc": ["hook", "concept", "worked_example", "misconception", "retrieval", "recap"],
            "chapters": [
                {
                    "id": "chapter_1",
                    "title": "Why It Matters",
                    "learning_goal": f"See why {topic} matters.",
                    "common_misconception": "The topic is only a formula to memorize.",
                    "visual_intent": "HOOK",
                    "must_show": [topic],
                    "key_terms": [topic],
                },
                {
                    "id": "chapter_2",
                    "title": "Core Concept",
                    "learning_goal": f"Understand the main structure of {topic}.",
                    "common_misconception": "All parts of the concept work the same way.",
                    "visual_intent": "INTUITION",
                    "must_show": ["main definition"],
                    "key_terms": ["definition", "structure"],
                },
                {
                    "id": "chapter_3",
                    "title": "Worked Example",
                    "learning_goal": f"Apply {topic} to one concrete example.",
                    "common_misconception": "Skipping intermediate reasoning is safe.",
                    "visual_intent": "WORKED_EXAMPLE",
                    "must_show": ["worked example"],
                    "key_terms": ["example", "step-by-step"],
                },
                {
                    "id": "chapter_4",
                    "title": "Check and Recap",
                    "learning_goal": "Recall the main idea and spot a common mistake.",
                    "common_misconception": "Recognition means mastery.",
                    "visual_intent": "RECAP",
                    "must_show": ["recap"],
                    "key_terms": ["recall", "recap"],
                },
            ],
            "quality_checks": [
                "Use one main teaching move per scene.",
                "Prefer one clean example over multiple rushed examples.",
                "End with a retrieval prompt.",
            ],
        }

    def _fallback_storyboard(
        self,
        topic: str,
        content: str,
        syllabus: Dict[str, Any],
        language: str,
    ) -> Dict[str, Any]:
        scene_templates = [
            ("scene_1", "chapter_1", "hook", "show_title", topic, "title_card"),
            ("scene_2", "chapter_1", "explain", "show_text", f"What is {topic}?", "callout_card"),
            ("scene_3", "chapter_1", "explain", "show_text", "Establishing the context and why this matters for your learning journey.", "callout_card"),
            ("scene_4", "chapter_1", "explain", "show_text", "A brief overview of the key terminology we will use today.", "callout_card"),
            ("scene_5", "chapter_2", "explain", "show_text", "Key idea and structure - breaking it down into manageable pieces.", "two_column"),
            ("scene_6", "chapter_2", "explain", "show_text", "How this idea relates to previous topics and builds upon your existing knowledge.", "two_column"),
            ("scene_7", "chapter_2", "explain", "show_text", "Visualizing the relationships between different components of the concept.", "two_column"),
            ("scene_8", "chapter_3", "worked_example", "write_tex", "y=x^2", "equation_focus"),
            ("scene_9", "chapter_3", "worked_example", "plot", "x**2", "graph_focus"),
            ("scene_10", "chapter_3", "worked_example", "show_text", "Intermediate calculation steps and logical reasoning behind each move.", "equation_focus"),
            ("scene_11", "chapter_3", "worked_example", "show_text", "Applying the final result to solve the problem completely.", "callout_card"),
            ("scene_12", "chapter_3", "worked_example", "show_text", "What changes if one condition shifts? Let's explore the sensitivity.", "callout_card"),
            ("scene_13", "chapter_3", "worked_example", "show_text", "A second quick example to reinforce the pattern we just saw.", "callout_card"),
            ("scene_14", "chapter_4", "misconception", "show_text", "Common mistake to avoid - why it's easy to trip up here.", "callout_card"),
            ("scene_15", "chapter_4", "misconception", "show_text", "Why the mistake feels tempting and how to recognize the warning signs.", "callout_card"),
            ("scene_16", "chapter_4", "misconception", "show_text", "How to self-correct this mistake and verify your answer.", "callout_card"),
            ("scene_17", "chapter_4", "retrieval", "show_text", "Pause and predict the next step. What would you do here?", "recap_card"),
            ("scene_18", "chapter_4", "retrieval", "show_text", "Try one quick self-check example to prove your mastery.", "recap_card"),
            ("scene_19", "chapter_4", "retrieval", "show_text", "Another challenge to test your intuition and deepen understanding.", "recap_card"),
            ("scene_20", "chapter_4", "retrieval", "show_text", "Final quick-fire questions to solidify the core concepts.", "recap_card"),
            ("scene_21", "chapter_4", "recap", "show_text", "Main takeaway in one sentence - the absolute core of today.", "recap_card"),
            ("scene_22", "chapter_4", "recap", "show_text", "Connecting today's idea to future concepts and real-world apps.", "recap_card"),
            ("scene_23", "chapter_4", "recap", "show_text", "Summary of the key steps we took to reach our conclusion.", "recap_card"),
            ("scene_24", "chapter_4", "recap", "show_text", "Next practice move - what you should do right after this video.", "recap_card"),
        ]
        scenes: List[Dict[str, Any]] = []
        for scene_id, chapter_id, move, action, param, layout in scene_templates:
            narration = self._fallback_narration(topic, move, language, content)
            scenes.append(
                {
                    "id": scene_id,
                    "chapter_id": chapter_id,
                    "scene_goal": move.replace("_", " "),
                    "teaching_move": move,
                    "narration": narration,
                    "on_screen_text": param if action != "plot" else f"Graph of {topic}",
                    "visual_layout": layout,
                    "primary_visual": {"action": action, "param": param},
                    "graph_config": DEFAULT_GRAPH,
                    "estimated_seconds": self._estimate_duration_from_narration(narration),
                    "check_for_understanding": "Can you explain this in your own words?",
                }
            )
        return {
            "title": syllabus.get("title") or topic,
            "story_goal": syllabus.get("big_idea") or f"Teach {topic} clearly.",
            "scenes": scenes,
        }

    def _fallback_render_plan(
        self,
        topic: str,
        storyboard: Dict[str, Any],
        language: str,
    ) -> Dict[str, Any]:
        scenes = []
        storyboard_scenes = storyboard.get("scenes") if isinstance(storyboard, dict) else []
        if not storyboard_scenes:
            storyboard_scenes = self._fallback_storyboard(
                topic=topic,
                content="",
                syllabus=self._fallback_syllabus(topic, "general", "beginner"),
                language=language,
            )["scenes"]
        for index, raw in enumerate(storyboard_scenes, start=1):
            primary = raw.get("primary_visual") or {}
            action = self._normalize_action(primary.get("action"))
            layout = self._normalize_layout(raw.get("visual_layout"), action)
            narration = self._compact_text(raw.get("narration") or f"Learn {topic}.", 1200)
            scene = {
                "id": raw.get("id") or f"scene_{index}",
                "duration": raw.get("estimated_seconds") or self._estimate_duration_from_narration(narration),
                "narration": narration,
                "action": action,
                "param": self._normalize_param(
                    primary.get("param"),
                    action,
                    raw.get("on_screen_text") or narration,
                    80,
                    language,
                ),
                "visual_type": "manim",
                "canvas_config": {
                    "layout": layout,
                    "position": self._default_position(layout),
                    "font_size": self._default_font_size(layout),
                    "max_chars": 80,
                    "safe_scale": 0.82,
                    "graph": raw.get("graph_config") or DEFAULT_GRAPH,
                },
            }
            scenes.append(scene)
        return {"title": storyboard.get("title") or topic, "scenes": scenes}

    def _fallback_narration(self, topic: str, move: str, language: str, content: str) -> str:
        if language == "zh":
            mapping = {
                "hook": f"先建立直觉，看看 {topic} 为什么值得学。",
                "explain": f"现在我们用一个清晰的视角解释 {topic} 的核心结构。",
                "worked_example": f"接下来通过一个具体例子，把 {topic} 真正走一遍。",
                "misconception": f"这里有一个常见误区，很多同学会在这里混淆。",
                "retrieval": "现在暂停一下，试着不用提示回忆关键步骤。",
                "recap": "最后我们用一句话回顾本节最重要的结论。",
            }
        else:
            mapping = {
                "hook": f"Let us start by seeing why {topic} matters.",
                "explain": f"Now we can explain the core structure behind {topic}.",
                "worked_example": f"Next, we walk through one concrete example of {topic}.",
                "misconception": "Here is a common mistake learners make and how to fix it.",
                "retrieval": "Pause here and try to recall the key idea without looking.",
                "recap": "Let us close with the main takeaway you should remember.",
            }
        return mapping.get(move, self._compact_text(content or f"Learn about {topic}.", 180))
