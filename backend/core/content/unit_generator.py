"""
Unit Content Generator
Generates study guides, quizzes, flashcards, formula sheets, and mock exams
for individual study plan units using subject-specific prompts.
"""

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

from config import config
from services.api_client import api_client, get_language_instruction

logger = logging.getLogger(__name__)

# Content types that use the reasoning model (R1) for higher accuracy
_REASONING_CONTENT_TYPES = {"quiz", "mock_exam"}


def _parse_json_from_response(text: str) -> Optional[Dict[str, Any]]:
    """Extract JSON from LLM response, handling ```json blocks."""
    if "```json" in text:
        parts = text.split("```json")
        json_str = parts[1].split("```")[0].strip()
    elif "```" in text:
        parts = text.split("```")
        if len(parts) >= 2:
            json_str = parts[1].strip()
        else:
            json_str = text
    else:
        # Try parsing the whole thing
        json_str = text.strip()

    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        logger.warning("Failed to parse JSON from LLM response")
        return None


class UnitContentGenerator:
    """Generates content for a single study plan unit."""

    def __init__(self):
        self.v3_config = config.get_models()["deepseek_v3"]
        self.r1_config = config.get_models().get("deepseek_r1", self.v3_config)

    async def generate(
        self,
        unit_data: Dict[str, Any],
        plan_data: Dict[str, Any],
        content_types: List[str],
        language: str = "zh",
    ) -> Dict[str, Any]:
        """
        Generate requested content types for a unit in parallel.

        Args:
            unit_data: Unit info (title, topics, learning_objectives, etc.)
            plan_data: Plan info (subject, framework, course_name, etc.)
            content_types: List of content types to generate
            language: Output language

        Returns:
            Dict mapping content_type -> generated JSON content
        """
        from prompts.loader import render_subject_prompt

        lang_instruction = get_language_instruction(language)
        subject = plan_data.get("subject", "general")
        framework = plan_data.get("framework")
        framework_display = self._get_framework_display(framework, plan_data.get("course_name"))

        common_vars = {
            "language_instruction": lang_instruction,
            "unit_title": unit_data.get("title", ""),
            "topics": ", ".join(unit_data.get("topics", [])),
            "learning_objectives": ", ".join(unit_data.get("learning_objectives", [])),
            "student_level": plan_data.get("difficulty_level", "intermediate"),
            "framework_display": framework_display,
            "course_name": plan_data.get("course_name", ""),
        }

        tasks = {}
        for ct in content_types:
            if ct == "study_guide":
                tasks[ct] = self._generate_content(
                    "study_guide", subject, framework, common_vars
                )
            elif ct == "quiz":
                tasks[ct] = self._generate_content(
                    "quiz", subject, framework,
                    {**common_vars, "quiz_type": "formative"},
                    use_reasoning=True,
                )
            elif ct == "flashcards":
                tasks[ct] = self._generate_content(
                    "flashcard", subject, framework, common_vars
                )
            elif ct == "formula_sheet":
                tasks[ct] = self._generate_content(
                    "formula_sheet", subject, framework, common_vars
                )
            elif ct == "mock_exam":
                tasks[ct] = self._generate_content(
                    "mock_exam", subject, framework,
                    {**common_vars, "all_topics": common_vars["topics"], "time_limit": "90"},
                    use_reasoning=True,
                )

        # Run all generation tasks in parallel
        keys = list(tasks.keys())
        results = await asyncio.gather(
            *[tasks[k] for k in keys], return_exceptions=True
        )

        output = {}
        for key, result in zip(keys, results):
            if isinstance(result, Exception):
                logger.error(f"Failed to generate {key}: {result}")
                output[key] = None
            else:
                output[key] = result

        return output

    async def generate_unit_test(
        self,
        unit_data: Dict[str, Any],
        plan_data: Dict[str, Any],
        language: str = "zh",
    ) -> Optional[Dict[str, Any]]:
        """Generate a comprehensive unit test (more questions than formative quiz)."""
        from prompts.loader import render_subject_prompt

        lang_instruction = get_language_instruction(language)
        subject = plan_data.get("subject", "general")
        framework = plan_data.get("framework")

        variables = {
            "language_instruction": lang_instruction,
            "subject": subject,
            "unit_title": unit_data.get("title", ""),
            "topics": ", ".join(unit_data.get("topics", [])),
            "learning_objectives": ", ".join(unit_data.get("learning_objectives", [])),
            "student_level": plan_data.get("difficulty_level", "intermediate"),
            "framework_display": self._get_framework_display(framework, plan_data.get("course_name")),
            "quiz_type": "unit_test",
            "course_name": plan_data.get("course_name", ""),
        }

        return await self._generate_content(
            "quiz", subject, framework, variables, use_reasoning=True
        )

    async def _generate_content(
        self,
        prompt_type: str,
        subject: str,
        framework: Optional[str],
        variables: Dict[str, str],
        use_reasoning: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Generate a single content type using the appropriate prompt and model."""
        from prompts.loader import render_subject_prompt

        prompt = render_subject_prompt(prompt_type, subject, framework, **variables)

        model_config = self.r1_config if use_reasoning else self.v3_config
        temperature = 0.3 if use_reasoning else 0.5

        try:
            response = await api_client.deepseek.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                max_tokens=8000,
            )
            content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return _parse_json_from_response(content)
        except Exception as e:
            logger.error(f"Content generation failed for {prompt_type}/{subject}: {e}")
            return None

    @staticmethod
    def _get_framework_display(framework: Optional[str], course_name: Optional[str] = None) -> str:
        """Get human-readable framework display string."""
        if course_name:
            return course_name
        displays = {
            "ap": "Advanced Placement (AP)",
            "a_level": "A Level (Cambridge International)",
            "gaokao": "高考 (Gaokao)",
            "ib": "International Baccalaureate (IB)",
        }
        return displays.get(framework, "General curriculum")
