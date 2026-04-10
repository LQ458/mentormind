"""
Study Plan Agent Module - Full-course adaptive study plan generation.
Implements a multi-stage diagnostic → plan_review flow for whole-course coverage.
Max 3 diagnostic questions before auto-advancing to plan generation.
Recognizes intent signals like "just start" / "generate" and skips straight to generation.
"""

import json
from typing import Dict, List, Optional, Any
from enum import Enum
from dataclasses import dataclass, field

from config import config
from services.api_client import api_client, get_language_instruction
from core.agents.subject_detector import SubjectDetector, SubjectDetection, _get_ap_catalog


class PlanStage(Enum):
    OPENING = "opening"
    DIAGNOSTIC = "diagnostic"
    PLAN_REVIEW = "plan_review"
    LOCKED = "locked"


@dataclass
class PlanResponse:
    stage: PlanStage
    content: str
    thinking_process: Optional[str] = None
    proposed_plan: Optional[Dict[str, Any]] = None
    diagnostic_question: Optional[str] = None
    next_action_label: Optional[str] = None
    detected_subject: Optional[Dict[str, Any]] = None


# Phrases that mean "stop asking and just generate"
_START_SIGNALS = [
    "just start", "start generating", "start", "generate", "go", "begin",
    "lets go", "let's go", "just do it", "proceed", "continue", "enough",
    "stop asking", "just make it", "create it", "create plan",
    "开始", "生成", "直接", "好了", "可以了", "开始生成",
]


def _wants_to_start(text: str) -> bool:
    t = text.lower().strip()
    return any(signal in t for signal in _START_SIGNALS)


def _count_diagnostic_turns(history: List[Dict[str, str]]) -> int:
    """Count how many times the assistant already asked a diagnostic question."""
    return sum(1 for m in history if m["role"] == "assistant")


def _detection_to_dict(detection: SubjectDetection) -> Dict[str, Any]:
    return {
        "subject": detection.subject,
        "framework": detection.framework,
        "difficulty": detection.difficulty,
        "topics": detection.topics,
        "confidence": detection.confidence,
        "course_id": detection.course_id,
        "course_name": detection.course_name,
    }


class StudyPlanAgent:
    """Manages the conversational stages for whole-course study plan creation."""

    def __init__(self):
        self.model_config = config.get_models()["deepseek_v3"]
        self.subject_detector = SubjectDetector()
        self._cached_detection: Optional[SubjectDetection] = None

    async def get_next_response(
        self,
        history: List[Dict[str, str]],
        current_stage: PlanStage,
        language: str = "en",
    ) -> PlanResponse:
        """Determines the next move in the study plan conversation."""

        lang_instruction = get_language_instruction(language)
        last_user = history[-1]["content"] if history and history[-1]["role"] == "user" else ""

        # If user says "just start" at any stage → go straight to plan_review then lock
        if current_stage != PlanStage.OPENING and _wants_to_start(last_user):
            return await self._handle_plan_review(history, language, lang_instruction, fast=True)

        if current_stage == PlanStage.OPENING:
            return await self._handle_opening(history, language, lang_instruction)
        elif current_stage == PlanStage.DIAGNOSTIC:
            return await self._handle_diagnostic(history, language, lang_instruction)
        elif current_stage == PlanStage.PLAN_REVIEW:
            return await self._handle_plan_review(history, language, lang_instruction)
        elif current_stage == PlanStage.LOCKED:
            return await self._handle_co_creation(history, language, lang_instruction)

        return PlanResponse(stage=PlanStage.OPENING, content="Ready to build your study plan?")

    async def _handle_opening(self, history, language, lang_instr) -> PlanResponse:
        """Stage 1: Ask what subject and exam framework the student is preparing for."""
        if history and history[-1]["role"] == "user":
            # User already provided input — detect subject and move to diagnostic
            user_input = history[-1]["content"]
            detection = await self.subject_detector.detect(user_input, language)
            self._cached_detection = detection
            return await self._handle_diagnostic(history, language, lang_instr)

        content = (
            "What subject and exam framework are you preparing for? "
            "(e.g., AP Calculus, A Level Physics, 高考数学)"
            if language == "en" else
            "你在备考哪个科目和考试框架？（例如：AP Calculus、A Level Physics、高考数学）"
        )
        return PlanResponse(stage=PlanStage.OPENING, content=content)

    async def _handle_diagnostic(self, history, language, lang_instr) -> PlanResponse:
        """Stage 2: Diagnostic — max 3 questions, then auto-advance to plan generation."""
        diagnostic_turns = _count_diagnostic_turns(history)

        # After 3 assistant turns, stop asking and build the plan
        if diagnostic_turns >= 3:
            return await self._handle_plan_review(history, language, lang_instr, fast=True)

        # Run subject detection on the first user message if not already cached
        user_messages = [m for m in history if m["role"] == "user"]
        if self._cached_detection is None and user_messages:
            self._cached_detection = await self.subject_detector.detect(
                user_messages[0]["content"], language
            )

        detection = self._cached_detection
        subject_ctx = ""
        if detection:
            framework_label = (
                f" ({detection.framework.upper()} framework)" if detection.framework else ""
            )
            subject_ctx = f"Detected subject: {detection.subject}{framework_label}, difficulty: {detection.difficulty}."

        student_input = history[-1]["content"] if history else ""

        if diagnostic_turns == 0:
            turn_hint = (
                "Ask ONE broad question to gauge where the student currently stands across the whole course. "
                "Example for math: 'Can you solve basic derivatives, or are limits still new to you?' "
                "Keep it friendly and specific to their detected subject/framework."
            )
        elif diagnostic_turns == 1:
            turn_hint = (
                "Ask ONE follow-up question about their weak areas or which units feel most daunting. "
                "Do NOT repeat earlier questions."
            )
        else:
            turn_hint = (
                "This is your LAST diagnostic question. Ask something that captures their study schedule "
                "or how many weeks/months they have before the exam. After this you MUST generate the plan."
            )

        prompt = f"""{lang_instr}

You are an expert academic coach building a full-course study plan.
{subject_ctx}
The student said: "{student_input}"

{turn_hint}

Your task:
1. Acknowledge their input in ONE short sentence.
2. Ask exactly ONE sharp diagnostic question relevant to whole-course planning.
   - Do NOT ask multiple questions.
   - Do NOT repeat earlier questions from the conversation.
   - Tailor the question to their specific framework if detected (AP, A Level, Gaokao, IB).

Keep it concise (3-5 sentences total). Do NOT generate a study plan yet.
"""
        response = await api_client.deepseek.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
        )
        content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return PlanResponse(
            stage=PlanStage.DIAGNOSTIC,
            content=content,
            diagnostic_question=content,
            detected_subject=_detection_to_dict(detection) if detection else None,
        )

    async def _handle_plan_review(
        self, history, language, lang_instr, fast: bool = False
    ) -> PlanResponse:
        """Stage 3: Generate and reveal the full-course study plan."""
        user_messages = [m for m in history if m["role"] == "user"]
        subject_input = user_messages[0]["content"] if user_messages else "the subject"
        diagnostic_summary = (
            " | ".join(m["content"] for m in user_messages[1:])
            if len(user_messages) > 1
            else "Not much diagnostic info — use sensible defaults."
        )

        # Use cached detection or re-detect
        detection = self._cached_detection
        if detection is None and user_messages:
            detection = await self.subject_detector.detect(user_messages[0]["content"], language)
            self._cached_detection = detection

        subject_ctx = ""
        curriculum_note = ""
        if detection:
            course_label = f", Course: {detection.course_name}" if detection.course_name else ""
            subject_ctx = (
                f"Subject: {detection.subject}, Framework: {detection.framework or 'general'}, "
                f"Difficulty: {detection.difficulty}{course_label}."
            )
            if detection.framework == "ap":
                # Try to pull official units from AP course catalog
                ap_units_note = ""
                if detection.course_id:
                    catalog = _get_ap_catalog()
                    for course in catalog.get("courses", []):
                        if course["id"] == detection.course_id:
                            units_list = ", ".join(course["units"])
                            exam = course.get("exam_format", {})
                            ap_units_note = (
                                f"\n\nOFFICIAL AP CURRICULUM for {course['name']}:\n"
                                f"Units: {units_list}\n"
                                f"Exam format: {exam.get('mc_count', '?')} MC questions ({exam.get('mc_minutes', '?')} min), "
                                f"{exam.get('frq_count', '?')} FRQ ({exam.get('frq_minutes', '?')} min).\n"
                                f"You MUST use these exact units as the basis for the study plan. "
                                f"Each unit in your plan should correspond to one official unit."
                            )
                            break
                curriculum_note = (
                    "Follow the AP College Board curriculum. Include units that mirror the AP exam "
                    "topic outline."
                    + ap_units_note
                )
            elif detection.framework == "a_level":
                curriculum_note = (
                    "Follow the Cambridge / Edexcel A Level syllabus structure. "
                    "Cover AS and A2 content in separate unit groups."
                )
            elif detection.framework == "gaokao":
                curriculum_note = (
                    "按照高考全国卷考纲编排单元，涵盖必修和选修内容，重点标注高频考点。"
                )
            elif detection.framework == "ib":
                curriculum_note = (
                    "Follow the IB Diploma Programme syllabus. Distinguish SL and HL content where relevant."
                )

        fast_note = (
            "The student said 'just start' — skip lengthy preamble. "
            "One sentence of acknowledgement, then the JSON."
            if fast else ""
        )

        output_language = "zh" if (detection and detection.framework == "gaokao") else language

        prompt = f"""{lang_instr}

You are an expert academic coach.
{subject_ctx}
Student's subject/framework input: {subject_input}
Diagnostic answers: {diagnostic_summary}
{curriculum_note}
{fast_note}

Your task:
1. In 1-2 sentences, briefly explain your plan rationale — friendly and encouraging.
2. Generate a full-course study plan with 6-12 units covering the complete syllabus.

Output format — text first, then the JSON block:

[1-2 sentence rationale here]

```json
{{
    "title": "Course plan title (e.g. 'AP Calculus BC Mastery')",
    "subject": "{detection.subject if detection else 'general'}",
    "framework": "{detection.framework if detection and detection.framework else ''}",
    "course_name": "{detection.course_name if detection and detection.course_name else 'Full course name'}",
    "estimated_hours": <integer>,
    "units": [
        {{
            "title": "Unit title",
            "description": "Brief description of what this unit covers",
            "topics": ["topic1", "topic2", "topic3"],
            "learning_objectives": ["Objective 1", "Objective 2"],
            "estimated_minutes": <integer>
        }}
    ]
}}
```
"""
        response = await api_client.deepseek.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=3000,
        )
        full_content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")

        thinking_process = ""
        proposed_plan = None

        if "```json" in full_content:
            parts = full_content.split("```json")
            thinking_process = parts[0].strip()
            json_str = parts[1].split("```")[0].strip()
            try:
                proposed_plan = json.loads(json_str)
            except Exception:
                proposed_plan = None
        elif "```" in full_content:
            parts = full_content.split("```")
            thinking_process = parts[0].strip()
            try:
                proposed_plan = json.loads(parts[1].strip())
            except Exception:
                proposed_plan = None
        else:
            thinking_process = full_content

        summary = (
            "Here's your personalized study plan — review it and hit **Let's go!** when ready."
            if language == "en" else
            "这是你的专属学习计划——确认后点击**开始吧！**。"
        )

        return PlanResponse(
            stage=PlanStage.PLAN_REVIEW,
            content=summary,
            thinking_process=thinking_process,
            proposed_plan=proposed_plan,
            next_action_label="Looks good, let's go!" if language == "en" else "看起来不错，开始吧！",
            detected_subject=_detection_to_dict(detection) if detection else None,
        )

    async def _handle_co_creation(self, history, language, lang_instr) -> PlanResponse:
        """Stage 4 (LOCKED): Tweak or confirm the plan."""
        last_input = history[-1]["content"].lower()
        if any(
            w in last_input
            for w in ["go", "start", "yes", "ok", "好", "开始", "可以", "fine", "great", "perfect", "looks good"]
        ):
            return PlanResponse(
                stage=PlanStage.LOCKED,
                content=(
                    "Perfect — saving your study plan now..."
                    if language == "en"
                    else "好的——正在保存你的学习计划……"
                ),
            )
        return await self._handle_plan_review(history, language, lang_instr)
