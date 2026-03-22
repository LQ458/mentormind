"""
MentorMind Backend Server
Production API with bilingual support and clean organization
"""

import asyncio
import json
import os
import sys
import threading
from datetime import datetime
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
import uvicorn
from dotenv import load_dotenv
import tempfile
import shutil

# Load environment variables
load_dotenv()

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import core modules
from core.create_classes import ClassCreator, ClassCreationRequest, Language, ClassCreationResult
from core.modules.output import TTSSynthesizer
from celery.result import AsyncResult
from celery_app import create_class_video_task, transcript_to_lesson_task, transcribe_audio_task, celery_app
from database import LessonStorageSQL, init_database
from database import get_db
from database.models.user import User, UserProfile
from auth import get_current_user, get_optional_user
from config import config
from core.asr import transcribe_with_local_model_result, get_asr_status, extract_text_with_paddleocr
from core.summarize import summarize_extracted_content
from services.api_client import api_client, get_language_instruction
from prompts.loader import render_prompt

# Initialize PostgreSQL database (Strict)
print("🔧 Initializing PostgreSQL database...")
lesson_storage = None
try:
    if init_database():
        print("✅ PostgreSQL database initialized successfully")
        lesson_storage = LessonStorageSQL()
    else:
        print("⚠️  PostgreSQL database initialization failed")
except Exception as e:
    print(f"⚠️  PostgreSQL database initialization error: {e}")

# If PostgreSQL fails, use a dummy storage to prevent crashes but log errors
if lesson_storage is None:
    print("❌ PostgreSQL storage is required but not initialized. Server will have no persistence.")
    class DummyStorage:
        def __getattr__(self, name):
            def method(*args, **kwargs):
                print(f"❌ Storage operation '{name}' failed: PostgreSQL not connected")
                return None if name != "get_all_lessons" else ([], 0)
            return method
    lesson_storage = DummyStorage()


app = FastAPI(
    title="MentorMind API",
    description="Production backend API for MentorMind educational platform",
    version="2.0.0",
)

# Configure CORS for frontend
_cors_origins = ["http://localhost:3000", "http://localhost:3001"]
_extra_origins = os.getenv("CORS_ORIGINS", "")
if _extra_origins:
    _cors_origins += [o.strip() for o in _extra_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging middleware for debugging
from fastapi import Request
import time

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = None
    try:
        print(f"📡 [BACKEND] Request start: {request.method} {request.url.path}")
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000
        print(f"✅ [BACKEND] Request complete: {request.method} {request.url.path} - {response.status_code} ({process_time:.2f}ms)")
        return response
    except Exception as e:
        print(f"❌ [BACKEND] Request failed: {request.method} {request.url.path} - {e}")
        raise e

# Mount static files (audio/video)
if os.path.exists(config.DATA_DIR):
    app.mount("/api/files", StaticFiles(directory=config.DATA_DIR), name="files")
    print(f"📂 Mounted static files from: {config.DATA_DIR}")
else:
    print(f"⚠️ Data directory not found: {config.DATA_DIR}")

@app.on_event("startup")
async def preload_models():
    """Pre-load AI models on startup to avoid OOM during user requests."""
    preload_lang = os.getenv("PRELOAD_ASR_LANG", "en")
    if preload_lang.lower() == "none":
        print("⏭️ ASR model preload skipped (PRELOAD_ASR_LANG=none)")
        return
    print(f"⏳ Pre-loading ASR model for language: '{preload_lang}' ...")
    try:
        from core.asr import _get_funasr
        await asyncio.get_event_loop().run_in_executor(None, lambda: _get_funasr(preload_lang))
        lang_key = "en" if preload_lang in ("en", "en-US", "en-GB") else "zh"
        model_name = "Whisper base" if lang_key == "en" else "FunASR paraformer-zh"
        print(f"✅ {model_name} '{preload_lang}' model ready")
    except Exception as e:
        print(f"⚠️ FunASR preload failed (service will still start): {e}")


# ── Auth Schemas ─────────────────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    full_name: str = None
    language_preference: str = None


class UpsertUserInterestProfileRequest(BaseModel):
    grade_level: Optional[str] = None
    subject_interests: List[str] = Field(default_factory=list)
    current_challenges: Optional[str] = None
    long_term_goals: Optional[str] = None
    preferred_learning_style: Optional[str] = None
    weekly_study_hours: Optional[str] = None
    onboarding_completed: bool = False


class UpdateLessonProgressRequest(BaseModel):
    progress_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    is_completed: bool = False
    time_spent_minutes: int = Field(default=0, ge=0)


class RecordPerformanceRequest(BaseModel):
    assessment_type: str = "reflection"
    score: float = Field(default=0.0, ge=0.0, le=1.0)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    strengths: List[str] = Field(default_factory=list)
    struggles: List[str] = Field(default_factory=list)
    reflection: Optional[str] = None


class SeminarTurnRequest(BaseModel):
    moderator_input: str = Field(min_length=1)
    focus: Optional[str] = None


class SimulationTurnRequest(BaseModel):
    learner_action: str = Field(min_length=1)
    scenario_focus: Optional[str] = None


class OralDefenseTurnRequest(BaseModel):
    learner_answer: str = Field(min_length=1)
    focus: Optional[str] = None


class MemoryChallengeRequest(BaseModel):
    focus: Optional[str] = None


class DeliberateErrorRequest(BaseModel):
    focus: Optional[str] = None


def _get_or_create_user_profile(db, user_id: str) -> UserProfile:
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if profile:
        return profile

    profile = UserProfile(user_id=user_id)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def _build_profile_weighted_query(query: str, profile: Optional[UserProfile]) -> str:
    if not profile or not profile.onboarding_completed:
        return query

    def humanize(value: str) -> str:
        labels = {
            "middle-school": "Middle School",
            "high-school": "High School",
            "undergraduate": "Undergraduate",
            "graduate": "Graduate",
            "professional": "Professional",
            "lifelong-learner": "Independent Learner",
            "mathematics": "Mathematics",
            "computer-science": "Computer Science",
            "physics": "Physics",
            "chemistry": "Chemistry",
            "biology": "Biology",
            "english": "English",
            "visual": "Visual Explanations",
            "practice-first": "Practice First",
            "concept-first": "Concept First",
            "conversational": "Conversational Coaching",
            "<2": "Less than 2 hours",
            "2-4": "2-4 hours",
            "5-8": "5-8 hours",
            "9-12": "9-12 hours",
            "12+": "12+ hours",
        }
        return labels.get(value, value)

    context_lines = []
    if profile.grade_level:
        context_lines.append(f"Grade level: {humanize(profile.grade_level)}")
    if profile.subject_interests:
        context_lines.append(
            "Subject interests: " + ", ".join(humanize(subject) for subject in profile.subject_interests)
        )
    if profile.current_challenges:
        context_lines.append(f"Current challenges: {profile.current_challenges}")
    if profile.long_term_goals:
        context_lines.append(f"Long-term goals: {profile.long_term_goals}")
    if profile.preferred_learning_style:
        context_lines.append(f"Preferred learning style: {humanize(profile.preferred_learning_style)}")
    if profile.weekly_study_hours:
        context_lines.append(f"Weekly study time: {humanize(profile.weekly_study_hours)}")

    if not context_lines:
        return query

    return (
        "Student background:\n"
        + "\n".join(f"- {line}" for line in context_lines)
        + "\n\n"
        + "Latest request:\n"
        + query
        + "\n\nUse the student background to prioritize the most relevant learning topics, "
          "but keep the recommendations grounded in the latest request."
    )


def _sanitize_topic_and_requirements(topic: str, custom_requirements: Optional[str]) -> tuple[str, Optional[str]]:
    """
    Defensive cleanup in case frontend payloads leak personalization context into `topic`.
    """
    if not topic:
        return topic, custom_requirements

    markers = ["\n\nLearner profile:", "\nLearner profile:"]
    leaked_context = None
    cleaned_topic = topic

    for marker in markers:
        if marker in topic:
            cleaned_topic, leaked_context = topic.split(marker, 1)
            leaked_context = f"Learner profile:{leaked_context}".strip()
            cleaned_topic = cleaned_topic.strip()
            break

    if not leaked_context:
        return topic.strip(), custom_requirements

    merged_requirements = (custom_requirements or "").strip()
    if leaked_context not in merged_requirements:
        merged_requirements = f"{merged_requirements}\n\n{leaked_context}".strip() if merged_requirements else leaked_context

    return cleaned_topic, merged_requirements or None


def _build_process_layer(
    lesson: Dict[str, Any],
    lesson_state: Optional[Dict[str, Any]] = None,
    profile: Optional[UserProfile] = None,
) -> Dict[str, Any]:
    """Derive a transparent process-first learning layer for the lesson room."""
    objectives = lesson.get("objectives") or []
    objective_texts = [
        item.get("objective") if isinstance(item, dict) else str(item)
        for item in objectives
        if item
    ]
    ai_insights = lesson.get("ai_insights") or {}
    title = lesson.get("title") or lesson.get("topic") or "Lesson"
    description = lesson.get("description") or ai_insights.get("class_description") or ""
    language = lesson.get("language", "en")
    is_chinese = language == "zh"

    primary_goal = objective_texts[0] if objective_texts else (
        "用自己的话解释核心概念" if is_chinese else "Explain the core concept in your own words"
    )
    stretch_goal = objective_texts[1] if len(objective_texts) > 1 else (
        "把规则和图像联系起来" if is_chinese else "Connect the rule to a concrete representation"
    )

    profile_hint = None
    if profile and profile.long_term_goals:
        profile_hint = profile.long_term_goals
    elif profile and profile.current_challenges:
        profile_hint = profile.current_challenges

    mastery = None
    if lesson_state and lesson_state.get("next_review"):
        mastery = (lesson_state.get("next_review", {}).get("metadata") or {}).get("mastery")

    if mastery is None and lesson_state and lesson_state.get("latest_performance"):
        mastery = lesson_state["latest_performance"].get("score")

    if mastery is None:
        intervention_mode = "memory_challenge"
    elif mastery >= 0.82:
        intervention_mode = "deliberate_error"
    elif mastery >= 0.62:
        intervention_mode = "oral_defense"
    else:
        intervention_mode = "memory_challenge"

    if profile_hint and mastery is not None and mastery >= 0.78:
        simulation_title = (
            f"把 {profile_hint} 变成一个应用任务"
            if is_chinese else
            f"Turn {profile_hint} into an applied scenario"
        )
    else:
        simulation_title = (
            f"在真实情境中运用 {title}"
            if is_chinese else
            f"Use {title} in a real situation"
        )

    return {
        "thinking_path": {
            "summary": (
                "先看核心概念，再连接图像、边界条件与常见错误。"
                if is_chinese else
                "Move from the core concept into representation, boundary conditions, and common mistakes."
            ),
            "nodes": [
                {"id": "topic", "label": title, "kind": "topic"},
                {"id": "goal_1", "label": primary_goal, "kind": "objective"},
                {"id": "goal_2", "label": stretch_goal, "kind": "objective"},
                {
                    "id": "friction",
                    "label": "刻意错误 / Deliberate Error" if is_chinese else "Deliberate Error Check",
                    "kind": "friction",
                },
            ],
            "edges": [
                {"from": "topic", "to": "goal_1"},
                {"from": "goal_1", "to": "goal_2"},
                {"from": "goal_2", "to": "friction"},
            ],
        },
        "seminar": {
            "moderator_prompt": (
                "你是主持人。请判断哪一个角色最接近完整理解，并用自己的例子做最后裁决。"
                if is_chinese else
                "You are the moderator. Decide which role is closest to a full understanding, then settle it with your own example."
            ),
            "roles": [
                {
                    "name": "导师" if is_chinese else "Mentor",
                    "stance": (
                        f"先把 {title} 的核心模型说清楚。"
                        if is_chinese else
                        f"Clarify the core mental model behind {title}."
                    ),
                },
                {
                    "name": "高水平同伴" if is_chinese else "High Achiever",
                    "stance": (
                        f"把它和这个目标连接起来：{primary_goal}"
                        if is_chinese else
                        f"Connect it directly to this objective: {primary_goal}"
                    ),
                },
                {
                    "name": "吃力中的同伴" if is_chinese else "Struggling Learner",
                    "stance": (
                        f"指出最容易混淆的地方：{stretch_goal}"
                        if is_chinese else
                        f"Surface the likely confusion point: {stretch_goal}"
                    ),
                },
            ],
        },
        "simulation": {
            "title": simulation_title,
            "scenario": (
                f"请把 {title} 放进一个需要你做判断的现实情境中，并解释你的选择。"
                if is_chinese else
                f"Place {title} inside a realistic decision-making scenario and justify your choice."
            ),
            "success_criteria": [
                "能解释决策依据" if is_chinese else "Explain the decision rule",
                "能指出错误代价" if is_chinese else "Identify the cost of being wrong",
                "能根据反馈调整" if is_chinese else "Adjust after feedback",
            ],
        },
        "oral_defense": {
            "panel_title": "专家小组答辩" if is_chinese else "Expert Panel Oral Defense",
            "questions": [
                (
                    f"为什么 {title} 是合理的？"
                    if is_chinese else
                    f"Why does {title} make sense?"
                ),
                (
                    "它在什么条件下会失效或被误用？"
                    if is_chinese else
                    "Under what conditions does it break down or get misused?"
                ),
                (
                    "如果你要教给另一个学生，你会先讲什么？"
                    if is_chinese else
                    "If you had to teach this to another learner, what would you explain first?"
                ),
            ],
        },
        "intervention_recommendation": {
            "mode": intervention_mode,
            "label": {
                "memory_challenge": "3 分钟记忆挑战" if is_chinese else "3-Minute Memory Challenge",
                "deliberate_error": "刻意错误审计" if is_chinese else "Deliberate Error Audit",
                "oral_defense": "口头答辩" if is_chinese else "Oral Defense",
            }[intervention_mode],
            "reason": (
                "基于当前掌握度，先进行主动回忆最有效。"
                if intervention_mode == "memory_challenge" and is_chinese else
                "Based on current mastery, retrieval practice is the highest-value next step."
                if intervention_mode == "memory_challenge" else
                "你已经有一定掌握度，现在更适合通过错误审计或口头辩护来加深理解。"
                if is_chinese else
                "You have enough baseline understanding to benefit from critique and defense instead of simple review."
            ),
        },
        "description": description,
    }


def _fallback_seminar_turn(
    lesson: Dict[str, Any],
    process_layer: Dict[str, Any],
    moderator_input: str,
) -> Dict[str, Any]:
    """Deterministic fallback when the LLM seminar call is unavailable."""
    roles = process_layer.get("seminar", {}).get("roles", [])
    language = lesson.get("language", "en")
    is_chinese = language == "zh"
    base_messages = []
    for role in roles:
        if is_chinese:
            base_messages.append({
                "role": role.get("name", "角色"),
                "message": f"{role.get('stance', '')} 我会围绕“{moderator_input}”给出我的判断。",
            })
        else:
            base_messages.append({
                "role": role.get("name", "Role"),
                "message": f"{role.get('stance', '')} I would frame my response around: {moderator_input}",
            })

    return {
        "messages": base_messages,
        "synthesis": (
            f"综合来看，你需要把讨论重新拉回到这个问题：{moderator_input}"
            if is_chinese else
            f"The strongest next move is to pull the discussion back to this core question: {moderator_input}"
        ),
        "next_moderator_prompt": (
            "请要求三位角色都用一个具体例子来支持自己的判断。"
            if is_chinese else
            "Ask each role to support their claim with one concrete example."
        ),
    }


def _fallback_simulation_turn(
    lesson: Dict[str, Any],
    process_layer: Dict[str, Any],
    learner_action: str,
) -> Dict[str, Any]:
    """Deterministic fallback when live simulation generation is unavailable."""
    language = lesson.get("language", "en")
    is_chinese = language == "zh"
    title = lesson.get("title") or lesson.get("topic") or ("本课主题" if is_chinese else "this lesson")
    return {
        "counterparty_role": "苛刻客户" if is_chinese else "Demanding Customer",
        "counterparty_message": (
            f"你的做法已经有方向了，但请把它更具体地应用到“{title}”里。"
            if is_chinese else
            f"Your move has potential, but make it more concrete inside the context of {title}."
        ),
        "pressure": (
            "现在加一个限制条件：时间更少、错误代价更高。你会怎么调整？"
            if is_chinese else
            "Now add one constraint: less time and a higher cost of being wrong. How would you adapt?"
        ),
        "coach_feedback": (
            f"你刚才的回答是：{learner_action}。下一步请明确你的判断规则，而不是只给结论。"
            if is_chinese else
            f"You said: {learner_action}. The next improvement is to state your decision rule, not just the conclusion."
        ),
        "next_prompt": (
            "请再回答一次，这次要包含：判断依据、最可能的风险、以及你会如何根据反馈修正。"
            if is_chinese else
            "Answer again, but this time include: your rule, the main risk, and how you would revise after feedback."
        ),
        "score_hint": {
            "score": 0.62,
            "confidence": 0.58,
            "strengths": ["开始把概念放进情境中"] if is_chinese else ["starting to apply the concept in context"],
            "struggles": ["推理规则还不够明确"] if is_chinese else ["decision rule still needs sharpening"],
            "reflection": (
                "我开始能把概念放进应用场景里，但还需要更清楚地说明如何做判断。"
                if is_chinese else
                "I am starting to apply the concept, but I still need to explain my decision rule more clearly."
            ),
        },
    }


def _fallback_oral_defense_turn(
    lesson: Dict[str, Any],
    learner_answer: str,
) -> Dict[str, Any]:
    """Deterministic fallback when live oral-defense generation is unavailable."""
    language = lesson.get("language", "en")
    is_chinese = language == "zh"
    title = lesson.get("title") or lesson.get("topic") or ("本课主题" if is_chinese else "this topic")
    panel = [
        {
            "role": "概念专家" if is_chinese else "Concept Expert",
            "message": (
                f"你的回答已经触及 {title} 的核心，但还需要更明确地点出它为什么成立。"
                if is_chinese else
                f"Your answer touches the core of {title}, but it still needs a clearer statement of why it works."
            ),
        },
        {
            "role": "边界条件专家" if is_chinese else "Boundary Expert",
            "message": (
                "请补充它在什么条件下会失效、被误用，或者需要特别小心。"
                if is_chinese else
                "Add the conditions under which it breaks down, gets misused, or needs extra caution."
            ),
        },
        {
            "role": "教学专家" if is_chinese else "Teaching Expert",
            "message": (
                "如果你要教给别人，请先给一个简单例子，再讲规则。"
                if is_chinese else
                "If you had to teach it, start with one simple example and then name the rule."
            ),
        },
    ]
    return {
        "panel": panel,
        "verdict": (
            f"你已经开始形成对 {title} 的口头解释，但还需要把“为什么成立”和“何时失效”说得更完整。"
            if is_chinese else
            f"You are forming a workable defense of {title}, but you still need a fuller explanation of why it works and when it fails."
        ),
        "next_question": (
            "现在请用一个反例或边界情形，证明你不是只记住了结论。"
            if is_chinese else
            "Now use one counterexample or boundary case to prove you are not just recalling the conclusion."
        ),
        "score_hint": {
            "score": 0.64,
            "confidence": 0.6,
            "strengths": ["能够开始解释概念"] if is_chinese else ["able to begin explaining the concept"],
            "struggles": ["边界条件还不够清楚"] if is_chinese else ["boundary conditions are still fuzzy"],
            "reflection": (
                f"我已经能开始为 {title} 做口头辩护，但还需要更完整地说明原理和限制。"
                if is_chinese else
                f"I can begin defending {title}, but I still need to explain the mechanism and limits more completely."
            ),
        },
    }


def _fallback_memory_challenge(lesson: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministic fallback for retrieval-practice generation."""
    language = lesson.get("language", "en")
    is_chinese = language == "zh"
    title = lesson.get("title") or lesson.get("topic") or ("本课主题" if is_chinese else "this lesson")
    return {
        "title": "3 分钟记忆挑战" if is_chinese else "3-Minute Memory Challenge",
        "prompt": (
            f"不用回看材料，请先用自己的话解释 {title} 的核心概念。"
            if is_chinese else
            f"Without replaying the material, explain the core idea of {title} in your own words."
        ),
        "questions": [
            "关键规则是什么？" if is_chinese else "What is the key rule or pattern?",
            "举一个你自己的例子。" if is_chinese else "Give one example of your own.",
            "最常见的误解是什么？" if is_chinese else "What is the most common misconception?",
        ],
        "self_check": [
            "我能不看提示说明核心概念" if is_chinese else "I can explain the core idea without prompts",
            "我能给出一个新例子" if is_chinese else "I can generate a new example",
            "我知道最容易犯的错误" if is_chinese else "I know the likeliest mistake",
        ],
        "recommended_reflection": (
            "如果你卡住了，说明应该更早复习，而不是更晚。"
            if is_chinese else
            "If you got stuck, the review window should move earlier, not later."
        ),
    }


def _fallback_deliberate_error_challenge(lesson: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministic fallback for deliberate-error generation."""
    language = lesson.get("language", "en")
    is_chinese = language == "zh"
    title = lesson.get("title") or lesson.get("topic") or ("本课主题" if is_chinese else "this lesson")
    return {
        "title": "刻意错误审计" if is_chinese else "Deliberate Error Audit",
        "flawed_claim": (
            f"关于 {title}，只要记住结论就够了，条件与边界几乎不会影响判断。"
            if is_chinese else
            f"For {title}, remembering the final answer is enough; conditions and edge cases rarely change the decision."
        ),
        "audit_prompt": (
            "请指出这句话最危险的错误，并解释为什么它会误导学习者。"
            if is_chinese else
            "Identify the most dangerous mistake in this claim and explain why it would mislead a learner."
        ),
        "hints": [
            "先看它忽略了哪些条件。" if is_chinese else "Start by asking which conditions it ignores.",
            "再看它是否把结果当成了规则本身。" if is_chinese else "Then ask whether it confuses the result with the reasoning.",
        ],
        "correction_target": (
            "一个更好的回答应该同时说清：规则、条件、以及何时容易误用。"
            if is_chinese else
            "A stronger correction should name the rule, the conditions, and when the idea is easy to misuse."
        ),
        "score_hint": {
            "score": 0.7,
            "confidence": 0.64,
            "strengths": ["开始审计边界条件"] if is_chinese else ["starting to audit boundary conditions"],
            "struggles": ["还需要更明确地区分规则和结论"] if is_chinese else ["still needs a sharper distinction between rule and conclusion"],
            "reflection": (
                "我开始能找出推理中的危险跳步，但还需要更清楚地说明正确说法。"
                if is_chinese else
                "I am starting to catch risky leaps in reasoning, but I still need to state the corrected version more clearly."
            ),
        },
    }


def _format_interaction_history(recent_interactions: Optional[List[Dict[str, Any]]]) -> str:
    """Compress recent stored turns into prompt-friendly context."""
    if not recent_interactions:
        return "- No prior interaction history"

    lines: List[str] = []
    for item in recent_interactions[-4:]:
        lines.append(f"- User: {item.get('user_input', '')}")
        agent_output = item.get("agent_output") or {}
        if "synthesis" in agent_output:
            lines.append(f"  System synthesis: {agent_output.get('synthesis')}")
        elif "coach_feedback" in agent_output:
            lines.append(f"  Coach feedback: {agent_output.get('coach_feedback')}")
        elif "verdict" in agent_output:
            lines.append(f"  Panel verdict: {agent_output.get('verdict')}")
    return "\n".join(lines) if lines else "- No prior interaction history"


async def _generate_multi_agent_seminar_turn(
    lesson: Dict[str, Any],
    process_layer: Dict[str, Any],
    moderator_input: str,
    focus: Optional[str] = None,
    profile: Optional[UserProfile] = None,
    lesson_state: Optional[Dict[str, Any]] = None,
    recent_interactions: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Generate a live seminar turn with mentor/high-achiever/struggling-learner responses."""
    language = lesson.get("language", "en")
    lang_instruction = get_language_instruction(language)
    roles = process_layer.get("seminar", {}).get("roles", [])
    role_lines = "\n".join(f"- {role.get('name')}: {role.get('stance')}" for role in roles)
    objective_lines = "\n".join(
        f"- {item.get('objective')}"
        for item in (lesson.get("objectives") or [])
        if isinstance(item, dict) and item.get("objective")
    )
    profile_lines = "\n".join(profile.to_ai_context_lines()) if profile else ""
    state_lines = []
    if lesson_state:
        latest = lesson_state.get("latest_performance") or {}
        next_review = lesson_state.get("next_review") or {}
        if latest:
            state_lines.append(f"Latest score: {latest.get('score')}")
            state_lines.append(f"Latest confidence: {latest.get('confidence')}")
        if next_review:
            state_lines.append(f"Recommended intervention mode: {(next_review.get('metadata') or {}).get('trigger', 'memory_challenge')}")

    prompt = render_prompt(
        "learning/seminar",
        language_instruction=lang_instruction,
        lesson_title=lesson.get("title") or lesson.get("topic"),
        lesson_description=lesson.get("description") or "",
        objective_lines=objective_lines or "- No explicit objectives available",
        role_lines=role_lines,
        profile_lines=profile_lines or "- No extra profile context",
        state_lines="\n".join(f"- {line}" for line in state_lines) if state_lines else "- No current state recorded",
        interaction_history=_format_interaction_history(recent_interactions),
        focus=focus or "General understanding",
        moderator_input=moderator_input,
    ).strip()

    try:
        response = await api_client.deepseek.chat_completion(
            messages=[
                {"role": "system", "content": f"You are a careful seminar orchestrator. {lang_instruction}"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=1200,
        )
        if not response.success or not response.data:
            return _fallback_seminar_turn(lesson, process_layer, moderator_input)

        content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
        import re
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return _fallback_seminar_turn(lesson, process_layer, moderator_input)
        parsed = json.loads(match.group(0))
        if not isinstance(parsed, dict) or "messages" not in parsed:
            return _fallback_seminar_turn(lesson, process_layer, moderator_input)
        return parsed
    except Exception as exc:
        print(f"⚠️ Seminar generation failed, using fallback: {exc}")
        return _fallback_seminar_turn(lesson, process_layer, moderator_input)


async def _generate_simulation_turn(
    lesson: Dict[str, Any],
    process_layer: Dict[str, Any],
    learner_action: str,
    scenario_focus: Optional[str] = None,
    profile: Optional[UserProfile] = None,
    lesson_state: Optional[Dict[str, Any]] = None,
    recent_interactions: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Generate one live applied-simulation turn for the learner."""
    language = lesson.get("language", "en")
    lang_instruction = get_language_instruction(language)
    simulation = process_layer.get("simulation", {})
    title = lesson.get("title") or lesson.get("topic")
    profile_lines = "\n".join(profile.to_ai_context_lines()) if profile else ""
    state_lines = []
    if lesson_state:
        latest = lesson_state.get("latest_performance") or {}
        next_review = lesson_state.get("next_review") or {}
        if latest:
            state_lines.append(f"Latest score: {latest.get('score')}")
            state_lines.append(f"Latest confidence: {latest.get('confidence')}")
        if next_review:
            state_lines.append(f"Next review trigger: {(next_review.get('metadata') or {}).get('trigger', 'memory_challenge')}")

    prompt = render_prompt(
        "learning/simulation",
        language_instruction=lang_instruction,
        lesson_title=title,
        lesson_description=lesson.get("description") or "",
        simulation_title=simulation.get("title") or "",
        scenario=simulation.get("scenario") or "",
        success_criteria="\n".join(f"- {item}" for item in (simulation.get("success_criteria") or [])) or "- Explain the decision rule",
        profile_lines=profile_lines or "- No extra profile context",
        state_lines="\n".join(f"- {line}" for line in state_lines) if state_lines else "- No current state recorded",
        interaction_history=_format_interaction_history(recent_interactions),
        scenario_focus=scenario_focus or "General application",
        learner_action=learner_action,
    ).strip()

    try:
        response = await api_client.deepseek.chat_completion(
            messages=[
                {"role": "system", "content": f"You run short educational simulations. {lang_instruction}"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.45,
            max_tokens=1200,
        )
        if not response.success or not response.data:
            return _fallback_simulation_turn(lesson, process_layer, learner_action)

        content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
        import re
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return _fallback_simulation_turn(lesson, process_layer, learner_action)
        parsed = json.loads(match.group(0))
        if not isinstance(parsed, dict) or "counterparty_message" not in parsed:
            return _fallback_simulation_turn(lesson, process_layer, learner_action)
        return parsed
    except Exception as exc:
        print(f"⚠️ Simulation generation failed, using fallback: {exc}")
        return _fallback_simulation_turn(lesson, process_layer, learner_action)


async def _generate_oral_defense_turn(
    lesson: Dict[str, Any],
    process_layer: Dict[str, Any],
    learner_answer: str,
    focus: Optional[str] = None,
    profile: Optional[UserProfile] = None,
    lesson_state: Optional[Dict[str, Any]] = None,
    recent_interactions: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Generate one live oral-defense turn for the learner."""
    language = lesson.get("language", "en")
    lang_instruction = get_language_instruction(language)
    oral_defense = process_layer.get("oral_defense", {})
    title = lesson.get("title") or lesson.get("topic")
    objective_lines = "\n".join(
        f"- {item.get('objective')}"
        for item in (lesson.get("objectives") or [])
        if isinstance(item, dict) and item.get("objective")
    )
    profile_lines = "\n".join(profile.to_ai_context_lines()) if profile else ""
    state_lines = []
    if lesson_state:
        latest = lesson_state.get("latest_performance") or {}
        if latest:
            state_lines.append(f"Latest score: {latest.get('score')}")
            state_lines.append(f"Latest confidence: {latest.get('confidence')}")

    prompt = render_prompt(
        "learning/oral_defense",
        language_instruction=lang_instruction,
        lesson_title=title,
        lesson_description=lesson.get("description") or "",
        objective_lines=objective_lines or "- No explicit objectives available",
        panel_title=oral_defense.get("panel_title") or "Expert Panel",
        panel_questions="\n".join(f"- {item}" for item in (oral_defense.get("questions") or [])) or "- Ask the learner to explain why it works",
        profile_lines=profile_lines or "- No extra profile context",
        state_lines="\n".join(f"- {line}" for line in state_lines) if state_lines else "- No current state recorded",
        interaction_history=_format_interaction_history(recent_interactions),
        focus=focus or "General understanding",
        learner_answer=learner_answer,
    ).strip()

    try:
        response = await api_client.deepseek.chat_completion(
            messages=[
                {"role": "system", "content": f"You are an educational oral-defense panel. {lang_instruction}"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=1200,
        )
        if not response.success or not response.data:
            return _fallback_oral_defense_turn(lesson, learner_answer)

        content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
        import re
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return _fallback_oral_defense_turn(lesson, learner_answer)
        parsed = json.loads(match.group(0))
        if not isinstance(parsed, dict) or "panel" not in parsed:
            return _fallback_oral_defense_turn(lesson, learner_answer)
        return parsed
    except Exception as exc:
        print(f"⚠️ Oral-defense generation failed, using fallback: {exc}")
        return _fallback_oral_defense_turn(lesson, learner_answer)


async def _generate_memory_challenge(
    lesson: Dict[str, Any],
    profile: Optional[UserProfile] = None,
    lesson_state: Optional[Dict[str, Any]] = None,
    focus: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate a short retrieval-practice challenge based on forgetting risk."""
    language = lesson.get("language", "en")
    lang_instruction = get_language_instruction(language)
    title = lesson.get("title") or lesson.get("topic")
    objective_lines = "\n".join(
        f"- {item.get('objective')}"
        for item in (lesson.get("objectives") or [])
        if isinstance(item, dict) and item.get("objective")
    )
    profile_lines = "\n".join(profile.to_ai_context_lines()) if profile else ""
    state_lines = []
    if lesson_state:
        latest = lesson_state.get("latest_performance") or {}
        next_review = lesson_state.get("next_review") or {}
        if latest:
            state_lines.append(f"Latest score: {latest.get('score')}")
            state_lines.append(f"Latest confidence: {latest.get('confidence')}")
        if next_review:
            state_lines.append(f"Next review in hours: {next_review.get('interval_hours')}")

    prompt = render_prompt(
        "learning/memory_challenge",
        language_instruction=lang_instruction,
        lesson_title=title,
        lesson_description=lesson.get("description") or "",
        objective_lines=objective_lines or "- No explicit objectives available",
        profile_lines=profile_lines or "- No extra profile context",
        state_lines="\n".join(f"- {line}" for line in state_lines) if state_lines else "- No current state recorded",
        focus=focus or "Core concept recall",
    ).strip()

    try:
        response = await api_client.deepseek.chat_completion(
            messages=[
                {"role": "system", "content": f"You design short retrieval-practice challenges. {lang_instruction}"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.35,
            max_tokens=900,
        )
        if not response.success or not response.data:
            return _fallback_memory_challenge(lesson)

        content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
        import re
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return _fallback_memory_challenge(lesson)
        parsed = json.loads(match.group(0))
        if not isinstance(parsed, dict) or "questions" not in parsed:
            return _fallback_memory_challenge(lesson)
        return parsed
    except Exception as exc:
        print(f"⚠️ Memory challenge generation failed, using fallback: {exc}")
        return _fallback_memory_challenge(lesson)


async def _generate_deliberate_error_challenge(
    lesson: Dict[str, Any],
    profile: Optional[UserProfile] = None,
    lesson_state: Optional[Dict[str, Any]] = None,
    focus: Optional[str] = None,
    recent_interactions: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Generate a deliberate-error audit to create productive friction."""
    language = lesson.get("language", "en")
    lang_instruction = get_language_instruction(language)
    title = lesson.get("title") or lesson.get("topic")
    objective_lines = "\n".join(
        f"- {item.get('objective')}"
        for item in (lesson.get("objectives") or [])
        if isinstance(item, dict) and item.get("objective")
    )
    profile_lines = "\n".join(profile.to_ai_context_lines()) if profile else ""
    state_lines = []
    if lesson_state:
        latest = lesson_state.get("latest_performance") or {}
        if latest:
            state_lines.append(f"Latest score: {latest.get('score')}")
            state_lines.append(f"Latest confidence: {latest.get('confidence')}")

    prompt = render_prompt(
        "learning/deliberate_error",
        language_instruction=lang_instruction,
        lesson_title=title,
        lesson_description=lesson.get("description") or "",
        objective_lines=objective_lines or "- No explicit objectives available",
        profile_lines=profile_lines or "- No extra profile context",
        state_lines="\n".join(f"- {line}" for line in state_lines) if state_lines else "- No current state recorded",
        interaction_history=_format_interaction_history(recent_interactions),
        focus=focus or "Boundary conditions and reasoning quality",
    ).strip()

    try:
        response = await api_client.deepseek.chat_completion(
            messages=[
                {"role": "system", "content": f"You design deliberate-error audits for learning. {lang_instruction}"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=1000,
        )
        if not response.success or not response.data:
            return _fallback_deliberate_error_challenge(lesson)

        content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
        import re
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return _fallback_deliberate_error_challenge(lesson)
        parsed = json.loads(match.group(0))
        if not isinstance(parsed, dict) or "flawed_claim" not in parsed:
            return _fallback_deliberate_error_challenge(lesson)
        return parsed
    except Exception as exc:
        print(f"⚠️ Deliberate-error generation failed, using fallback: {exc}")
        return _fallback_deliberate_error_challenge(lesson)

@app.get("/users/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Return the current authenticated user's profile."""
    return current_user.to_dict()


@app.patch("/users/me")
def update_me(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db = Depends(get_db),
):
    """Update the current user's profile."""
    if req.full_name is not None:
        current_user.full_name = req.full_name
    if req.language_preference is not None:
        current_user.language_preference = req.language_preference
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user.to_dict()


@app.get("/users/me/profile")
def get_my_interest_profile(
    current_user: User = Depends(get_current_user),
    db = Depends(get_db),
):
    """Return the learner onboarding profile for the current user."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        return {
            "user_id": str(current_user.id),
            "grade_level": None,
            "subject_interests": [],
            "current_challenges": None,
            "long_term_goals": None,
            "preferred_learning_style": None,
            "weekly_study_hours": None,
            "onboarding_completed": False,
            "created_at": None,
            "updated_at": None,
        }
    return profile.to_dict()


@app.put("/users/me/profile")
def upsert_my_interest_profile(
    req: UpsertUserInterestProfileRequest,
    current_user: User = Depends(get_current_user),
    db = Depends(get_db),
):
    """Create or update the learner onboarding profile for the current user."""
    profile = _get_or_create_user_profile(db, str(current_user.id))
    cleaned_subjects = [subject.strip() for subject in (req.subject_interests or []) if subject and subject.strip()]

    profile.grade_level = req.grade_level
    profile.subject_interests = cleaned_subjects
    profile.current_challenges = req.current_challenges
    profile.long_term_goals = req.long_term_goals
    profile.preferred_learning_style = req.preferred_learning_style
    profile.weekly_study_hours = req.weekly_study_hours
    profile.onboarding_completed = req.onboarding_completed

    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile.to_dict()


@app.get("/users/me/lessons")
def get_my_lessons(current_user: User = Depends(get_current_user)):
    """Return lessons created by the current authenticated user."""
    return lesson_storage.get_lessons_by_user(str(current_user.id))


@app.get("/users/me/review-queue")
def get_my_review_queue(current_user: User = Depends(get_current_user)):
    """Return psychology-driven review prompts ordered by forgetting risk."""
    return {
        "success": True,
        "items": lesson_storage.get_review_queue(str(current_user.id)),
    }


@app.post("/users/me/notifications/sync")
def sync_my_notifications(current_user: User = Depends(get_current_user)):
    """Materialize proactive in-app notifications from forgetting-curve risk."""
    items = lesson_storage.sync_proactive_notifications(str(current_user.id))
    return {"success": True, "created": items, "count": len(items)}


@app.get("/users/me/notifications")
def get_my_notifications(
    unread_only: bool = False,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
):
    """Return current user's in-app proactive notifications."""
    return {
        "success": True,
        "items": lesson_storage.get_notifications(
            str(current_user.id),
            unread_only=unread_only,
            limit=limit,
            auto_sync=True,
        ),
    }


@app.post("/users/me/notifications/{notification_id}/read")
def mark_my_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
):
    """Mark a proactive notification as read."""
    notification = lesson_storage.mark_notification_status(str(current_user.id), notification_id, "read")
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True, "notification": notification}


@app.post("/users/me/notifications/{notification_id}/dismiss")
def dismiss_my_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
):
    """Dismiss a proactive notification."""
    notification = lesson_storage.mark_notification_status(str(current_user.id), notification_id, "dismissed")
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True, "notification": notification}


@app.get("/users/me/lessons/{lesson_id}/state")
def get_my_lesson_state(lesson_id: str, current_user: User = Depends(get_current_user)):
    """Return progress and next-review state for the current user and lesson."""
    return {
        "success": True,
        "state": lesson_storage.get_lesson_state(str(current_user.id), lesson_id),
    }


@app.post("/users/me/lessons/{lesson_id}/progress")
def update_my_lesson_progress(
    lesson_id: str,
    req: UpdateLessonProgressRequest,
    current_user: User = Depends(get_current_user),
):
    """Update progress and schedule spaced review when a lesson is completed."""
    return {
        "success": True,
        "state": lesson_storage.upsert_user_lesson_progress(
            str(current_user.id),
            lesson_id,
            req.progress_percentage,
            is_completed=req.is_completed,
            time_spent_minutes=req.time_spent_minutes,
        ),
    }


@app.post("/users/me/lessons/{lesson_id}/performance")
def record_my_lesson_performance(
    lesson_id: str,
    req: RecordPerformanceRequest,
    current_user: User = Depends(get_current_user),
):
    """Record quiz/seminar/oral-defense performance and refresh spaced review schedule."""
    return {
        "success": True,
        "result": lesson_storage.record_student_performance(
            str(current_user.id),
            lesson_id,
            req.assessment_type,
            req.score,
            req.confidence,
            strengths=req.strengths,
            struggles=req.struggles,
            reflection=req.reflection,
        ),
    }


@app.post("/users/me/lessons/{lesson_id}/seminar")
async def run_my_lesson_seminar(
    lesson_id: str,
    req: SeminarTurnRequest,
    current_user: User = Depends(get_current_user),
    db = Depends(get_db),
):
    """Generate one live multi-agent seminar turn for the learner."""
    lesson = lesson_storage.get_lesson(lesson_id, include_relationships=True)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    lesson_state = lesson_storage.get_lesson_state(str(current_user.id), lesson_id)
    recent_interactions = lesson_storage.get_recent_agent_interactions(str(current_user.id), lesson_id, "seminar")
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    process_layer = _build_process_layer(lesson, lesson_state, profile)
    seminar_result = await _generate_multi_agent_seminar_turn(
        lesson,
        process_layer,
        req.moderator_input,
        focus=req.focus,
        profile=profile,
        lesson_state=lesson_state,
        recent_interactions=recent_interactions,
    )
    lesson_storage.store_agent_interaction(
        str(current_user.id),
        lesson_id,
        "seminar",
        req.moderator_input,
        seminar_result,
        metadata={"focus": req.focus},
    )

    return {
        "success": True,
        "seminar": seminar_result,
        "process_layer": process_layer.get("seminar"),
    }


@app.post("/users/me/lessons/{lesson_id}/simulation")
async def run_my_lesson_simulation(
    lesson_id: str,
    req: SimulationTurnRequest,
    current_user: User = Depends(get_current_user),
    db = Depends(get_db),
):
    """Generate one live applied-simulation turn for the learner."""
    lesson = lesson_storage.get_lesson(lesson_id, include_relationships=True)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    lesson_state = lesson_storage.get_lesson_state(str(current_user.id), lesson_id)
    recent_interactions = lesson_storage.get_recent_agent_interactions(str(current_user.id), lesson_id, "simulation")
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    process_layer = _build_process_layer(lesson, lesson_state, profile)
    simulation_result = await _generate_simulation_turn(
        lesson,
        process_layer,
        req.learner_action,
        scenario_focus=req.scenario_focus,
        profile=profile,
        lesson_state=lesson_state,
        recent_interactions=recent_interactions,
    )
    lesson_storage.store_agent_interaction(
        str(current_user.id),
        lesson_id,
        "simulation",
        req.learner_action,
        simulation_result,
        metadata={"scenario_focus": req.scenario_focus},
    )

    return {
        "success": True,
        "simulation": simulation_result,
        "process_layer": process_layer.get("simulation"),
    }


@app.post("/users/me/lessons/{lesson_id}/oral-defense")
async def run_my_lesson_oral_defense(
    lesson_id: str,
    req: OralDefenseTurnRequest,
    current_user: User = Depends(get_current_user),
    db = Depends(get_db),
):
    """Generate one live oral-defense turn for the learner."""
    lesson = lesson_storage.get_lesson(lesson_id, include_relationships=True)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    lesson_state = lesson_storage.get_lesson_state(str(current_user.id), lesson_id)
    recent_interactions = lesson_storage.get_recent_agent_interactions(str(current_user.id), lesson_id, "oral_defense")
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    process_layer = _build_process_layer(lesson, lesson_state, profile)
    oral_defense_result = await _generate_oral_defense_turn(
        lesson,
        process_layer,
        req.learner_answer,
        focus=req.focus,
        profile=profile,
        lesson_state=lesson_state,
        recent_interactions=recent_interactions,
    )
    lesson_storage.store_agent_interaction(
        str(current_user.id),
        lesson_id,
        "oral_defense",
        req.learner_answer,
        oral_defense_result,
        metadata={"focus": req.focus},
    )

    return {
        "success": True,
        "oral_defense": oral_defense_result,
        "process_layer": process_layer.get("oral_defense"),
    }


@app.post("/users/me/lessons/{lesson_id}/memory-challenge")
async def run_my_lesson_memory_challenge(
    lesson_id: str,
    req: MemoryChallengeRequest,
    current_user: User = Depends(get_current_user),
    db = Depends(get_db),
):
    """Generate a short retrieval-practice challenge for the learner."""
    lesson = lesson_storage.get_lesson(lesson_id, include_relationships=True)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    lesson_state = lesson_storage.get_lesson_state(str(current_user.id), lesson_id)
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    challenge = await _generate_memory_challenge(
        lesson,
        profile=profile,
        lesson_state=lesson_state,
        focus=req.focus,
    )

    return {
        "success": True,
        "memory_challenge": challenge,
    }


@app.post("/users/me/lessons/{lesson_id}/deliberate-error")
async def run_my_lesson_deliberate_error(
    lesson_id: str,
    req: DeliberateErrorRequest,
    current_user: User = Depends(get_current_user),
    db = Depends(get_db),
):
    """Generate one deliberate-error audit for the learner."""
    lesson = lesson_storage.get_lesson(lesson_id, include_relationships=True)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    lesson_state = lesson_storage.get_lesson_state(str(current_user.id), lesson_id)
    recent_interactions = lesson_storage.get_recent_agent_interactions(str(current_user.id), lesson_id, "deliberate_error")
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    challenge = await _generate_deliberate_error_challenge(
        lesson,
        profile=profile,
        lesson_state=lesson_state,
        focus=req.focus,
        recent_interactions=recent_interactions,
    )
    lesson_storage.store_agent_interaction(
        str(current_user.id),
        lesson_id,
        "deliberate_error",
        req.focus or "deliberate_error_audit",
        challenge,
        metadata={"focus": req.focus},
    )

    return {
        "success": True,
        "deliberate_error": challenge,
    }


@app.get("/lessons")
def get_lessons(
    language: Optional[str] = None,
    student_level: Optional[str] = None,
    difficulty: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    """List published lessons."""
    lessons, total = lesson_storage.get_all_lessons(
        language=language,
        student_level=student_level,
        difficulty=difficulty,
        limit=limit,
        offset=offset,
    )
    return {"success": True, "lessons": lessons, "total": total}


@app.get("/lessons/{lesson_id}")
def get_lesson_detail(
    lesson_id: str,
    current_user: Optional[User] = Depends(get_optional_user),
    db = Depends(get_db),
):
    """Return a single lesson with a derived process-first layer."""
    lesson = lesson_storage.get_lesson(lesson_id, include_relationships=True)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    lesson_state = None
    profile = None
    if current_user:
        lesson_state = lesson_storage.get_lesson_state(str(current_user.id), lesson_id)
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()

    lesson["process_layer"] = _build_process_layer(lesson, lesson_state, profile)
    if lesson_state:
        lesson["user_state"] = lesson_state

    return {"success": True, "lesson": lesson}


@app.delete("/lessons/{lesson_id}")
def delete_lesson(
    lesson_id: str,
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Delete a lesson if it exists and belongs to the current user when authenticated."""
    lesson = lesson_storage.get_lesson(lesson_id, include_relationships=False)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if current_user and lesson.get("user_id") and lesson.get("user_id") != str(current_user.id):
        raise HTTPException(status_code=403, detail="You do not have permission to delete this lesson")
    if not lesson_storage.delete_lesson(lesson_id):
        raise HTTPException(status_code=500, detail="Failed to delete lesson")
    return {"success": True, "lesson_id": lesson_id}


@app.delete("/lessons")
def delete_all_my_lessons(current_user: User = Depends(get_current_user)):
    """Delete all lessons owned by the current user."""
    lessons = lesson_storage.get_lessons_by_user(str(current_user.id), limit=1000)
    deleted = 0
    for lesson in lessons:
        if lesson_storage.delete_lesson(lesson["id"]):
            deleted += 1
    return {"success": True, "deleted": deleted}


# ── Status ───────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "online", "service": "MentorMind API", "version": "2.0.0"}

@app.get("/status")
async def get_status():
    """Check status of backend services"""
    import aiohttp
    
    async def probe(url: str):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=2) as resp:
                    return "online" if resp.status == 200 else "offline"
        except:
            return "offline"

    # External service probes
    funasr_endpoint = os.getenv("FUNASR_ENDPOINT", "http://localhost:10095")
    paddle_endpoint = os.getenv("PADDLE_OCR_ENDPOINT", "http://localhost:8866")
    deepseek_key = os.getenv("DEEPSEEK_API_KEY")

    funasr_ext, paddle_ext = await asyncio.gather(
        probe(funasr_endpoint),
        probe(paddle_endpoint),
    )

    # Probe internal state of models loaded by the process
    asr_status = get_asr_status()

    services_status = {
        "deepseek": "configured" if deepseek_key else "missing_key",
        "funasr": {"status": funasr_ext, "latency_ms": None},
        "whisper": {"status": "offline", "latency_ms": None},
        "paddle_ocr": {"status": paddle_ext, "latency_ms": None},
        "tts": "active",
        "ai_lessons": "active",
    }

    if asr_status["funasr_zh_loaded"]:
        services_status["funasr"]["status"] = "online"
        services_status["funasr"]["latency_ms"] = 0
    if asr_status["whisper_loaded"]:
        services_status["whisper"]["status"] = "online"
        services_status["whisper"]["latency_ms"] = 0
    if asr_status["paddleocr_loaded"]:
        services_status["paddle_ocr"]["status"] = "online"
        services_status["paddle_ocr"]["latency_ms"] = 0

    return {
        "status": "running",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat(),
        "services": services_status
    }

# 2. Per-chunk topic extraction via DeepSeek (summarise -> topic title).
# summarize_extracted_content is now imported from core.summarize


@app.get("/languages")
async def get_languages():
    """Get supported languages"""
    return {
        "languages": [
            {"code": "zh", "name": "Chinese", "native_name": "中文"},
            {"code": "en", "name": "English", "native_name": "English"},
            {"code": "ja", "name": "Japanese", "native_name": "日本語"},
            {"code": "ko", "name": "Korean", "native_name": "한국어"}
        ]
    }

@app.get("/voices")
async def get_voices():
    """Get available voices for TTS"""
    return {
        "success": True,
        "voices": [
            {"id": "anna", "name": "Anna (Chinese/English)", "gender": "Female"},
            {"id": "bella", "name": "Bella (Soft Chinese)", "gender": "Female"},
            {"id": "chris", "name": "Chris (Casual English)", "gender": "Male"}
        ]
    }

@app.post("/analyze-topics")
async def analyze_topics(
    request: Dict[str, Any],
    current_user: Optional[User] = Depends(get_optional_user),
    db = Depends(get_db),
):
    """Analyze student query to identify learning topics"""
    try:
        query = request.get("studentQuery", "")
        language = request.get("language", "zh")
        
        if not query:
            raise HTTPException(status_code=400, detail="studentQuery is required")
            
        profile = None
        if current_user:
            profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()

        weighted_query = _build_profile_weighted_query(query, profile)

        creator = ClassCreator()
        topics = await creator.analyze_student_query(weighted_query, language)
        
        return {
            "success": True,
            "topics": topics
        }
    except Exception as e:
        print(f"❌ Error analyzing topics: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )

@app.post("/create-class")
async def create_class(
    request: ClassCreationRequest,
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Initiate class creation job"""
    try:
        job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        clean_topic, merged_requirements = _sanitize_topic_and_requirements(
            request.topic,
            request.custom_requirements,
        )
        
        # Determine language code for Celery
        lang_code = request.language.value if hasattr(request.language, 'value') else request.language
        
        request_data = {
            "topic": clean_topic,
            "language": lang_code,
            "student_level": request.student_level,
            "duration_minutes": request.duration_minutes,
            "include_video": request.include_video,
            "include_exercises": request.include_exercises,
            "include_assessment": request.include_assessment,
            "voice_id": request.voice_id,
            "custom_requirements": merged_requirements,
        }
        if current_user:
            request_data["user_id"] = str(current_user.id)
        
        # Dispatch to Celery
        task = create_class_video_task.delay(request_data, job_id)
        
        return {
            "success": True,
            "job_id": task.id,
            "message": "Class creation started"
        }
    except Exception as e:
        print(f"❌ Error creating class: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/job-status/{job_id}")
async def get_job_status(job_id: str):
    """Check status of a Celery job and return result from Redis if completed"""
    from celery.result import AsyncResult
    from celery_app import celery_app, _redis_client
    
    task_result = AsyncResult(job_id, app=celery_app)
    
    # Check our direct Redis store for the final result payload
    result_json = _redis_client.get(f"job_result:{job_id}")
    if result_json:
        try:
            payload = json.loads(result_json)
        except Exception:
            payload = {"raw": str(result_json)}
        return {"status": "completed", "job_id": job_id, "result": payload}
        
    response = {
        "status": task_result.status.lower(),
        "job_id": job_id
    }
    
    if task_result.status == "SUCCESS":
        response["status"] = "completed"
        response["result"] = task_result.result
    elif task_result.status == "FAILURE":
        response["status"] = "failed"
        response["error"] = str(task_result.result)
        
    return response

@app.get("/job-stream/{job_id}")
async def stream_job_status(job_id: str):
    """Server-Sent Events (SSE) stream for job status updates"""
    async def event_generator():
        from celery.result import AsyncResult
        from celery_app import celery_app, _redis_client
        
        last_status = None
        while True:
            # First check if result is already in Redis
            result_json = _redis_client.get(f"job_result:{job_id}")
            if result_json:
                try:
                    result_payload = json.loads(result_json)
                except Exception:
                    result_payload = {"raw_result": result_json}
                # Send a keepalive comment first so the browser EventSource
                # registers the open connection before we deliver the final event.
                yield ": keepalive\n\n"
                await asyncio.sleep(0.05)
                yield f"data: {json.dumps({'status': 'completed', 'job_id': job_id, 'result': result_payload})}\n\n"
                break
                
            task_result = AsyncResult(job_id, app=celery_app)
            status = task_result.status.lower()
            
            if status != last_status:
                data = {"status": status, "job_id": job_id}
                if status == "failure":
                    data["error"] = str(task_result.result)
                    yield f"data: {json.dumps(data)}\n\n"
                    break
                if status == "success":
                    data["status"] = "completed"
                    data["result"] = task_result.result
                    yield f"data: {json.dumps(data)}\n\n"
                    break
                yield f"data: {json.dumps(data)}\n\n"
                last_status = status
                
            if status in ["failure", "revoked"]:
                break
                
            await asyncio.sleep(2)
            
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


from celery_app import (
    create_class_video_task, 
    transcript_to_lesson_task, 
    transcribe_audio_task, 
    ocr_image_task,
    celery_app
)

# ... (rest of imports remains same)

@app.post("/ingest/audio")
async def ingest_audio(
    file: UploadFile = File(...),
    language: str = Form(default="auto"),
    display_language: str = Form(default="en"),
    process: str = Form(default="false"),
    student_level: str = Form(default="beginner"),
    duration_minutes: int = Form(default=30),
    include_video: str = Form(default="true"),
    include_exercises: str = Form(default="true"),
    include_assessment: str = Form(default="true"),
    target_audience: str = Form(default="students"),
    difficulty_level: str = Form(default="intermediate"),
    voice_id: str = Form(default="anna"),
    custom_requirements: str = Form(default=""),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Transcribe user-uploaded audio (ASR) via background task."""
    try:
        # Validate file type
        allowed_types = {"audio/wav", "audio/mpeg", "audio/mp4", "audio/ogg",
                         "audio/flac", "audio/x-m4a", "audio/webm"}
        if file.content_type and file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {file.content_type}")

        suffix = os.path.splitext(file.filename or ".wav")[1] or ".wav"
        job_id = f"asr_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Save to shared volume for background worker access
        upload_dir = os.path.join(config.DATA_DIR, "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        tmp_path = os.path.join(upload_dir, f"{job_id}{suffix}")

        with open(tmp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Dispatch task to Celery
        if process.lower() != "true":
            # Just transcription
            print(f"📦 Dispatching transcription task: {job_id}")
            task = transcribe_audio_task.delay(tmp_path, language, job_id, target_language=display_language)
            return {
                "success": True,
                "status": "processing",
                "job_id": task.id,
                "message": "Transcription started in background.",
                "language": language,
            }
        else:
            # Full lesson generation from audio
            request_data = {
                "language": language,
                "student_level": student_level,
                "duration_minutes": duration_minutes,
                "include_video": include_video.lower() == "true",
                "include_exercises": include_exercises.lower() == "true",
                "include_assessment": include_assessment.lower() == "true",
                "target_audience": target_audience,
                "difficulty_level": difficulty_level,
                "voice_id": voice_id,
                "custom_requirements": custom_requirements or None,
            }
            if current_user:
                request_data["user_id"] = str(current_user.id)

            print(f"📦 Dispatching lesson generation task from audio: {job_id}")
            task = transcript_to_lesson_task.delay(tmp_path, request_data, job_id, is_file=True)
            return {
                "success": True,
                "status": "processing",
                "job_id": task.id,
                "message": "Lesson generation from audio started in background.",
                "language": language,
            }

    except Exception as e:
        print(f"❌ Error initiating audio ingest: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/image")
async def ingest_image(
    file: UploadFile = File(...),
    language: str = Form(default="zh"),
    display_language: str = Form(default="en"),
):
    """Extract text from image (OCR) via background task."""
    try:
        allowed_types = {"image/jpeg", "image/png", "image/bmp", "image/tiff",
                         "image/webp", "application/pdf"}
        if file.content_type and file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {file.content_type}")

        suffix = os.path.splitext(file.filename or ".jpg")[1] or ".jpg"
        job_id = f"ocr_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        # Save to shared volume
        upload_dir = os.path.join(config.DATA_DIR, "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        tmp_path = os.path.join(upload_dir, f"{job_id}{suffix}")

        with open(tmp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        print(f"📦 Dispatching OCR task: {job_id}")
        task = ocr_image_task.delay(tmp_path, language, job_id, target_language=display_language)

        return {
            "success": True,
            "status": "processing",
            "job_id": task.id,
            "message": "OCR text extraction started in background.",
            "language": language
        }
    except Exception as e:
        print(f"❌ Error initiating image ingest: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/media/{file_path:path}")
async def serve_media(file_path: str):
    """Serve generated media files"""
    from fastapi.responses import FileResponse
    for prefix in ("api/files/", "/api/files/"):
        if file_path.startswith(prefix):
            file_path = file_path[len(prefix):]
            break
    abs_path = os.path.normpath(os.path.join(config.DATA_DIR, file_path))
    if not abs_path.startswith(os.path.normpath(config.DATA_DIR)) or not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(abs_path)

@app.get("/results")
async def get_results_get(current_user: User = Depends(get_current_user)):
    """Get saved lessons for current user"""
    try:
        lessons = lesson_storage.get_lessons_by_user(str(current_user.id))
        total = len(lessons)
        return {"success": True, "results": lessons, "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
