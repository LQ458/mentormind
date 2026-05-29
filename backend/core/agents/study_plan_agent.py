"""
Study Plan Agent Module - Full-course adaptive study plan generation.
Implements a multi-stage diagnostic → plan_review flow for whole-course coverage.
Max 3 diagnostic questions before auto-advancing to plan generation.
Recognizes intent signals like "just start" / "generate" and skips straight to generation.
"""

import json
import re
import asyncio
from typing import Dict, List, Optional, Any
from enum import Enum
from dataclasses import dataclass, field

from config import config
from services.api_client import api_client, get_language_instruction
from core.agents.subject_detector import SubjectDetector, SubjectDetection, _get_catalog
from core.agents.study_plan_diagnostics import (
    build_diagnostic_guidance,
    has_level_signal as _has_level_signal,
    has_timeline_signal as _has_timeline_signal,
    next_course_diagnostic_question,
)


class PlanStage(Enum):
    OPENING = "opening"
    DIAGNOSTIC = "diagnostic"
    PLAN_REVIEW = "plan_review"
    LOCKED = "locked"


@dataclass
class PlanResponse:
    stage: PlanStage
    content: str
    response_source: str = "unknown"
    thinking_process: Optional[str] = None
    proposed_plan: Optional[Dict[str, Any]] = None
    diagnostic_question: Optional[str] = None
    next_action_label: Optional[str] = None
    detected_subject: Optional[Dict[str, Any]] = None
    # Smart-interaction fields (v2): when the LLM emits a structured ask_user
    # block, we parse and surface the options + free-text-allowed flag so the
    # frontend can render clickable chips alongside a free text input.
    options: Optional[List[str]] = None
    allow_free_text: bool = True


# Diagnostic turn cap (was 3, raised to 6 for the dynamic flow)
MAX_DIAGNOSTIC_TURNS = 6
PLAN_REVIEW_LLM_TIMEOUT_SECONDS = 35


_ASK_USER_BLOCK_RE = re.compile(r"```ask_user\s*(\{.*?\})\s*```", re.DOTALL)


def _parse_ask_user_block(content: str) -> Optional[Dict[str, Any]]:
    """Pull a structured `ask_user` block out of the LLM response if present.
    Expected shape:
      ```ask_user
      {"question": "…", "options": ["a","b","c"], "allow_free_text": true}
      ```
    Returns None if no block found or JSON malformed.
    """
    m = _ASK_USER_BLOCK_RE.search(content or "")
    if not m:
        return None
    try:
        payload = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get("question"), str):
        return None
    options = payload.get("options")
    if options is not None and not (isinstance(options, list) and all(isinstance(o, str) for o in options)):
        options = None
    return {
        "question": payload["question"],
        "options": options,
        "allow_free_text": bool(payload.get("allow_free_text", True)),
    }


def _strip_ask_user_block(content: str) -> str:
    return _ASK_USER_BLOCK_RE.sub("", content or "").strip()


def _chat_completion_content(response: Any) -> str:
    if not response or not getattr(response, "success", False) or not getattr(response, "data", None):
        return ""
    return response.data.get("choices", [{}])[0].get("message", {}).get("content", "") or ""


def _temporary_ai_error(language: str, plan_generation: bool = False) -> str:
    if language == "en":
        return (
            "The AI reply did not come through. Please retry, or add one more goal detail first."
            if not plan_generation
            else "Plan generation did not come through. Please retry in a moment."
        )
    return "AI 回复暂时没有返回。可以重试，或先补充一个目标细节。" if not plan_generation else "计划暂时生成失败，请稍后重试。"


def _plan_generation_error_response(
    language: str,
    source: str,
    detection: Optional[SubjectDetection],
) -> PlanResponse:
    content = (
        "The plan did not finish generating. Please retry once, or add one shorter detail and try again."
        if language == "en"
        else "学习计划没有生成完成。请再试一次，或补充一句更短的信息后重试。"
    )
    return PlanResponse(
        stage=PlanStage.DIAGNOSTIC,
        content=content,
        response_source=source,
        diagnostic_question=content,
        options=["Retry", "Add one detail"] if language == "en" else ["重试生成", "补充信息"],
        allow_free_text=True,
        detected_subject=_detection_to_dict(detection) if detection else None,
    )


def _build_curriculum_note(detection: SubjectDetection) -> str:
    """Generalized curriculum-note builder for any framework with a JSON catalog.
    Falls back to a plain prose note for frameworks without a catalog."""
    if not detection or not detection.framework:
        return ""

    framework = detection.framework
    catalog = _get_catalog(framework)
    courses = catalog.get("courses", [])

    # Try to locate the specific course
    course = None
    if detection.course_id:
        for c in courses:
            if c.get("id") == detection.course_id:
                course = c
                break

    if course:
        units_list = ", ".join(course.get("units", []))
        exam_format = course.get("exam_format", {})
        exam_summary_parts = []
        for k, v in exam_format.items():
            if k == "papers" and isinstance(v, list):
                exam_summary_parts.append(
                    "papers: " + "; ".join(p.get("name", "") for p in v if isinstance(p, dict))
                )
            else:
                exam_summary_parts.append(f"{k}: {v}")
        exam_summary = "; ".join(exam_summary_parts) if exam_summary_parts else ""
        framework_label = framework.upper().replace("_", " ")
        return (
            f"\n\nOFFICIAL {framework_label} CURRICULUM for {course.get('name', detection.course_id)}:\n"
            f"Units: {units_list}\n"
            f"Exam format: {exam_summary}.\n"
            f"You MUST use these exact units as the basis for the study plan. "
            f"Each unit in your plan should correspond to one official unit."
        )

    # Fallback prose notes if no catalog course matched
    fallback_notes = {
        "ap": "Follow the AP College Board curriculum. Include units that mirror the AP exam topic outline.",
        "a_level": "Follow the Cambridge / Edexcel A Level syllabus. Cover AS and A2 content in separate unit groups.",
        "ib": "Follow the IB Diploma Programme syllabus. Distinguish SL and HL content where relevant; use IB command terms (define, describe, explain, evaluate, discuss).",
        "gaokao": "按照高考全国卷考纲编排单元，涵盖必修和选修内容，重点标注高频考点。",
    }
    return fallback_notes.get(framework, "")


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


_COURSE_LABEL_ZH = {
    "ap_calculus_ab": "微积分AB",
    "ap_calculus_bc": "微积分BC",
    "ap_statistics": "统计学",
}


def _course_label(course: Dict[str, Any], language: str) -> str:
    if language == "zh":
        return _COURSE_LABEL_ZH.get(course.get("id"), course.get("name", ""))
    return course.get("name", "")


def _course_options(framework: Optional[str], subject: Optional[str], language: str) -> List[str]:
    if not framework or not subject:
        return []
    catalog = _get_catalog(framework)
    options = [
        _course_label(course, language)
        for course in catalog.get("courses", [])
        if course.get("subject") == subject
    ]
    return [option for option in options if option][:4]


class StudyPlanAgent:
    """Manages the conversational stages for whole-course study plan creation.

    NOTE: this agent is instantiated as a module-level singleton in server.py.
    Do NOT store per-conversation state on `self` — it would leak between
    concurrent users. Detection is computed per-call and cached only inside
    the call chain via local variables. See critic note 2026-05-03."""

    def __init__(self):
        self.model_config = config.get_models()["deepseek_v3"]
        self.subject_detector = SubjectDetector()

    async def _detect_for(
        self,
        history: List[Dict[str, str]],
        language: str,
        preselected_subject: Optional[str] = None,
        preselected_framework: Optional[str] = None,
    ) -> Optional[SubjectDetection]:
        """Detection scoped to a single call — no shared mutable state on self.
        When the frontend has already collected a subject/framework choice via
        the picker UI, those are AUTHORITATIVE: we still run keyword detection
        for course_id matching, but the explicit user choice always wins for
        framework/subject."""
        user_messages = [m for m in history if m["role"] == "user"]
        first_user = user_messages[0]["content"] if user_messages else ""

        joined_user_text = " ".join(m["content"] for m in user_messages)

        detection: Optional[SubjectDetection] = None
        if preselected_framework or preselected_subject:
            # The picker UI already gave us high-confidence subject/framework.
            # Avoid an LLM classifier call on vague diagnostic text like
            # "3-5 hours per week"; it adds latency to the chip-click path and
            # can push production requests into gateway timeouts.
            detection = self.subject_detector.detect_fast(joined_user_text or first_user)
        elif first_user:
            detection = await self.subject_detector.detect(first_user, language)

        # Honour the user-selected framework/subject from the picker over auto-detect.
        if preselected_framework or preselected_subject:
            if detection is None:
                detection = SubjectDetection(
                    subject=preselected_subject or "general",
                    framework=preselected_framework,
                    difficulty="intermediate",
                    topics=[],
                    confidence=0.99,
                )
            else:
                if preselected_framework:
                    detection.framework = preselected_framework
                if preselected_subject:
                    detection.subject = preselected_subject

            # If the user-selected framework changed and we don't have a course_id
            # for it, scan the chat history for an explicit course mention in
            # that framework's catalog.
            if preselected_framework and (
                not detection.course_id
                or not detection.course_id.startswith(preselected_framework + "_")
            ):
                from core.agents.subject_detector import _detect_course
                course = _detect_course(joined_user_text.lower(), framework=preselected_framework)
                if course:
                    detection.course_id = course["id"]
                    detection.course_name = course.get("name")
                    if not preselected_subject:
                        detection.subject = course["subject"]
                else:
                    # No course match; clear stale AP course_id so the curriculum
                    # note builder falls back to prose for that framework.
                    detection.course_id = None
                    detection.course_name = None

        return detection

    async def get_next_response(
        self,
        history: List[Dict[str, str]],
        current_stage: PlanStage,
        language: str = "en",
        preselected_subject: Optional[str] = None,
        preselected_framework: Optional[str] = None,
    ) -> PlanResponse:
        """Determines the next move in the study plan conversation."""

        lang_instruction = get_language_instruction(language)
        last_user = history[-1]["content"] if history and history[-1]["role"] == "user" else ""

        # If user says "just start" at any stage → go straight to plan_review then lock
        if current_stage != PlanStage.OPENING and _wants_to_start(last_user):
            detection = await self._detect_for(history, language, preselected_subject, preselected_framework)
            return await self._handle_plan_review(history, language, lang_instruction, detection, fast=True)

        if current_stage == PlanStage.OPENING:
            return await self._handle_opening(history, language, lang_instruction, preselected_subject, preselected_framework)
        elif current_stage == PlanStage.DIAGNOSTIC:
            return await self._handle_diagnostic(history, language, lang_instruction, preselected_subject, preselected_framework)
        elif current_stage == PlanStage.PLAN_REVIEW:
            detection = await self._detect_for(history, language, preselected_subject, preselected_framework)
            return await self._handle_plan_review(history, language, lang_instruction, detection)
        elif current_stage == PlanStage.LOCKED:
            return await self._handle_co_creation(history, language, lang_instruction)

        return PlanResponse(
            stage=PlanStage.OPENING,
            content="Ready to build your study plan?",
            response_source="fallback_opening",
        )

    async def _handle_opening(
        self,
        history,
        language,
        lang_instr,
        preselected_subject: Optional[str] = None,
        preselected_framework: Optional[str] = None,
    ) -> PlanResponse:
        """Stage 1: Ask what subject and exam framework the student is preparing for."""
        if history and history[-1]["role"] == "user":
            # User already provided input — move to diagnostic (detection runs there)
            return await self._handle_diagnostic(
                history,
                language,
                lang_instr,
                preselected_subject,
                preselected_framework,
            )

        content = (
            "What subject and exam framework are you preparing for? "
            "(e.g., AP Calculus, A Level Physics, 高考数学, IB Math AA HL)"
            if language == "en" else
            "你在备考哪个科目和考试框架？（例如：AP Calculus、A Level Physics、高考数学、IB Math AA HL）"
        )
        return PlanResponse(stage=PlanStage.OPENING, content=content, response_source="opening")

    async def _handle_diagnostic(
        self,
        history,
        language,
        lang_instr,
        preselected_subject: Optional[str] = None,
        preselected_framework: Optional[str] = None,
    ) -> PlanResponse:
        """Stage 2: Diagnostic — dynamic AI-driven Q&A capped at MAX_DIAGNOSTIC_TURNS.
        The LLM may emit a structured ```ask_user {...}``` block to surface clickable
        option chips; otherwise the model just asks a free-form question or signals
        readiness via the start-signal phrases."""
        diagnostic_turns = _count_diagnostic_turns(history)
        detection = await self._detect_for(history, language, preselected_subject, preselected_framework)

        # Hard cap: after MAX_DIAGNOSTIC_TURNS turns, force plan generation
        if diagnostic_turns >= MAX_DIAGNOSTIC_TURNS:
            return await self._handle_plan_review(history, language, lang_instr, detection, fast=True)

        if detection and preselected_subject and preselected_framework and not detection.course_id:
            options = _course_options(preselected_framework, preselected_subject, language)
            if options:
                content = (
                    "Got it. Choose the exact course first, then I’ll build the plan."
                    if language == "en"
                    else "先选具体课程，我再生成计划。"
                )
                return PlanResponse(
                    stage=PlanStage.DIAGNOSTIC,
                    content=content,
                    response_source="deterministic_course_options",
                    diagnostic_question=content,
                    options=options,
                    allow_free_text=True,
                    detected_subject=_detection_to_dict(detection),
                )

        next_question = next_course_diagnostic_question(detection, history, language)
        if next_question:
            content = next_question.content(language)
            return PlanResponse(
                stage=PlanStage.DIAGNOSTIC,
                content=content,
                response_source=next_question.source,
                diagnostic_question=content,
                options=next_question.options(language),
                allow_free_text=True,
                detected_subject=_detection_to_dict(detection),
            )

        subject_ctx = ""
        if detection:
            framework_label = (
                f" ({detection.framework.upper().replace('_', ' ')} framework)" if detection.framework else ""
            )
            subject_ctx = f"Detected subject: {detection.subject}{framework_label}, difficulty: {detection.difficulty}."

        student_input = history[-1]["content"] if history else ""
        history_summary = "\n".join(
            f"- {m['role']}: {m['content'][:200]}" for m in history[-6:]
        )

        # Smart-interaction protocol: ask the model to drive its own diagnostic flow
        prompt = f"""{lang_instr}

You are an expert academic coach building a full-course study plan via a smart conversation.
{subject_ctx}
Recent conversation:
{history_summary}
{build_diagnostic_guidance(detection)}

Diagnostic turn {diagnostic_turns + 1} of max {MAX_DIAGNOSTIC_TURNS}.

Your job: drive a tight, helpful diagnostic. Decide what's missing for a great plan and ask ONE question that fills the biggest gap. Common gaps: current proficiency, weak topics, exam timeline, weekly study hours, target score.

You may include a structured ask_user block to suggest 2–4 clickable response options. Format EXACTLY like this when you do:

```ask_user
{{"question": "<your question text>", "options": ["option 1", "option 2", "option 3"], "allow_free_text": true}}
```

Place the block on its own lines after a one-sentence acknowledgement. Options must be SHORT (≤6 words each). Only emit the block when discrete options actually help (e.g., proficiency level, timeline buckets). Skip options for open-ended questions.

If you have enough information already (>= 2 useful diagnostic answers), reply only "READY_TO_GENERATE" with no other text — the system will then build the plan.

Tailor the question to {detection.framework.upper().replace('_', ' ') if detection and detection.framework else 'their'} framework specifics. Do NOT repeat earlier questions.

Keep total response ≤ 60 words excluding the ask_user block.
"""
        response = await api_client.study_plan_chat_completion(
            messages=[{"role": "user", "content": prompt}],
            phase="diagnostic",
            temperature=0.6,
            max_tokens=800,
        )
        content = _chat_completion_content(response)
        if not content:
            error_content = _temporary_ai_error(language)
            return PlanResponse(
                stage=PlanStage.DIAGNOSTIC,
                content=error_content,
                response_source="llm_diagnostic_error",
                diagnostic_question=error_content,
                options=["Retry", "Generate now"] if language == "en" else ["重试", "直接生成"],
                allow_free_text=True,
                detected_subject=_detection_to_dict(detection) if detection else None,
            )

        # Model signaled it has enough info → jump to plan review
        if "READY_TO_GENERATE" in content.upper():
            return await self._handle_plan_review(history, language, lang_instr, detection, fast=True)

        ask = _parse_ask_user_block(content)
        clean_content = _strip_ask_user_block(content) if ask else content

        return PlanResponse(
            stage=PlanStage.DIAGNOSTIC,
            content=clean_content,
            response_source="llm_diagnostic",
            diagnostic_question=ask["question"] if ask else clean_content,
            options=ask["options"] if ask else None,
            allow_free_text=ask["allow_free_text"] if ask else True,
            detected_subject=_detection_to_dict(detection) if detection else None,
        )

    async def _handle_plan_review(
        self, history, language, lang_instr, detection: Optional[SubjectDetection] = None, fast: bool = False
    ) -> PlanResponse:
        """Stage 3: Generate and reveal the full-course study plan."""
        user_messages = [m for m in history if m["role"] == "user"]
        subject_input = user_messages[0]["content"] if user_messages else "the subject"
        diagnostic_summary = (
            " | ".join(m["content"] for m in user_messages[1:])
            if len(user_messages) > 1
            else "Not much diagnostic info — use sensible defaults."
        )

        if detection is None:
            detection = await self._detect_for(history, language)

        subject_ctx = ""
        curriculum_note = ""
        if detection:
            course_label = f", Course: {detection.course_name}" if detection.course_name else ""
            subject_ctx = (
                f"Subject: {detection.subject}, Framework: {detection.framework or 'general'}, "
                f"Difficulty: {detection.difficulty}{course_label}."
            )
            curriculum_note = _build_curriculum_note(detection)

        fast_note = (
            "The student said 'just start' — skip lengthy preamble. "
            "One sentence of acknowledgement, then the JSON."
            if fast else ""
        )

        # Note (2026-05-03): the previous code forced output_language="zh" for
        # gaokao but never actually used the variable — `lang_instr` (from the
        # frontend-supplied `language` arg) drove the prompt. We now respect the
        # user's explicit language choice for every framework. If they choose
        # Gaokao with English, they get an English plan with Chinese exam
        # terminology preserved where standard.
        bilingual_terminology_hint = ""
        if detection and detection.framework == "gaokao" and language == "en":
            bilingual_terminology_hint = (
                "The student is studying for 高考 (Gaokao) but prefers English. "
                "Keep the response in English but include the Chinese term in parentheses "
                "for any 高考-specific topic, e.g., 'derivatives (导数)', '解析几何 (analytic geometry)'."
            )

        prompt = f"""{lang_instr}

You are an expert academic coach.
{subject_ctx}
Student's subject/framework input: {subject_input}
Diagnostic answers: {diagnostic_summary}
{curriculum_note}
{bilingual_terminology_hint}
{fast_note}

Your task:
1. In 1-2 sentences, briefly explain your plan rationale — friendly and encouraging.
2. Generate a compact full-course study plan with 6-10 units covering the complete syllabus.

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
        try:
            response = await asyncio.wait_for(
                api_client.study_plan_chat_completion(
                    messages=[{"role": "user", "content": prompt}],
                    phase="plan_review",
                    temperature=0.4,
                    max_tokens=1800,
                ),
                timeout=PLAN_REVIEW_LLM_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            return _plan_generation_error_response(
                language,
                "llm_plan_review_timeout_fast" if fast else "llm_plan_review_timeout",
                detection,
            )

        full_content = _chat_completion_content(response)
        if not full_content:
            return _plan_generation_error_response(
                language,
                "llm_plan_review_error_fast" if fast else "llm_plan_review_error",
                detection,
            )

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

        if not proposed_plan:
            return _plan_generation_error_response(
                language,
                "llm_plan_review_parse_error_fast" if fast else "llm_plan_review_parse_error",
                detection,
            )

        summary = (
            "Here's your personalized study plan — review it and hit **Let's go!** when ready."
            if language == "en" else
            "这是你的专属学习计划——确认后点击**开始吧！**。"
        )

        return PlanResponse(
            stage=PlanStage.PLAN_REVIEW,
            content=summary,
            response_source="llm_plan_review_fast" if fast else "llm_plan_review",
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
                response_source="locked_save",
            )
        return await self._handle_plan_review(history, language, lang_instr)
