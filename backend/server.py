"""
MentorMind Backend Server
Production API with bilingual support and clean organization
"""

import asyncio
import json
import logging
import os
import sys
import threading
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
import uvicorn
from dotenv import load_dotenv
import tempfile
import shutil
import re

# Per-IP rate limiting for no-auth POSTs (slowapi)
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Load environment variables
load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(levelname)s:%(name)s:%(message)s",
)
logger = logging.getLogger(__name__)


def _log_study_plan_chat(message: str, *args) -> None:
    rendered = message % args if args else message
    logger.info(rendered)
    print(f"🧭 {rendered}", flush=True)

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import core modules
from core.create_classes import ClassCreator, ClassCreationRequest, Language, ClassCreationResult
from core.modules.output import TTSSynthesizer
from core.modules.robust_video_generation import RobustVideoGenerationPipeline
from core.modules.video_scripting import VideoScriptGenerator
from celery.result import AsyncResult
from celery_app import create_class_video_task, transcript_to_lesson_task, transcribe_audio_task, celery_app, regenerate_board_segment_task
from database import LessonStorageSQL, init_database
from database import get_db
from database.models.user import User, UserProfile, UserMediaContext, SubjectProficiency
from auth import get_current_user, get_optional_user
from config import config
from core.asr import transcribe_with_local_model_result, get_asr_status, extract_text_with_paddleocr
from core.summarize import summarize_extracted_content
from core.modules.mentor import MentorAgent, MentorStage, MentorResponse
from services.api_client import api_client, get_language_instruction
from prompts.loader import render_prompt
from monitoring import track_performance, track_async_performance, monitor, celery_monitor
from core.diagnostic_confidence import calculate_rigorous_confidence
from core.rendering.layout_manager import ContentType

# Initialize PostgreSQL database (Strict)
print("🔧 Initializing PostgreSQL database...")
_global_lesson_storage = None
try:
    if init_database():
        print("✅ PostgreSQL database initialized successfully")
        _global_lesson_storage = LessonStorageSQL()
    else:
        print("⚠️  PostgreSQL database initialization failed")
except Exception as e:
    print(f"⚠️  PostgreSQL database initialization error: {e}")

# ... (rest of the code)


# If PostgreSQL fails, use a dummy storage to prevent crashes but log errors
if _global_lesson_storage is None:
    print("❌ PostgreSQL storage is required but not initialized. Server will have no persistence.")
    class DummyStorage:
        def __getattr__(self, name):
            def method(*args, **kwargs):
                print(f"❌ Storage operation '{name}' failed: PostgreSQL not connected")
                return None if name != "get_all_lessons" else ([], 0)
            return method
    _global_lesson_storage = DummyStorage()


def get_lesson_storage(db: Session = Depends(get_db)):
    """Dependency to get a LessonStorageSQL instance with an active session."""
    return LessonStorageSQL(session=db)


app = FastAPI(
    title="MentorMind API",
    description="Production backend API for MentorMind educational platform",
    version="2.0.0",
    # Ensure no response size limits for large video generation results
    response_model_exclude_unset=False,
    response_model_by_alias=False,
)

# Rate limiter — per-IP cap on the no-auth POST endpoints. Decorated routes
# below opt in via @limiter.limit("...").
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# Path-param validator: session_id must look like a UUID-ish lowercase hex
# string (allow dashes; permissive on length to accommodate existing keys).
_SESSION_ID_RE = re.compile(r"[0-9a-f-]{8,64}", re.I)


def _validate_session_id_or_400(session_id: str) -> None:
    if not isinstance(session_id, str) or not _SESSION_ID_RE.fullmatch(session_id):
        raise HTTPException(status_code=400, detail="Invalid session_id format")

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

# Add validation error handler
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Log validation errors for debugging"""
    print(f"❌ Validation error on {request.method} {request.url}: {exc.errors()}")
    body = await request.body()
    print(f"📋 Request body: {body.decode('utf-8') if body else 'empty'}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": body.decode('utf-8') if body else None}
    )

# Add auth error handler
@app.exception_handler(HTTPException)
async def auth_exception_handler(request: Request, exc: HTTPException):
    """Log authentication errors for debugging"""
    if exc.status_code == 401:
        auth_header = request.headers.get("authorization", "missing")
        print(f"🔐 Auth failed on {request.method} {request.url}")
        print(f"📋 Auth header: {auth_header[:50]}..." if len(auth_header) > 50 else f"📋 Auth header: {auth_header}")
        print(f"❌ Auth error: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
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

# ── Response Validation Utilities ────────────────────────────────────────────────

def ensure_complete_response(data: dict, context: str = "API") -> dict:
    """
    Utility to ensure API responses are complete and not truncated.
    Adds metadata to track response integrity.
    """
    try:
        # Convert to JSON and back to ensure serializability
        json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
        
        # Check for common truncation indicators
        truncation_indicators = ["...", "[truncated]", "lines truncated", "...truncated"]
        has_truncation = any(indicator in json_str for indicator in truncation_indicators)
        
        # Add integrity metadata
        response_metadata = {
            "context": context,
            "size_bytes": len(json_str.encode('utf-8')),
            "has_truncation_indicators": has_truncation,
            "integrity_check": "passed" if not has_truncation else "warning_truncation_detected",
            "timestamp": datetime.now().isoformat()
        }
        
        # Return data with metadata
        if isinstance(data, dict):
            data["_response_integrity"] = response_metadata
        
        return data
        
    except Exception as e:
        # If we can't serialize, return original data with error info
        if isinstance(data, dict):
            data["_response_integrity"] = {
                "error": str(e),
                "context": context,
                "status": "serialization_failed"
            }
        return data

# ── Mentor Schemas & Endpoints ────────────────────────────────────────────────

class MentorChatRequest(BaseModel):
    history: List[Dict[str, str]]
    stage: str = "opening"
    language: str = "en"

class MentorChatResponse(BaseModel):
    success: bool
    stage: str
    content: str
    thinking_process: Optional[str] = None
    proposed_syllabus: Optional[Dict[str, Any]] = None
    diagnostic_question: Optional[str] = None
    next_action_label: Optional[str] = None
    preferred_voice: Optional[str] = None

mentor_agent = MentorAgent()

@app.post("/mentor/chat", response_model=MentorChatResponse)
async def mentor_chat(req: MentorChatRequest, current_user: User = Depends(get_current_user)):
    """Main entry point for the conversational mentor."""
    try:
        current_stage = MentorStage(req.stage)
        response = await mentor_agent.get_next_response(
            history=req.history,
            current_stage=current_stage,
            language=req.language
        )
        return MentorChatResponse(
            success=True,
            stage=response.stage.value,
            content=response.content,
            thinking_process=response.thinking_process,
            proposed_syllabus=response.proposed_syllabus,
            diagnostic_question=response.diagnostic_question,
            next_action_label=response.next_action_label,
            preferred_voice=response.preferred_voice
        )
    except Exception as e:
        logger.error(f"Mentor chat failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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


class GenerationDebugRequest(BaseModel):
    topic: str
    content: str
    style: str = "general"
    language: str = "en"
    student_level: str = "beginner"
    target_audience: str = "students"
    custom_requirements: Optional[str] = None


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


@app.get("/users/me/proficiency")
def get_my_proficiency(
    current_user: User = Depends(get_current_user),
    db = Depends(get_db),
):
    """Return per-subject proficiency rollups for the current user (F5).

    Empty list for a new user with no rolled-up data — never 500.
    """
    rows = (
        db.query(SubjectProficiency)
        .filter(SubjectProficiency.user_id == current_user.id)
        .order_by(SubjectProficiency.subject)
        .all()
    )
    return {"items": [r.to_dict() for r in rows]}


@app.get("/users/me/knowledge-graph")
def get_my_knowledge_graph(
    language: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Return the user's accumulated personal knowledge graph.

    Built incrementally from each lesson via core.knowledge.extractor.
    Returns {nodes:[], edges:[]}; an empty graph for a new user is
    not an error — frontend shows an "complete a lesson to start" state."""
    try:
        from core.knowledge import get_user_graph
        return get_user_graph(str(current_user.id), language=language)
    except Exception as exc:
        # Never 500 on a read for an empty user — graceful empty graph.
        return {"nodes": [], "edges": [], "error": str(exc)}


# ── Board adaptive controls (F2 / F4) ────────────────────────────────────────

class ExplainDifferentlyRequest(BaseModel):
    session_id: str
    segment_index: int = Field(default=0, ge=0)
    style_hint: str = Field(default="simpler")  # visual | analogy | rigorous | simpler


class CheckpointResponseRequest(BaseModel):
    session_id: str
    element_id: str
    lesson_id: Optional[str] = None
    response: str = Field(default="green")  # green | yellow | red
    mcq_choice: Optional[int] = None
    subject: Optional[str] = None


_ALLOWED_STYLE_HINTS = {"visual", "analogy", "rigorous", "simpler"}
_ALLOWED_CHECKPOINT_RESPONSES = {"green", "yellow", "red"}


@app.post("/board/explain-differently")
def explain_differently(
    req: ExplainDifferentlyRequest,
    current_user: User = Depends(get_current_user),
):
    """F4 — re-request the current board segment with a different style hint.

    Dispatches the regeneration to Celery (orchestration queue). Debounce lock
    in the task prevents queueing multiple regens for the same session.
    """
    if req.style_hint not in _ALLOWED_STYLE_HINTS:
        raise HTTPException(
            status_code=422,
            detail=f"style_hint must be one of {sorted(_ALLOWED_STYLE_HINTS)}",
        )
    async_result = regenerate_board_segment_task.delay(
        session_id=req.session_id,
        segment_index=req.segment_index,
        style_hint=req.style_hint,
    )
    return {
        "success": True,
        "task_id": async_result.id,
        "session_id": req.session_id,
        "style_hint": req.style_hint,
    }


@app.post("/board/checkpoint-response")
def submit_checkpoint_response(
    req: CheckpointResponseRequest,
    current_user: User = Depends(get_current_user),
    db = Depends(get_db),
):
    """F2 — persist a learner's response to a mid-lesson comprehension checkpoint.

    Writes a StudentPerformance row with assessment_type='comprehension_check'.
    subject (optional, from the lesson metadata) enables per-subject rollup.
    """
    if req.response not in _ALLOWED_CHECKPOINT_RESPONSES:
        raise HTTPException(
            status_code=422,
            detail=f"response must be one of {sorted(_ALLOWED_CHECKPOINT_RESPONSES)}",
        )
    if not req.element_id:
        raise HTTPException(status_code=422, detail="element_id is required")

    from database.models.user import StudentPerformance

    score_map = {"green": 1.0, "yellow": 0.5, "red": 0.0}
    row = StudentPerformance(
        user_id=current_user.id,
        lesson_id=req.lesson_id,
        assessment_type="comprehension_check",
        score=score_map[req.response],
        confidence=score_map[req.response],
        subject=req.subject,
        performance_metadata={
            "session_id": req.session_id,
            "element_id": req.element_id,
            "mcq_choice": req.mcq_choice,
            "response": req.response,
        },
    )
    db.add(row)
    db.commit()
    return {"success": True, "response": req.response}


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
def get_my_lessons(
    current_user: User = Depends(get_current_user),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
):
    """Return lessons created by the current authenticated user."""
    return lesson_storage.get_lessons_by_user(str(current_user.id))


@app.get("/users/me/review-queue")
def get_my_review_queue(
    current_user: User = Depends(get_current_user),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
):
    """Return psychology-driven review prompts ordered by forgetting risk."""
    return {
        "success": True,
        "items": lesson_storage.get_review_queue(str(current_user.id)),
    }


@app.post("/users/me/notifications/sync")
def sync_my_notifications(
    current_user: User = Depends(get_current_user),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
):
    """Materialize proactive in-app notifications from forgetting-curve risk."""
    items = lesson_storage.sync_proactive_notifications(str(current_user.id))
    return {"success": True, "created": items, "count": len(items)}


@app.get("/users/me/notifications")
def get_my_notifications(
    unread_only: bool = False,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
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
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
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
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
):
    """Dismiss a proactive notification."""
    notification = lesson_storage.mark_notification_status(str(current_user.id), notification_id, "dismissed")
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True, "notification": notification}


@app.get("/users/me/lessons/{lesson_id}/state")
def get_my_lesson_state(
    lesson_id: str,
    current_user: User = Depends(get_current_user),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
):
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
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
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
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
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
    db: Session = Depends(get_db),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
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
    db: Session = Depends(get_db),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
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
    db: Session = Depends(get_db),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
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
    db: Session = Depends(get_db),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
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
    db: Session = Depends(get_db),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
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
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
):
    """List published lessons.  Pass ``?search=`` for full-text search."""
    if search:
        lessons = lesson_storage.search_lessons(
            search,
            language=language,
            student_level=student_level,
            limit=limit,
        )
        return {"success": True, "lessons": lessons, "total": len(lessons)}

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
    db: Session = Depends(get_db),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
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
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
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
def delete_all_my_lessons(
    current_user: User = Depends(get_current_user),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
):
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


# ── Invite-only auth (internal testing) ───────────────────────────────────

import bcrypt as _bcrypt

class InviteLoginPayload(BaseModel):
    invite_code: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    language: Optional[str] = "zh"


def _hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, hashed: str) -> bool:
    return _bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def _sign_jwt(user_id: str, username: str) -> str:
    import jwt as _jwt
    from datetime import datetime, timedelta
    _secret = os.getenv("BETTER_AUTH_SECRET", "")
    now = datetime.utcnow()
    return _jwt.encode(
        {"sub": user_id, "username": username, "iat": now, "exp": now + timedelta(days=30)},
        _secret,
        algorithm="HS256",
    )


@app.post("/auth/invite")
@limiter.limit("5/minute")
async def invite_login(request: Request):
    """Register or login with invite code + username + password.

    **Register**: `invite_code` + `username` + `password` → creates user
    **Login**: `username` + `password` (no invite_code) → returns JWT

    Rate-limited to prevent crawling (5 attempts per minute per IP).
    """
    try:
        body = await request.json()
        payload = InviteLoginPayload(**body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")

    lang = payload.language or "zh"
    username = (payload.username or "").strip()
    password = (payload.password or "").strip()
    invite_code = (payload.invite_code or "").strip()

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required")

    if len(username) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    from database.base import SessionLocal as _SL
    from database.models.invite_code import InviteCode
    import uuid as _uuid

    with _SL() as db:
        # ── Login mode: username + password, no invite code ──
        if not invite_code:
            user = db.query(User).filter(User.username == username).first()
            if not user:
                raise HTTPException(status_code=401, detail="User not found. Please register first.")
            if user.hashed_password == "invite_managed":
                raise HTTPException(status_code=401, detail="This account was created via invite-only mode and requires the same device/browser. Please re-register with a password.")
            if not _verify_password(password, user.hashed_password):
                raise HTTPException(status_code=401, detail="Incorrect password")
            if not user.is_active:
                raise HTTPException(status_code=403, detail="Account is inactive")

            token = _sign_jwt(user.id, user.username)
            return {
                "success": True,
                "token": token,
                "user": {"id": user.id, "username": user.username, "language": user.language_preference or lang},
            }

        # ── Register mode: invite_code + username + password ──
        invite_code = invite_code.upper()
        code_row = db.query(InviteCode).filter(InviteCode.code == invite_code).first()
        if not code_row:
            raise HTTPException(status_code=403, detail="Invalid invite code")
        if not code_row.is_available:
            raise HTTPException(status_code=403, detail="Invite code has reached its usage limit")

        # Check if username already taken
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            raise HTTPException(status_code=409, detail="Username already taken. Please choose another.")

        code_row.used_count += 1
        db.commit()

        user_id = str(_uuid.uuid4())
        user = User(
            id=user_id,
            email=f"{username}@mentormind.local",
            username=username,
            hashed_password=_hash_password(password),
            full_name=username,
            language_preference=lang,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = _sign_jwt(user.id, user.username)
        return {
            "success": True,
            "token": token,
            "user": {
                "id": user.id,
                "username": user.username,
                "language": lang,
            },
        }


# ── Monitoring & Metrics ─────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Basic health check for Docker healthcheck and load balancers"""
    return {"status": "ok"}

@app.get("/health/detailed")
@track_async_performance("health_check_detailed", "monitoring")
async def detailed_health_check():
    """Comprehensive health check with performance metrics"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "system_metrics": monitor.get_system_metrics(),
        "celery_status": celery_monitor.check_worker_status(),
        "performance_summary": monitor.get_performance_summary()
    }

@app.get("/metrics/performance")
@track_async_performance("get_performance_metrics", "monitoring")
async def get_performance_metrics(operation_type: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Get performance metrics summary"""
    return {
        "summary": monitor.get_performance_summary(operation_type),
        "celery_workers": celery_monitor.check_worker_status(),
        "system": monitor.get_system_metrics()
    }

@app.get("/metrics/lesson-generation")
@track_async_performance("get_lesson_generation_metrics", "monitoring")
async def get_lesson_generation_metrics(current_user: User = Depends(get_current_user)):
    """Get lesson generation specific metrics"""
    return {
        "lesson_operations": monitor.get_performance_summary("lesson"),
        "video_operations": monitor.get_performance_summary("video"), 
        "celery_health": celery_monitor.check_worker_status()
    }

@app.get("/job-status/{job_id}/detailed")
@track_async_performance("get_detailed_job_status", "monitoring")
async def get_detailed_job_status(job_id: str, current_user: User = Depends(get_current_user)):
    """Enhanced job status with performance metrics"""
    basic_status = await get_job_status(job_id)
    job_metrics = celery_monitor.get_job_metrics(job_id)
    
    return {
        **basic_status,
        "metrics": job_metrics,
        "celery_health": celery_monitor.check_worker_status()
    }

@app.get("/quality/analytics")
@track_async_performance("get_quality_analytics", "monitoring")
async def get_content_quality_analytics(timeframe_days: int = 7, current_user: User = Depends(get_current_user)):
    """Get AI-evaluated content quality analytics"""
    try:
        import redis
        redis_client = redis.Redis.from_url("redis://localhost:6379/1", decode_responses=True)
        # _, tracker = create_content_evaluator(api_client, redis_client)  # Temporarily disabled
        # 
        # analytics = await tracker.get_quality_analytics(timeframe_days)
        analytics = {"message": "Analytics temporarily unavailable"}
        return {
            "success": True,
            "analytics": analytics,
            "timeframe_days": timeframe_days
        }
    except Exception as e:
        return {
            "success": False, 
            "error": str(e),
            "message": "Quality analytics unavailable"
        }

@app.post("/quality/evaluate")
@track_async_performance("evaluate_content_quality", "monitoring")  
async def evaluate_content_quality(
    content: str,
    content_type: str,
    student_level: str = "intermediate",
    topic: str = "",
    learning_objectives: List[str] = None,
    current_user: User = Depends(get_current_user),
):
    """AI evaluation of educational content quality"""
    try:
        # evaluator, _ = create_content_evaluator(api_client)  # Temporarily disabled
        # 
        # content_type_enum = ContentType(content_type)
        # evaluation = await evaluator.evaluate_content(
        return {"message": "Content evaluation temporarily unavailable"}
        # Commented out evaluation code below:
        # evaluation = await evaluator.evaluate_content(
        #     content=content,
        #     content_type=content_type_enum,
        #     student_level=student_level,
        #     topic=topic,
        #     learning_objectives=learning_objectives or []
        # )
        # 
        # return {
        #     "success": True,
        #     "evaluation": {
        #         "overall_score": evaluation.overall_score,
        #         "quality_scores": [
        #             {
        #                 "dimension": score.dimension.value,
        #                 "score": score.score,
        #                 "reasoning": score.reasoning,
        #                 "suggestions": score.suggestions
        #             } for score in evaluation.quality_scores
        #         ],
        #         "strengths": evaluation.strengths,
        #         "weaknesses": evaluation.weaknesses,
        #         "improvement_suggestions": evaluation.improvement_suggestions,
        #         "confidence_level": evaluation.confidence_level,
        #         "assessment_quality": "high" if evaluation.confidence_level >= 0.8 else "medium" if evaluation.confidence_level >= 0.6 else "low"
        #     }
        # }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": "Content evaluation failed"
        }

@app.get("/lessons/{lesson_id}/quality")
@track_async_performance("get_lesson_quality", "monitoring")
async def get_lesson_quality(lesson_id: str, current_user: User = Depends(get_current_user)):
    """Get quality evaluation for a specific lesson"""
    try:
        import redis
        redis_client = redis.Redis.from_url("redis://localhost:6379/1", decode_responses=True)
        
        key = f"content_quality:{lesson_id}"
        evaluation_data = redis_client.hget(key, "evaluation")
        
        if evaluation_data:
            evaluation = json.loads(evaluation_data)
            return {
                "success": True,
                "lesson_id": lesson_id,
                "quality_evaluation": evaluation
            }
        else:
            return {
                "success": False,
                "message": "No quality evaluation found for this lesson"
            }
            
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
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
            {"id": "anna", "name": "灿灿 2.0 (Chinese/English)", "gender": "Female", "voice_type": "BV700_V2_streaming"},
            {"id": "bella", "name": "温柔淑女 (Soft Chinese)", "gender": "Female", "voice_type": "BV104_streaming"},
            {"id": "chris", "name": "擎苍 (Chinese/English)", "gender": "Male", "voice_type": "BV701_streaming"},
            {"id": "caleb", "name": "炀炀 (General Male)", "gender": "Male", "voice_type": "BV705_streaming"},
        ]
    }

@app.post("/analyze-topics")
async def analyze_topics(
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db = Depends(get_db),
):
    """Analyze student query to identify learning topics"""
    try:
        query = request.get("studentQuery", "")
        language = request.get("language", "zh")
        
        if not query:
            raise HTTPException(status_code=400, detail="studentQuery is required")
            
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

@app.post("/debug/generation/pipeline")
async def debug_generation_pipeline(request: GenerationDebugRequest, current_user: User = Depends(get_current_user)):
    """Inspect syllabus, storyboard, render-plan, and validation artifacts without rendering."""
    try:
        pipeline = RobustVideoGenerationPipeline()
        bundle = await pipeline.build_generation_bundle(
            topic=request.topic,
            content=request.content,
            style=request.style,
            language=request.language,
            student_level=request.student_level,
            target_audience=request.target_audience,
            custom_requirements=request.custom_requirements,
        )
        return {"success": True, "bundle": bundle}
    except Exception as e:
        print(f"❌ Error building generation pipeline debug bundle: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/debug/generation/video-script")
async def debug_generation_video_script(request: GenerationDebugRequest, current_user: User = Depends(get_current_user)):
    """Inspect the final validated renderer payload without kicking off a Celery job."""
    try:
        generator = VideoScriptGenerator()
        script = await generator.generate_script(
            topic=request.topic,
            content=request.content,
            style=request.style,
            language=request.language,
            student_level=request.student_level,
            target_audience=request.target_audience,
            custom_requirements=request.custom_requirements,
        )
        return {
            "success": True,
            "video_script": {
                "title": script.title,
                "total_duration": script.total_duration,
                "engine": script.engine,
                "scenes": [
                    {
                        "id": scene.id,
                        "duration": scene.duration,
                        "narration": scene.narration,
                        "action": scene.action,
                        "param": scene.param,
                        "visual_type": scene.visual_type,
                        "canvas_config": scene.canvas_config,
                    }
                    for scene in script.scenes
                ],
                "debug_artifacts": script.debug_artifacts,
            },
        }
    except Exception as e:
        print(f"❌ Error building generation video script debug payload: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/create-class")
@track_async_performance("create_class_request", "lesson")
async def create_class(
    request: ClassCreationRequest,
    current_user: User = Depends(get_current_user),
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
        duration_minutes = max(10, int(request.duration_minutes or 10))
        
        request_data = {
            "topic": clean_topic,
            "language": lang_code,
            "student_level": request.student_level,
            "duration_minutes": duration_minutes,
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
            # Report "failed" if the pipeline returned success=False
            job_status = "completed" if payload.get("success", True) else "failed"
            # Build response data
            response_data = {
                "status": job_status,
                "job_id": job_id,
                "result": payload,
                "_metadata": {
                    "response_size_bytes": len(result_json),
                    "response_complete": True,
                    "timestamp": datetime.now().isoformat()
                }
            }
            # Use utility function to ensure response integrity
            return ensure_complete_response(response_data, "job_status")
        except Exception as e:
            payload = {"raw": str(result_json), "parse_error": str(e)}
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
        keepalive_tick = 0
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

            # Relay PROGRESS milestones immediately (stage/percent/label from Celery meta)
            if status == "progress":
                meta = task_result.info or {}
                data = {
                    "status": "progress",
                    "job_id": job_id,
                    "stage": meta.get("stage", ""),
                    "percent": meta.get("percent", 0),
                    "label": meta.get("label", ""),
                }
                yield f"data: {json.dumps(data)}\n\n"
                await asyncio.sleep(2)
                continue

            if status != last_status:
                data = {"status": status, "job_id": job_id}
                if status == "failure":
                    data["error"] = str(task_result.result)
                    # Include stage from meta if available for frontend error display
                    meta = task_result.info or {}
                    if isinstance(meta, dict) and meta.get("stage"):
                        data["stage"] = meta["stage"]
                    yield f"data: {json.dumps(data)}\n\n"
                    break
                if status == "success":
                    data["status"] = "completed"
                    data["result"] = task_result.result
                    yield f"data: {json.dumps(data)}\n\n"
                    break
                yield f"data: {json.dumps(data)}\n\n"
                last_status = status
            else:
                keepalive_tick += 1
                if keepalive_tick >= 3:
                    # Prevent proxies/browsers from treating a long render as a dead chunked response.
                    yield ": keepalive\n\n"
                    keepalive_tick = 0

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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
async def get_results_get(
    current_user: User = Depends(get_current_user),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
):
    """Get saved lessons for current user"""
    try:
        lessons = lesson_storage.get_lessons_by_user(str(current_user.id))
        total = len(lessons)
        return {"success": True, "results": lessons, "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── E: Conversational Diagnostic Onboarding ───────────────────────────────────

class DiagnosticRequest(BaseModel):
    topic: str
    turn: int = Field(default=1, ge=1, le=6)
    student_response: str = ""
    history: List[Dict[str, str]] = Field(default_factory=list)
    language: str = "en"
    ai_testing: bool = False  # When True, AI will auto-generate beginner responses


@app.post("/users/me/diagnostic")
async def run_diagnostic_turn(
    req: DiagnosticRequest,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    3-turn conversational diagnostic that infers a student's true baseline.
    Turn 1: pose a short real problem.
    Turn 2: targeted follow-up based on their answer.
    Turn 3: synthesise and return inferred_level + profile_update.
    On completion the caller should PATCH /users/me/profile with inferred_profile_update.
    """
    # AI Testing Mode: Auto-generate beginner responses for testing
    if req.ai_testing and req.turn >= 2:
        # Simulate beginner-level responses for testing
        beginner_responses = [
            "I'm not sure about this one, could you explain it differently?",
            "This seems complicated, can we start with something easier?", 
            "I think I understand the basics but I'm confused about the details",
            "Can you give me a hint? I'm struggling with this concept"
        ]
        
        # Auto-complete after 2 turns with beginner level
        return {
            "success": True,
            "question": "Great! I can see you're at a beginner level. Let me generate your personalized lesson now!",
            "stage": "complete",
            "inferred_level": "beginner", 
            "inferred_profile_update": {
                "current_challenges": f"Needs foundational development in {req.topic}",
                "grade_level": None
            },
            "generate_lesson": True,
            "ai_testing": True
        }
    
    # Rigorous adaptive completion based on psychometric confidence analysis
    if req.turn >= 2:  # Start checking confidence after turn 2
        # Determine domain from topic for domain-specific analysis
        domain = "math" if any(word in req.topic.lower() for word in 
                              ["calculus", "algebra", "geometry", "statistics", "math"]) else "science"
        
        confidence = calculate_rigorous_confidence(req.history, req.turn, domain)
        
        # Check for explicit user completion request
        user_wants_completion = any(phrase in req.student_response.lower() for phrase in 
                                  ["generate", "video", "lesson", "start", "done", "finished", "enough"])
        
        # Advanced decision logic based on psychometric measures
        bayesian_conf = confidence.bayesian_confidence
        uncertainty = confidence.confidence_interval[1] - confidence.confidence_interval[0]
        consistency = 1 - confidence.consistency_entropy  # Convert entropy to consistency score
        
        should_complete = (
            confidence.recommended_action.startswith("complete") or
            user_wants_completion or
            (req.turn >= 3 and bayesian_conf >= 0.7 and uncertainty <= 0.4) or
            (req.turn >= 4 and consistency >= 0.6) or
            req.turn >= 5  # Statistical maximum for reliable assessment
        )
        
        if should_complete:
            # Bayesian skill level inference
            if bayesian_conf >= 0.8 and confidence.domain_alignment >= 0.6:
                level = "advanced"
                challenges = f"Shows strong conceptual understanding of {req.topic}"
            elif bayesian_conf >= 0.5 and consistency >= 0.5:
                level = "intermediate"
                challenges = f"Demonstrates partial mastery of {req.topic}"
            else:
                level = "beginner"
                challenges = f"Needs foundational development in {req.topic}"

            # F1/T8 — persist proficiency level + mark diagnostic complete
            try:
                profile = _get_or_create_user_profile(db, str(current_user.id))
                profile.proficiency_level = level
                profile.diagnostic_completed = True
                profile.diagnostic_results = {
                    "inferred_level": level,
                    "challenges": challenges,
                    "turns_used": req.turn,
                    "bayesian_confidence": bayesian_conf,
                    "source": "rigorous",
                }
                profile.onboarding_completed = True
                db.add(profile)
                db.commit()
            except Exception as exc:
                logger.warning("Failed to persist diagnostic completion (rigorous): %s", exc)
                db.rollback()

            return {
                "success": True,
                "question": f"Great! I can see you're at a {level} level. Let me generate your personalized lesson now!",
                "stage": "complete",
                "inferred_level": level,
                "inferred_profile_update": {
                    "current_challenges": challenges,
                    "grade_level": None
                },
                "generate_lesson": True  # Signal to immediately start lesson generation
            }
    language_instruction = get_language_instruction(req.language)
    prompt = render_prompt(
        "learning/diagnostic_prompt",
        language_instruction=language_instruction,
        topic=req.topic,
        turn=req.turn,
        student_response=req.student_response or "(no response yet)",
        history_json=json.dumps(req.history, ensure_ascii=False),
    )
    fallback = {
        "question": (
            f"Before we start, quick check: can you tell me what you already know about {req.topic}?"
            if req.language != "zh"
            else f"在开始之前，你能简单说说你对 {req.topic} 的了解吗？"
        ),
        "stage": "problem" if req.turn == 1 else ("followup" if req.turn == 2 else "complete"),
        "inferred_level": "beginner" if req.turn == 3 else None,
        "inferred_profile_update": {"current_challenges": f"First exposure to {req.topic}", "grade_level": None} if req.turn == 3 else None,
    }
    try:
        response = await api_client.deepseek.chat_completion(
            messages=[
                {"role": "system", "content": "Return strict JSON only. No markdown fences."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=800,
        )
        if not response.success:
            return {"success": True, **fallback}

        raw = response.data["choices"][0]["message"]["content"].strip()
        # Strip markdown fences if present
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0]
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0]
        parsed = json.loads(raw.strip())

        # On completion, auto-patch the user profile with inferred data
        if parsed.get("stage") == "complete" and parsed.get("inferred_profile_update"):
            update = parsed["inferred_profile_update"]
            profile = _get_or_create_user_profile(db, str(current_user.id))
            if update.get("current_challenges"):
                profile.current_challenges = update["current_challenges"]
            if update.get("grade_level"):
                profile.grade_level = update["grade_level"]
            # F1/T8 — persist proficiency level + diagnostic results
            if parsed.get("inferred_level"):
                profile.proficiency_level = parsed["inferred_level"]
            profile.diagnostic_completed = True
            profile.diagnostic_results = {
                "inferred_level": parsed.get("inferred_level"),
                "inferred_profile_update": update,
                "turns_used": req.turn,
                "source": "llm",
            }
            # Mark onboarding completed
            profile.onboarding_completed = True
            db.add(profile)
            db.commit()

        return {"success": True, **parsed}

    except Exception as exc:
        logger.warning("Diagnostic turn failed: %s", exc)
        return {"success": True, **fallback}


# ── F: Video Engagement Tracking ──────────────────────────────────────────────

class VideoEngagementRequest(BaseModel):
    watch_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    quiz_completed: bool = False


@app.post("/users/me/lessons/{lesson_id}/video-engagement")
def record_video_engagement(
    lesson_id: str,
    req: VideoEngagementRequest,
    current_user: User = Depends(get_current_user),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
):
    """
    Record how far a student watched a lesson video and whether they completed any quiz.
    Upserts UserLesson progress_percentage and is_completed.
    """
    is_completed = req.quiz_completed or req.watch_percentage >= 90.0
    lesson_storage.upsert_user_lesson_progress(
        str(current_user.id),
        lesson_id,
        progress_percentage=req.watch_percentage,
        is_completed=is_completed,
    )
    return {"success": True, "watch_percentage": req.watch_percentage, "is_completed": is_completed}


@app.get("/admin/metrics")
def get_admin_metrics(
    db=Depends(get_db),
):
    """
    Return comprehensive video generation metrics for all lessons.
    Shows creation times, quality scores, costs, and performance data.
    """
    try:
        from database.models.lesson import Lesson
        from database.models.user import UserLesson
        from sqlalchemy import func
        
        # Get all lessons with basic info first
        lessons_query = db.query(Lesson).order_by(Lesson.created_at.desc()).limit(100).all()
        
        lessons = []
        for lesson in lessons_query:
            # Get basic engagement stats
            total_views = db.query(func.count(UserLesson.id)).filter(UserLesson.lesson_id == lesson.id).scalar() or 0
            
            # Get average watch percentage (handle None values)
            avg_watch_result = db.query(func.avg(UserLesson.progress_percentage)).filter(
                UserLesson.lesson_id == lesson.id,
                UserLesson.progress_percentage.isnot(None)
            ).scalar()
            avg_watch_pct = float(avg_watch_result) if avg_watch_result else 0.0
            
            # Get completions count
            completions = db.query(func.count(UserLesson.id)).filter(
                UserLesson.lesson_id == lesson.id, 
                UserLesson.is_completed == True
            ).scalar() or 0
            
            # Get AI insights safely
            ai_insights = lesson.ai_insights if lesson.ai_insights else {}
            
            # Extract timing data from ai_insights
            generation_time = None
            script_time = None  
            render_time = None
            tts_time = None
            
            if isinstance(ai_insights, dict):
                generation_time = ai_insights.get('total_generation_time') or ai_insights.get('generation_duration')
                script_time = ai_insights.get('script_generation_time')
                render_time = ai_insights.get('render_time') or ai_insights.get('manim_render_time') 
                tts_time = ai_insights.get('tts_time')
                
            lessons.append({
                "id": str(lesson.id),
                "title": lesson.title or "Untitled",
                "topic": lesson.topic or "No topic",
                "language": lesson.language or "en",
                "student_level": lesson.student_level or "beginner", 
                "quality_score": lesson.quality_score or 0.0,
                "cost_usd": lesson.cost_usd or 0.0,
                "duration_minutes": lesson.duration_minutes or 0,
                "created_at": lesson.created_at.isoformat() if lesson.created_at else None,
                "updated_at": lesson.updated_at.isoformat() if lesson.updated_at else None,
                "total_views": total_views,
                "avg_watch_percentage": round(avg_watch_pct, 1),
                "completions": completions,
                "video_url": ai_insights.get("video_url"),
                "audio_url": ai_insights.get("audio_url"),
                "generation_metrics": {
                    "total_time": generation_time,
                    "script_time": script_time,
                    "render_time": render_time,
                    "tts_time": tts_time,
                },
                "ai_insights": ai_insights
            })
        
        # Calculate summary statistics
        total_lessons = len(lessons)
        total_cost = sum(lesson.get('cost_usd', 0) for lesson in lessons)
        avg_quality = sum(lesson.get('quality_score', 0) for lesson in lessons) / max(total_lessons, 1)
        total_views_sum = sum(lesson.get('total_views', 0) for lesson in lessons)
        
        return {
            "success": True,
            "summary": {
                "total_lessons": total_lessons,
                "total_cost_usd": round(total_cost, 2),
                "avg_quality_score": round(avg_quality, 2),
                "total_views": total_views_sum,
            },
            "lessons": lessons
        }
    
    except Exception as e:
        import traceback
        print(f"Admin metrics error: {e}")
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "summary": {
                "total_lessons": 0,
                "total_cost_usd": 0.0,
                "avg_quality_score": 0.0,
                "total_views": 0,
            },
            "lessons": []
        }


@app.get("/admin/ops/queues")
def get_ops_queue_depths(current_user: User = Depends(get_current_user)):
    """Return lightweight queue and active-session visibility for VPS ops."""
    redis_client = _redis_for_limits()
    queue_names = ["orchestration", "rendering", "heavy_ml"]
    queues = []
    for name in queue_names:
        depth = None
        error = None
        if redis_client is not None:
            try:
                depth = int(redis_client.llen(name))
            except Exception as exc:
                error = str(exc)
        else:
            error = "redis_unavailable"
        queues.append({"name": name, "depth": depth, "error": error})

    by_user: Dict[str, int] = {}
    for session in _board_sessions.values():
        uid = str(session.get("user_id") or "anonymous")
        by_user[uid] = by_user.get(uid, 0) + 1

    return {
        "success": True,
        "queues": queues,
        "active_board_sessions": len(_board_sessions),
        "max_board_sessions": MAX_BOARD_SESSIONS,
        "max_sessions_per_user": MAX_SESSIONS_PER_USER,
        "active_board_sessions_by_user": by_user,
    }


@app.get("/users/me/analytics")
def get_my_analytics(
    current_user: User = Depends(get_current_user),
    lesson_storage: LessonStorageSQL = Depends(get_lesson_storage),
    db=Depends(get_db),
):
    """
    Return real engagement analytics for the current user derived from:
    - UserLesson (progress_percentage, is_completed)
    - StudentPerformance (scores by assessment type)
    - MemoryReview (review completion rate)
    """
    from database.models.user import UserLesson, StudentPerformance, MemoryReview
    from sqlalchemy import func as sqlfunc

    user_id = str(current_user.id)

    # ── Lesson counts & watch stats ──────────────────────────────────────
    lesson_rows = (
        db.query(UserLesson)
        .filter(UserLesson.user_id == user_id)
        .all()
    )
    total_lessons = len(lesson_rows)
    completed_lessons = sum(1 for ul in lesson_rows if ul.is_completed)
    watch_percentages = [ul.progress_percentage for ul in lesson_rows if ul.progress_percentage is not None]
    avg_watch_percentage = round(sum(watch_percentages) / len(watch_percentages), 1) if watch_percentages else 0.0
    high_engagement = sum(1 for p in watch_percentages if p >= 80.0)

    # ── Quiz / quiz completion rate ───────────────────────────────────────
    perf_rows = (
        db.query(StudentPerformance)
        .filter(StudentPerformance.user_id == user_id)
        .all()
    )
    quiz_lesson_ids = {str(p.lesson_id) for p in perf_rows}
    completed_lesson_ids = {str(ul.lesson_id) for ul in lesson_rows if ul.is_completed}
    quiz_completion_rate = (
        round(len(quiz_lesson_ids & completed_lesson_ids) / max(total_lessons, 1) * 100, 1)
    )

    avg_score = (
        round(sum(p.score for p in perf_rows) / len(perf_rows) * 100, 1)
        if perf_rows else 0.0
    )

    # ── Memory review stats ───────────────────────────────────────────────
    review_rows = (
        db.query(MemoryReview)
        .filter(MemoryReview.user_id == user_id)
        .all()
    )
    completed_reviews = sum(1 for r in review_rows if r.status == "completed")
    review_completion_rate = (
        round(completed_reviews / len(review_rows) * 100, 1) if review_rows else 0.0
    )

    # ── Daily lesson volume (last 7 days) ─────────────────────────────────
    from datetime import timedelta, timezone
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    daily_map: Dict[str, int] = {}
    for ul in lesson_rows:
        if ul.created_at and ul.created_at >= seven_days_ago:
            day = ul.created_at.strftime("%Y-%m-%d")
            daily_map[day] = daily_map.get(day, 0) + 1

    lessons_by_day = [
        {"date": day, "count": cnt}
        for day, cnt in sorted(daily_map.items())
    ]

    return {
        "success": True,
        "total_lessons": total_lessons,
        "completed_lessons": completed_lessons,
        "avg_watch_percentage": avg_watch_percentage,
        "high_engagement_lessons": high_engagement,
        "quiz_completion_rate": quiz_completion_rate,
        "avg_score": avg_score,
        "review_completion_rate": review_completion_rate,
        "lessons_by_day": lessons_by_day,
    }


# ── G: Stripe Billing Stub ────────────────────────────────────────────────────

STRIPE_PRICE_IDS = {
    "basic":      os.getenv("STRIPE_PRICE_BASIC",      "price_basic_placeholder"),
    "pro":        os.getenv("STRIPE_PRICE_PRO",        "price_pro_placeholder"),
    "enterprise": os.getenv("STRIPE_PRICE_ENTERPRISE", "price_enterprise_placeholder"),
}


class CheckoutSessionRequest(BaseModel):
    plan: str  # "basic" | "pro" | "enterprise"
    success_url: str = "http://localhost:3000/settings?checkout=success"
    cancel_url: str = "http://localhost:3000/settings?checkout=cancelled"


@app.post("/billing/create-checkout-session")
async def create_checkout_session(
    req: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Create a Stripe Checkout session for plan upgrade.
    Requires STRIPE_SECRET_KEY env var — returns a stub URL if not set.
    """
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    price_id = STRIPE_PRICE_IDS.get(req.plan)
    if not price_id or "placeholder" in price_id:
        # Graceful stub — no real Stripe key configured yet
        return {
            "success": True,
            "stub": True,
            "checkout_url": f"{req.success_url}&plan={req.plan}&stub=true",
            "message": "Stripe not yet configured. Set STRIPE_SECRET_KEY to enable live checkout.",
        }

    try:
        import stripe  # type: ignore[import]
        stripe.api_key = stripe_key
        session = stripe.checkout.Session.create(
            customer_email=current_user.email,
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=req.success_url,
            cancel_url=req.cancel_url,
            metadata={"user_id": str(current_user.id), "plan": req.plan},
        )
        return {"success": True, "stub": False, "checkout_url": session.url}
    except Exception as exc:
        logger.error("Stripe checkout session creation failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Stripe error: {exc}")


@app.post("/billing/webhook")
async def stripe_webhook(request: Request):
    """
    Receive Stripe webhook events and update user subscription tier on checkout completion.
    Requires STRIPE_WEBHOOK_SECRET env var to verify signatures.
    """
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not stripe_key or not webhook_secret:
        logger.warning("Stripe webhook received but STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET not set.")
        return {"received": True}

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        import stripe  # type: ignore[import]
        stripe.api_key = stripe_key
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except Exception as exc:
        logger.error("Stripe webhook verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = (session.get("metadata") or {}).get("user_id")
        plan = (session.get("metadata") or {}).get("plan", "pro")
        if user_id:
            from database import get_db as _get_db
            db = next(_get_db())
            try:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    user.subscription_tier = plan
                    db.commit()
                    logger.info("Updated subscription for user %s to plan %s", user_id, plan)
            finally:
                db.close()

    return {"received": True}


# ── Study Plan Endpoints ─────────────────────────────────────────────────────

from core.agents.study_plan_agent import StudyPlanAgent, PlanStage, PlanResponse
from core.agents.subject_detector import SubjectDetector
from core.content.gaokao_tutor import GaokaoTutor
from core.content.cache_keys import build_unit_content_cache_key
from core.usage_limits import consume_quota
from database.models.study_plan import StudyPlan, StudyPlanUnit, GaokaoSession
from database.models.board_session import BoardSession
from database.models.telemetry import TelemetryEvent, ALLOWED_EVENT_TYPES
from database.models.survey_response import SurveyResponse
from core.board.storage import (
    save_board_state as _board_save_state,
    load_board_state as _board_load_state,
    list_user_board_sessions as _board_list_user_sessions,
)

study_plan_agent = StudyPlanAgent()
STUDY_PLAN_DELETE_RETENTION_DAYS = 30


def _active_study_plan_query(db: Session, user_id: str):
    return (
        db.query(StudyPlan)
        .filter(StudyPlan.user_id == user_id)
        .filter(StudyPlan.status.notin_(["archived", "deleted"]))
    )


def _purge_expired_deleted_study_plans(db: Session) -> int:
    now = datetime.utcnow()
    deleted = (
        db.query(StudyPlan)
        .filter(StudyPlan.status == "deleted")
        .filter(StudyPlan.purge_after.isnot(None))
        .filter(StudyPlan.purge_after <= now)
        .delete(synchronize_session=False)
    )
    if deleted:
        db.commit()
    return int(deleted or 0)


def _purge_expired_deleted_study_plan_units(db: Session) -> int:
    now = datetime.utcnow()
    deleted = (
        db.query(StudyPlanUnit)
        .filter(StudyPlanUnit.content_status == "deleted")
        .filter(StudyPlanUnit.purge_after.isnot(None))
        .filter(StudyPlanUnit.purge_after <= now)
        .delete(synchronize_session=False)
    )
    if deleted:
        db.commit()
    return int(deleted or 0)


def _soft_delete_study_plan(plan: StudyPlan) -> None:
    now = datetime.utcnow()
    plan.status = "deleted"
    plan.deleted_at = now
    plan.purge_after = now + timedelta(days=STUDY_PLAN_DELETE_RETENTION_DAYS)


def _soft_delete_study_plan_unit(unit: StudyPlanUnit) -> None:
    now = datetime.utcnow()
    unit.content_status = "deleted"
    unit.deleted_at = now
    unit.purge_after = now + timedelta(days=STUDY_PLAN_DELETE_RETENTION_DAYS)


def _active_study_plan_unit_query(db: Session, plan_id: str):
    return (
        db.query(StudyPlanUnit)
        .filter(StudyPlanUnit.plan_id == plan_id)
        .filter(StudyPlanUnit.content_status != "deleted")
    )


def _sync_study_plan_progress(db: Session, plan: StudyPlan) -> None:
    total = _active_study_plan_unit_query(db, str(plan.id)).count()
    completed = (
        _active_study_plan_unit_query(db, str(plan.id))
        .filter(StudyPlanUnit.is_completed.is_(True))
        .count()
    )
    plan.total_units = total
    plan.progress_percentage = round((completed / total) * 100, 1) if total else 0.0
    if total and completed >= total:
        plan.status = "completed"
    elif plan.status == "completed":
        plan.status = "active"


subject_detector = SubjectDetector()
gaokao_tutor = GaokaoTutor()


class StudyPlanChatRequest(BaseModel):
    history: List[Dict[str, str]]
    stage: str = "opening"
    language: str = "en"
    request_id: Optional[str] = None
    # Frontend sends the user-selected subject/framework from the framework
    # picker; honour these as authoritative and only fall back to detection
    # when they are missing.
    subject: Optional[str] = None
    framework: Optional[str] = None


class StudyPlanChatResponse(BaseModel):
    success: bool
    stage: str
    content: str
    response_source: Optional[str] = None
    thinking_process: Optional[str] = None
    proposed_plan: Optional[Dict[str, Any]] = None
    diagnostic_question: Optional[str] = None
    next_action_label: Optional[str] = None
    detected_subject: Optional[Dict[str, Any]] = None
    options: Optional[List[str]] = None
    allow_free_text: bool = True


class StudyPlanCreateRequest(BaseModel):
    plan_data: Dict[str, Any]
    language: str = "zh"
    request_id: Optional[str] = None


class StudyPlanBulkDeleteRequest(BaseModel):
    plan_ids: List[str] = Field(default_factory=list)
    delete_all: bool = False


class UnitGenerateRequest(BaseModel):
    content_types: List[str] = Field(default_factory=lambda: ["study_guide", "quiz", "flashcards"])


EXPENSIVE_ACTION_LIMITS = {
    "study_plan_chat": (120, 3600),
    "unit_generate": (20, 24 * 3600),
    "board_lesson": (30, 24 * 3600),
}

STUDY_PLAN_HISTORY_MAX_MESSAGES = int(os.getenv("STUDY_PLAN_HISTORY_MAX_MESSAGES", "24"))
STUDY_PLAN_HISTORY_MAX_CONTENT_CHARS = int(os.getenv("STUDY_PLAN_HISTORY_MAX_CONTENT_CHARS", "2000"))


def _sanitize_study_plan_history(history: List[Dict[str, str]]) -> List[Dict[str, str]]:
    sanitized: List[Dict[str, str]] = []
    for message in (history or [])[-STUDY_PLAN_HISTORY_MAX_MESSAGES:]:
        role = message.get("role")
        if role not in {"user", "assistant", "system"}:
            continue
        content = str(message.get("content", ""))[:STUDY_PLAN_HISTORY_MAX_CONTENT_CHARS].strip()
        if content:
            sanitized.append({"role": role, "content": content})
    return sanitized


def _redis_for_limits():
    try:
        from celery_app import _redis_client
        return _redis_client
    except Exception:
        return None


def _enforce_quota(user: User, action: str) -> None:
    limit, window = EXPENSIVE_ACTION_LIMITS[action]
    result = consume_quota(
        _redis_for_limits(),
        user_id=str(user.id),
        action=action,
        limit=limit,
        window_seconds=window,
    )
    if not result.allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "quota_exceeded",
                "action": action,
                "limit": result.limit,
                "used": result.used,
                "retry_after_seconds": result.reset_seconds,
            },
        )


class GaokaoChatRequest(BaseModel):
    session_id: Optional[str] = None
    plan_id: Optional[str] = None
    message: str = Field(min_length=1)
    subject: str = "math"
    topic_focus: Optional[str] = None
    language: str = "zh"


class GaokaoSavePlanRequest(BaseModel):
    title: str = Field(min_length=1)
    subject: str = "math"
    description: str = ""
    session_id: Optional[str] = None
    diagnostic_context: Dict[str, Any] = Field(default_factory=dict)
    language: str = "zh"


class DetectSubjectRequest(BaseModel):
    text: str = Field(min_length=1)
    language: str = "en"


@app.post("/detect-subject")
async def detect_subject(req: DetectSubjectRequest, current_user: User = Depends(get_current_user)):
    """Detect STEM subject, framework, and difficulty from user text."""
    try:
        detection = await subject_detector.detect(req.text, req.language)
        return {
            "success": True,
            "subject": detection.subject,
            "framework": detection.framework,
            "difficulty": detection.difficulty,
            "topics": detection.topics,
            "confidence": detection.confidence,
        }
    except Exception as e:
        logger.error(f"Subject detection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/study-plan/chat", response_model=StudyPlanChatResponse)
async def study_plan_chat(req: StudyPlanChatRequest, current_user: User = Depends(get_current_user)):
    """Conversational study plan creation (diagnostic → plan review → locked)."""
    started_at = time.perf_counter()
    sanitized_history = _sanitize_study_plan_history(req.history)
    last_user = next(
        (m.get("content", "") for m in reversed(sanitized_history) if m.get("role") == "user"),
        "",
    )
    try:
        _log_study_plan_chat(
            "study_plan_chat start request_id=%s user=%s stage=%s subject=%s framework=%s history_len=%s last_user=%r",
            req.request_id,
            current_user.id,
            req.stage,
            req.subject,
            req.framework,
            len(sanitized_history),
            last_user[:120],
        )
        _enforce_quota(current_user, "study_plan_chat")
        current_stage = PlanStage(req.stage)
        response = await asyncio.wait_for(
            study_plan_agent.get_next_response(
                history=sanitized_history,
                current_stage=current_stage,
                language=req.language,
                preselected_subject=req.subject,
                preselected_framework=req.framework,
            ),
            timeout=float(os.getenv("STUDY_PLAN_CHAT_BACKEND_TIMEOUT_SECONDS", "45")),
        )
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        _log_study_plan_chat(
            "study_plan_chat done request_id=%s user=%s stage=%s response_stage=%s source=%s elapsed_ms=%s options=%s proposed_plan=%s",
            req.request_id,
            current_user.id,
            req.stage,
            response.stage.value,
            response.response_source,
            elapsed_ms,
            bool(response.options),
            bool(response.proposed_plan),
        )
        return StudyPlanChatResponse(
            success=True,
            stage=response.stage.value,
            content=response.content,
            response_source=response.response_source,
            thinking_process=response.thinking_process,
            proposed_plan=response.proposed_plan,
            diagnostic_question=response.diagnostic_question,
            next_action_label=response.next_action_label,
            detected_subject=response.detected_subject,
            options=response.options,
            allow_free_text=response.allow_free_text,
        )
    except asyncio.TimeoutError:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.warning(
            "study_plan_chat timeout request_id=%s user=%s stage=%s subject=%s framework=%s elapsed_ms=%s last_user=%r",
            req.request_id,
            current_user.id,
            req.stage,
            req.subject,
            req.framework,
            elapsed_ms,
            last_user[:120],
        )
        raise HTTPException(
            status_code=504,
            detail="Study-plan chat took too long. Please retry once.",
        )
    except HTTPException:
        raise
    except Exception as e:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.error(
            "study_plan_chat failed request_id=%s user=%s stage=%s subject=%s framework=%s elapsed_ms=%s error=%s",
            req.request_id,
            current_user.id,
            req.stage,
            req.subject,
            req.framework,
            elapsed_ms,
            e,
        )
        raise HTTPException(status_code=500, detail=str(e))


class AskAIRequest(BaseModel):
    highlighted_text: Optional[str] = None
    image_base64: Optional[str] = None
    question: str
    subject: Optional[str] = None
    unit_title: Optional[str] = None
    language: str = "en"

class AskAIResponse(BaseModel):
    success: bool
    answer: str
    error: Optional[str] = None


@app.post("/study-plan/ask-ai", response_model=AskAIResponse)
async def study_plan_ask_ai(
    req: AskAIRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Answer a question about highlighted text or a screenshot from study content."""
    try:
        language_instruction = get_language_instruction(req.language)
        context_parts = []
        if req.subject:
            context_parts.append(f"Subject: {req.subject}")
        if req.unit_title:
            context_parts.append(f"Unit: {req.unit_title}")
        context_str = ". ".join(context_parts)

        if req.image_base64:
            # Extract text from image using local PaddleOCR, then answer with DeepSeek
            import base64, tempfile
            image_base64 = req.image_base64
            if image_base64.startswith("data:"):
                # Strip data URI prefix (e.g. "data:image/png;base64,")
                image_base64 = image_base64.split(",", 1)[1]

            try:
                image_bytes = base64.b64decode(image_base64)
            except Exception:
                return AskAIResponse(success=False, answer="", error="Invalid image data")

            # Try PaddleOCR server first, fall back to local model
            ocr_text = ""
            paddle_endpoint = os.getenv("PADDLE_OCR_ENDPOINT", "http://localhost:8866")
            try:
                import aiohttp
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{paddle_endpoint}/ocr",
                        json={"image": image_base64},
                        timeout=aiohttp.ClientTimeout(total=30)
                    ) as resp:
                        if resp.status == 200:
                            ocr_data = await resp.json()
                            ocr_text = ocr_data.get("text", "")
            except Exception as e:
                logger.warning(f"PaddleOCR server unavailable, trying local model: {e}")

            # Fall back to local PaddleOCR model if server didn't work
            if not ocr_text:
                try:
                    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                        tmp.write(image_bytes)
                        tmp_path = tmp.name
                    ocr_result = await asyncio.get_event_loop().run_in_executor(
                        None, extract_text_with_paddleocr, tmp_path
                    )
                    ocr_text = ocr_result.get("text", "")
                    os.unlink(tmp_path)
                except Exception as e:
                    logger.error(f"Local PaddleOCR failed: {e}")

            if not ocr_text.strip():
                return AskAIResponse(success=False, answer="", error="Could not extract text from the image. Please try highlighting text instead.")

            # Use DeepSeek to answer based on OCR-extracted text
            question = req.question or "Explain what is shown in this image."
            messages = [
                {"role": "system", "content": f"You are a helpful study assistant. {context_str}. {language_instruction} The student has taken a screenshot of study material. The text extracted from the screenshot is provided below. Give a concise, clear answer (2-4 sentences max). Be precise and educational."},
                {"role": "user", "content": f"Text from screenshot:\n\"{ocr_text}\"\n\nQuestion: {question}"}
            ]
            response = await api_client.deepseek.chat_completion(
                messages=messages,
                temperature=0.3,
                max_tokens=512
            )
            if response.success and response.data:
                answer = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
                # Save media context for logged-in users
                if current_user and image_bytes:
                    try:
                        from core.user_storage import save_media_file, check_storage_quota
                        within_quota, _, _ = check_storage_quota(
                            current_user.id, current_user.subscription_tier, len(image_bytes)
                        )
                        if within_quota:
                            rel_path, file_size = save_media_file(current_user.id, image_bytes, ".png")
                            media = UserMediaContext(
                                user_id=current_user.id,
                                media_type="image",
                                file_path=rel_path,
                                file_size_bytes=file_size,
                                extracted_text=ocr_text,
                                ai_answer=answer,
                                question=question,
                                context_metadata={"subject": req.subject, "unit_title": req.unit_title},
                            )
                            db.add(media)
                            db.commit()
                    except Exception as e:
                        logger.warning(f"Failed to save media context (non-fatal): {e}")
                        db.rollback()
                return AskAIResponse(success=True, answer=answer)
            else:
                return AskAIResponse(success=False, answer="", error=response.error or "AI service unavailable")

        elif req.highlighted_text:
            # Use DeepSeek for text-based Q&A
            messages = [
                {"role": "system", "content": f"You are a helpful study assistant. {context_str}. {language_instruction} The student has highlighted a passage and has a question. Give a concise, clear answer (2-4 sentences max). Be precise and educational."},
                {"role": "user", "content": f"Highlighted text: \"{req.highlighted_text}\"\n\nQuestion: {req.question}"}
            ]
            response = await api_client.deepseek.chat_completion(
                messages=messages,
                temperature=0.3,
                max_tokens=512
            )
            if response.success and response.data:
                answer = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
                # Save text context for logged-in users
                if current_user:
                    try:
                        media = UserMediaContext(
                            user_id=current_user.id,
                            media_type="text",
                            file_path="",
                            file_size_bytes=len(req.highlighted_text.encode("utf-8")),
                            extracted_text=req.highlighted_text,
                            ai_answer=answer,
                            question=req.question,
                            context_metadata={"subject": req.subject, "unit_title": req.unit_title},
                        )
                        db.add(media)
                        db.commit()
                    except Exception as e:
                        logger.warning(f"Failed to save text context (non-fatal): {e}")
                        db.rollback()
                return AskAIResponse(success=True, answer=answer)
            else:
                return AskAIResponse(success=False, answer="", error=response.error or "AI service unavailable")
        else:
            return AskAIResponse(success=False, answer="", error="Please provide highlighted text or an image")

    except Exception as e:
        logger.error(f"Ask AI failed: {e}")
        return AskAIResponse(success=False, answer="", error=str(e))


@app.get("/user/media-context")
async def list_user_media_context(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    offset: int = 0,
    limit: int = 50,
):
    """List the current user's saved media context items."""
    items = (
        db.query(UserMediaContext)
        .filter(UserMediaContext.user_id == current_user.id)
        .order_by(UserMediaContext.created_at.desc())
        .offset(offset)
        .limit(min(limit, 100))
        .all()
    )
    total = db.query(UserMediaContext).filter(UserMediaContext.user_id == current_user.id).count()
    return {
        "success": True,
        "items": [
            {
                "id": str(item.id),
                "media_type": item.media_type,
                "file_size_bytes": item.file_size_bytes,
                "extracted_text": item.extracted_text,
                "ai_answer": item.ai_answer,
                "question": item.question,
                "context_metadata": item.context_metadata or {},
                "has_file": bool(item.file_path),
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in items
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@app.delete("/user/media-context/{item_id}")
async def delete_user_media_context(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a saved media context item."""
    from uuid import UUID as PyUUID
    try:
        uid = PyUUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid item ID")

    item = (
        db.query(UserMediaContext)
        .filter(UserMediaContext.id == uid, UserMediaContext.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Delete file from disk
    if item.file_path:
        from core.user_storage import delete_media_file
        delete_media_file(item.file_path)

    db.delete(item)
    db.commit()
    return {"success": True, "message": "Deleted"}


@app.get("/user/storage-usage")
async def get_user_storage_usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's storage usage and quota."""
    from core.user_storage import check_storage_quota, FREE_TIER_QUOTA_BYTES, TESTING_MODE
    from sqlalchemy import func as sqlfunc

    total_bytes = (
        db.query(sqlfunc.coalesce(sqlfunc.sum(UserMediaContext.file_size_bytes), 0))
        .filter(UserMediaContext.user_id == current_user.id)
        .scalar()
    )
    item_count = db.query(UserMediaContext).filter(UserMediaContext.user_id == current_user.id).count()

    quota_bytes = 0 if TESTING_MODE or current_user.subscription_tier != "free" else FREE_TIER_QUOTA_BYTES

    return {
        "success": True,
        "usage_bytes": total_bytes,
        "usage_mb": round(total_bytes / (1024 * 1024), 2),
        "quota_bytes": quota_bytes,
        "quota_mb": round(quota_bytes / (1024 * 1024), 2) if quota_bytes else None,
        "item_count": item_count,
        "is_unlimited": TESTING_MODE or current_user.subscription_tier != "free",
    }


@app.get("/user/media-context/{item_id}/image")
async def get_user_media_image(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Serve a saved media image file."""
    from uuid import UUID as PyUUID
    from fastapi.responses import FileResponse

    try:
        uid = PyUUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid item ID")

    item = (
        db.query(UserMediaContext)
        .filter(UserMediaContext.id == uid, UserMediaContext.user_id == current_user.id)
        .first()
    )
    if not item or not item.file_path:
        raise HTTPException(status_code=404, detail="File not found")

    abs_path = os.path.join(config.DATA_DIR, item.file_path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(abs_path, media_type="image/png")


@app.post("/study-plan/create")
async def create_study_plan(
    req: StudyPlanCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a study plan from the confirmed plan data."""
    try:
        if req.request_id:
            request_hash = req.request_id.strip()[:120]
        else:
            import hashlib
            encoded = json.dumps(
                {"plan_data": req.plan_data, "language": req.language},
                ensure_ascii=False,
                sort_keys=True,
                default=str,
            )
            request_hash = hashlib.sha256(encoded.encode("utf-8")).hexdigest()

        idem_key = f"idempotency:study_plan_create:{current_user.id}:{request_hash}"
        redis_client = _redis_for_limits()
        if redis_client is not None:
            try:
                existing_plan_id = redis_client.get(idem_key)
                if existing_plan_id:
                    existing_plan_id = existing_plan_id.decode("utf-8") if isinstance(existing_plan_id, bytes) else existing_plan_id
                    existing = (
                        db.query(StudyPlan)
                        .filter(StudyPlan.id == existing_plan_id, StudyPlan.user_id == current_user.id)
                        .first()
                    )
                    if existing:
                        return {
                            "success": True,
                            "plan_id": str(existing.id),
                            "title": existing.title,
                            "total_units": existing.total_units,
                            "status": existing.status,
                            "idempotent": True,
                        }
            except Exception as exc:
                logger.warning(f"Study plan idempotency lookup failed: {exc}")

        plan_data = req.plan_data
        units_data = plan_data.get("units", [])

        plan = StudyPlan(
            user_id=current_user.id,
            subject=plan_data.get("subject", "general"),
            framework=plan_data.get("framework"),
            course_name=plan_data.get("course_name"),
            title=plan_data.get("title", "Study Plan"),
            description=plan_data.get("description", ""),
            language=req.language,
            total_units=len(units_data),
            estimated_hours=plan_data.get("estimated_hours", 0),
            diagnostic_context=plan_data.get("diagnostic_context", {}),
            status="active",
            ai_metadata={"request_id": request_hash},
        )
        db.add(plan)
        db.flush()  # Get plan.id

        for i, unit_data in enumerate(units_data):
            unit = StudyPlanUnit(
                plan_id=plan.id,
                order_index=i,
                title=unit_data.get("title", f"Unit {i+1}"),
                description=unit_data.get("description", ""),
                topics=unit_data.get("topics", []),
                learning_objectives=unit_data.get("learning_objectives", []),
                estimated_minutes=unit_data.get("estimated_minutes", 60),
                content_status="pending",
            )
            db.add(unit)

        db.commit()
        db.refresh(plan)
        if redis_client is not None:
            try:
                redis_client.setex(idem_key, 24 * 3600, str(plan.id))
            except Exception as exc:
                logger.warning(f"Study plan idempotency write failed: {exc}")

        return {
            "success": True,
            "plan_id": str(plan.id),
            "title": plan.title,
            "total_units": plan.total_units,
            "status": plan.status,
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Study plan creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/study-plan/my-plans")
async def get_my_study_plans(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all study plans for the current user."""
    try:
        _purge_expired_deleted_study_plans(db)
        _purge_expired_deleted_study_plan_units(db)
        plans = (
            _active_study_plan_query(db, current_user.id)
            .order_by(StudyPlan.created_at.desc())
            .all()
        )
        return {
            "success": True,
            "plans": [p.to_dict(include_units=False) for p in plans],
        }
    except Exception as e:
        logger.error(f"Failed to fetch study plans: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Study-plan library endpoint ────────────────────────────────────────────

@app.get("/study-plan/library")
async def get_study_plan_library(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the user's study plans grouped with their units and most-recent
    saved board session id (if any) per unit. Skips archived plans."""
    try:
        _purge_expired_deleted_study_plans(db)
        _purge_expired_deleted_study_plan_units(db)
        plans = (
            _active_study_plan_query(db, current_user.id)
            .order_by(StudyPlan.created_at.desc())
            .all()
        )

        # Pre-fetch most-recent board session per unit owned by this user
        sessions = (
            db.query(BoardSession)
            .filter(BoardSession.user_id == str(current_user.id))
            .order_by(BoardSession.updated_at.desc().nullslast(), BoardSession.created_at.desc())
            .all()
        )
        latest_by_unit: Dict[str, str] = {}
        for s in sessions:
            if s.plan_id and s.unit_id and s.unit_id not in latest_by_unit:
                key = f"{s.plan_id}:{s.unit_id}"
                latest_by_unit.setdefault(key, s.id)

        result = []
        for plan in plans:
            units_payload = []
            for unit in plan.units:
                if unit.content_status == "deleted":
                    continue
                key = f"{plan.id}:{unit.id}"
                units_payload.append({
                    "id": str(unit.id),
                    "order_index": unit.order_index,
                    "title": unit.title,
                    "topics": unit.topics or [],
                    "estimated_minutes": unit.estimated_minutes,
                    "content_status": unit.content_status,
                    "is_completed": bool(unit.is_completed),
                    "score": unit.score,
                    "board_session_id": latest_by_unit.get(key),
                })
            result.append({
                "id": str(plan.id),
                "title": plan.title,
                "subject": plan.subject,
                "framework": plan.framework,
                "status": plan.status,
                "progress_percentage": plan.progress_percentage,
                "language": plan.language,
                "deleted_at": plan.deleted_at.isoformat() if plan.deleted_at else None,
                "purge_after": plan.purge_after.isoformat() if plan.purge_after else None,
                "units": units_payload,
            })

        return {"success": True, "plans": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch study plan library: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/study-plan/delete")
async def delete_study_plans(
    req: StudyPlanBulkDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft delete selected plans, or all active plans when delete_all is true."""
    try:
        _purge_expired_deleted_study_plans(db)
        _purge_expired_deleted_study_plan_units(db)
        query = _active_study_plan_query(db, current_user.id)
        if not req.delete_all:
            plan_ids = [pid for pid in req.plan_ids if isinstance(pid, str) and pid]
            if not plan_ids:
                return {"success": True, "deleted": 0, "plan_ids": []}
            query = query.filter(StudyPlan.id.in_(plan_ids))

        plans = query.all()
        for plan in plans:
            _soft_delete_study_plan(plan)
        db.commit()
        return {
            "success": True,
            "deleted": len(plans),
            "plan_ids": [str(plan.id) for plan in plans],
            "retention_days": STUDY_PLAN_DELETE_RETENTION_DAYS,
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to bulk delete study plans: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/study-plan/{plan_id}")
async def delete_study_plan(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft delete one study plan. Deleted plans are purged after 30 days."""
    try:
        _purge_expired_deleted_study_plans(db)
        _purge_expired_deleted_study_plan_units(db)
        plan = (
            _active_study_plan_query(db, current_user.id)
            .filter(StudyPlan.id == plan_id)
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Study plan not found")
        _soft_delete_study_plan(plan)
        db.commit()
        return {
            "success": True,
            "deleted": 1,
            "plan_id": plan_id,
            "status": plan.status,
            "deleted_at": plan.deleted_at.isoformat() if plan.deleted_at else None,
            "purge_after": plan.purge_after.isoformat() if plan.purge_after else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete study plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/study-plan/{plan_id}")
async def get_study_plan(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a study plan with all its units."""
    try:
        _purge_expired_deleted_study_plan_units(db)
        plan = (
            _active_study_plan_query(db, current_user.id)
            .filter(StudyPlan.id == plan_id)
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Study plan not found")
        return {"success": True, "plan": plan.to_dict(include_units=True)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch study plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/study-plan/{plan_id}/unit/{unit_id}")
async def delete_study_plan_unit(
    plan_id: str,
    unit_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft delete one study plan unit. Deleted units are purged after 30 days."""
    try:
        _purge_expired_deleted_study_plan_units(db)
        plan = (
            _active_study_plan_query(db, current_user.id)
            .filter(StudyPlan.id == plan_id)
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Study plan not found")

        unit = (
            _active_study_plan_unit_query(db, plan_id)
            .filter(StudyPlanUnit.id == unit_id)
            .first()
        )
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found")

        _soft_delete_study_plan_unit(unit)
        db.flush()
        _sync_study_plan_progress(db, plan)
        db.commit()
        return {
            "success": True,
            "deleted": 1,
            "unit_id": unit_id,
            "plan_id": plan_id,
            "retention_days": STUDY_PLAN_DELETE_RETENTION_DAYS,
            "plan": plan.to_dict(include_units=False),
            "deleted_at": unit.deleted_at.isoformat() if unit.deleted_at else None,
            "purge_after": unit.purge_after.isoformat() if unit.purge_after else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete study plan unit: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/study-plan/{plan_id}/unit/{unit_id}/generate")
async def generate_unit_content(
    plan_id: str,
    unit_id: str,
    req: UnitGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger content generation for a study plan unit via Celery."""
    try:
        _enforce_quota(current_user, "unit_generate")
        plan = (
            _active_study_plan_query(db, current_user.id)
            .filter(StudyPlan.id == plan_id)
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Study plan not found")

        unit = _active_study_plan_unit_query(db, plan_id).filter(StudyPlanUnit.id == unit_id).first()
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found")

        allowed_content_types = {"study_guide", "quiz", "flashcards", "formula_sheet", "mock_exam"}
        content_types = [ct for ct in req.content_types if ct in allowed_content_types]
        if not content_types:
            raise HTTPException(status_code=400, detail="No valid content types requested")

        plan_payload = {
            "subject": plan.subject,
            "framework": plan.framework,
            "course_name": plan.course_name,
            "difficulty_level": plan.difficulty_level or "intermediate",
        }
        unit_payload = {
            "title": unit.title,
            "description": unit.description,
            "topics": unit.topics or [],
            "learning_objectives": unit.learning_objectives or [],
        }
        cache_key = build_unit_content_cache_key(
            plan_data=plan_payload,
            unit_data=unit_payload,
            content_types=content_types,
            language=plan.language,
        )
        redis_client = _redis_for_limits()
        if redis_client is not None:
            try:
                cached_raw = redis_client.get(f"unit_content_cache:{cache_key}")
                if cached_raw:
                    cached_text = cached_raw.decode("utf-8") if isinstance(cached_raw, bytes) else cached_raw
                    cached = json.loads(cached_text)
                    for ct in content_types:
                        if ct in cached and cached[ct] is not None:
                            setattr(unit, ct, cached[ct])
                    from datetime import datetime, timezone
                    unit.content_status = "ready"
                    unit.generation_task_id = None
                    unit.generation_content_types = content_types
                    unit.generation_started_at = None
                    unit.generation_cache_key = cache_key
                    unit.updated_at = datetime.now(timezone.utc)
                    db.commit()
                    return {
                        "success": True,
                        "cached": True,
                        "unit_id": str(unit.id),
                        "content_types": content_types,
                        "cache_key": cache_key,
                    }
            except Exception as exc:
                logger.warning(f"Unit content cache lookup failed: {exc}")

        # Recovery: if stuck in 'generating' for over 10 minutes, reset
        if unit.content_status == "generating":
            from datetime import datetime, timezone, timedelta
            if unit.updated_at and (datetime.now(timezone.utc) - unit.updated_at.replace(tzinfo=timezone.utc)) > timedelta(minutes=10):
                logger.warning(f"Unit {unit_id} stuck in 'generating' for >10min, resetting")
                unit.content_status = "failed"
                db.commit()
            else:
                return {
                    "success": True,
                    "message": "Generation already in progress",
                    "unit_id": str(unit.id),
                    "task_id": unit.generation_task_id,
                    "cache_key": unit.generation_cache_key,
                }

        # Mark as generating
        from datetime import datetime, timezone
        unit.content_status = "generating"
        unit.generation_content_types = content_types
        unit.generation_started_at = datetime.now(timezone.utc)
        unit.generation_cache_key = cache_key
        db.commit()

        # Dispatch Celery task
        from celery_app import generate_unit_content_task

        task = generate_unit_content_task.delay(
            unit_id=str(unit.id),
            plan_data=plan_payload,
            unit_data=unit_payload,
            content_types=content_types,
            language=plan.language,
            cache_key=cache_key,
        )
        unit.generation_task_id = task.id
        db.commit()

        return {
            "success": True,
            "task_id": task.id,
            "unit_id": str(unit.id),
            "content_types": content_types,
            "cache_key": cache_key,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unit content generation dispatch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/study-plan/{plan_id}/unit/{unit_id}/board-lesson")
async def create_unit_board_lesson(
    plan_id: str,
    unit_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a streaming board lesson session for a study plan unit.

    Returns a session_id that the client can use to connect via
    WebSocket at /ws/board/{session_id} for real-time board streaming.
    """
    try:
        _enforce_quota(current_user, "board_lesson")
        plan = (
            _active_study_plan_query(db, current_user.id)
            .filter(StudyPlan.id == plan_id)
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Study plan not found")

        unit = _active_study_plan_unit_query(db, plan_id).filter(StudyPlanUnit.id == unit_id).first()
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found")

        # Rate limit: per-user and global session caps
        user_sessions = [s for s in _board_sessions.values() if s.get("user_id") == current_user.id]
        if len(user_sessions) >= MAX_SESSIONS_PER_USER:
            raise HTTPException(status_code=429, detail="Too many active board sessions")
        if len(_board_sessions) >= MAX_BOARD_SESSIONS:
            raise HTTPException(status_code=503, detail="Server session limit reached")

        # Build topic from unit context
        topics_str = ", ".join(unit.topics) if unit.topics else unit.title
        objectives_str = "; ".join(unit.learning_objectives) if unit.learning_objectives else ""
        topic = f"{plan.course_name or plan.subject}: {unit.title}"
        custom_requirements = f"Topics: {topics_str}"
        if objectives_str:
            custom_requirements += f"\nLearning objectives: {objectives_str}"
        if plan.framework:
            custom_requirements += f"\nExam framework: {plan.framework}"

        # Optional body: { "language": "en" | "zh" }
        body = {}
        try:
            body = await request.json()
            if not isinstance(body, dict):
                body = {}
        except Exception:
            body = {}
        req_lang = body.get("language")
        lang = req_lang if req_lang in ("en", "zh") else (plan.language or "zh")

        session_id = str(_uuid.uuid4())
        from core.board.state_manager import BoardStateManager
        from mcp.board_server import BoardMCPServer
        state_mgr = BoardStateManager()
        board_server = BoardMCPServer(state_manager=state_mgr)

        _board_sessions[session_id] = {
            "state_manager": state_mgr,
            "board_server": board_server,
            "config": {
                "topic": topic,
                "language": lang,
                "student_level": plan.difficulty_level or "intermediate",
                "duration_minutes": max(5, (unit.estimated_minutes or 60) // 3),
                "custom_requirements": custom_requirements,
            },
            "status": "created",
            "user_id": current_user.id,
            "plan_id": plan_id,
            "unit_id": unit_id,
        }

        return {
            "success": True,
            "session_id": session_id,
            "topic": topic,
            "ws_url": f"/ws/board/{session_id}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Board lesson creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/study-plan/{plan_id}/unit/{unit_id}/content")
async def get_unit_content(
    plan_id: str,
    unit_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get generated content for a study plan unit."""
    try:
        plan = (
            _active_study_plan_query(db, current_user.id)
            .filter(StudyPlan.id == plan_id)
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Study plan not found")

        unit = _active_study_plan_unit_query(db, plan_id).filter(StudyPlanUnit.id == unit_id).first()
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found")

        return {
            "success": True,
            "content_status": unit.content_status,
            "generation_task_id": unit.generation_task_id,
            "generation_content_types": unit.generation_content_types,
            "generation_started_at": unit.generation_started_at.isoformat() if unit.generation_started_at else None,
            "generation_cache_key": unit.generation_cache_key,
            "study_guide": unit.study_guide,
            "quiz": unit.quiz,
            "flashcards": unit.flashcards,
            "formula_sheet": unit.formula_sheet,
            "mock_exam": unit.mock_exam,
            "is_completed": unit.is_completed,
            "score": unit.score,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch unit content: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/study-plan/{plan_id}/unit/{unit_id}/complete")
async def mark_unit_complete(
    plan_id: str,
    unit_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a unit as completed and update plan progress."""
    try:
        plan = (
            _active_study_plan_query(db, current_user.id)
            .filter(StudyPlan.id == plan_id)
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Study plan not found")

        unit = _active_study_plan_unit_query(db, plan_id).filter(StudyPlanUnit.id == unit_id).first()
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found")

        unit.is_completed = True
        # Update plan progress
        _sync_study_plan_progress(db, plan)

        if plan.progress_percentage >= 100:
            plan.status = "completed"

        db.commit()
        return {
            "success": True,
            "progress_percentage": plan.progress_percentage,
            "plan_status": plan.status,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to mark unit complete: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Quiz Score Submission & Adaptive Difficulty ─────────────────────────────

class SubmitQuizScoreRequest(BaseModel):
    score: float = Field(..., ge=0.0, le=1.0, description="Quiz score as 0.0-1.0")
    quiz_type: str = Field(default="formative", description="formative, unit_test, or mock_exam")


def _adjust_difficulty(current: str, recent_scores: list[float]) -> str:
    """Adjust difficulty based on recent quiz scores (sliding window of last 3)."""
    if len(recent_scores) < 2:
        return current
    avg = sum(recent_scores[-3:]) / len(recent_scores[-3:])
    if avg >= 0.85 and current != "advanced":
        return "advanced" if current == "intermediate" else "intermediate"
    if avg <= 0.45 and current != "beginner":
        return "beginner" if current == "intermediate" else "intermediate"
    return current


@app.post("/study-plan/{plan_id}/unit/{unit_id}/submit-score")
async def submit_unit_quiz_score(
    plan_id: str,
    unit_id: str,
    req: SubmitQuizScoreRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit a quiz score for a unit. Adjusts plan difficulty adaptively."""
    try:
        plan = (
            _active_study_plan_query(db, current_user.id)
            .filter(StudyPlan.id == plan_id)
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Study plan not found")

        unit = _active_study_plan_unit_query(db, plan_id).filter(StudyPlanUnit.id == unit_id).first()
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found")

        unit.score = req.score

        # Collect recent scores for adaptive adjustment
        scored_units = (
            db.query(StudyPlanUnit)
            .filter(
                StudyPlanUnit.plan_id == plan_id,
                StudyPlanUnit.content_status != "deleted",
                StudyPlanUnit.score.isnot(None),
            )
            .order_by(StudyPlanUnit.order_index)
            .all()
        )
        recent_scores = [u.score for u in scored_units]

        old_level = plan.difficulty_level or "intermediate"
        new_level = _adjust_difficulty(old_level, recent_scores)
        level_changed = old_level != new_level
        if level_changed:
            plan.difficulty_level = new_level

        db.commit()
        return {
            "success": True,
            "score": req.score,
            "difficulty_level": new_level,
            "level_changed": level_changed,
            "recent_scores": recent_scores[-3:],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to submit quiz score: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Gaokao Chat Endpoints ───────────────────────────────────────────────────

@app.post("/gaokao/chat")
async def gaokao_chat(
    req: GaokaoChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Chat with the Gaokao tutor — conversational learning loop."""
    try:
        # Get or create session
        session = None
        if req.session_id:
            session = db.query(GaokaoSession).filter(
                GaokaoSession.id == req.session_id,
                GaokaoSession.user_id == current_user.id,
            ).first()

        if not session:
            session = GaokaoSession(
                user_id=current_user.id,
                plan_id=req.plan_id,
                subject=req.subject,
                topic_focus=req.topic_focus,
                chat_history=[],
                resources_found=[],
                status="active",
            )
            db.add(session)
            db.flush()

        # Get tutor response
        chat_history = session.chat_history or []
        result = await gaokao_tutor.chat(
            subject=req.subject,
            message=req.message,
            chat_history=chat_history,
            topic_focus=req.topic_focus or session.topic_focus,
            resources=session.resources_found,
            language=req.language,
        )

        # Update session history
        chat_history.append({"role": "user", "content": req.message})
        chat_history.append({"role": "assistant", "content": result["content"]})
        session.chat_history = chat_history
        if req.topic_focus:
            session.topic_focus = req.topic_focus
        db.commit()

        return {
            "success": True,
            "session_id": str(session.id),
            "content": result["content"],
            "suggested_actions": result["suggested_actions"],
            "needs_search": result["needs_search"],
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Gaokao chat failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/gaokao/practice")
async def gaokao_practice(
    subject: str = "math",
    topic: str = "函数",
    difficulty: str = "medium",
    count: int = 3,
    current_user: User = Depends(get_current_user),
):
    """Generate Gaokao-style practice problems."""
    try:
        result = await gaokao_tutor.generate_practice(
            subject=subject,
            topic=topic,
            difficulty=difficulty,
            count=count,
        )
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate practice problems")
        return {"success": True, "problems": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gaokao practice generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/gaokao/save-plan")
async def gaokao_save_plan(
    req: GaokaoSavePlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a study plan for gaokao prep and optionally link an existing session."""
    try:
        plan = StudyPlan(
            user_id=current_user.id,
            subject=req.subject,
            framework="gaokao",
            title=req.title,
            description=req.description,
            language=req.language,
            total_units=0,
            estimated_hours=0,
            diagnostic_context=req.diagnostic_context,
            status="active",
        )
        db.add(plan)
        db.flush()

        # Link existing session to this plan if provided
        if req.session_id:
            session = db.query(GaokaoSession).filter(
                GaokaoSession.id == req.session_id,
                GaokaoSession.user_id == current_user.id,
            ).first()
            if session:
                session.plan_id = plan.id

        db.commit()
        db.refresh(plan)

        return {
            "success": True,
            "plan_id": str(plan.id),
            "title": plan.title,
            "status": plan.status,
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Gaokao save plan failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/gaokao/sessions/{plan_id}")
async def get_gaokao_sessions(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all gaokao sessions linked to a study plan."""
    try:
        plan = (
            db.query(StudyPlan)
            .filter(StudyPlan.id == plan_id, StudyPlan.user_id == current_user.id)
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Study plan not found")

        sessions = (
            db.query(GaokaoSession)
            .filter(GaokaoSession.plan_id == plan_id)
            .order_by(GaokaoSession.created_at.desc())
            .all()
        )
        return {
            "success": True,
            "sessions": [s.to_dict() for s in sessions],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch gaokao sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Board Streaming Endpoints (B4 + B6) ────────────────────────────────────

import uuid as _uuid

# In-memory board session store (Redis-backed in production)
_board_sessions: dict = {}


class BoardSessionRequest(BaseModel):
    topic: str
    language: str = "zh"
    student_level: str = "beginner"
    duration_minutes: int = 10
    custom_requirements: Optional[str] = None


MAX_BOARD_SESSIONS = 100
MAX_SESSIONS_PER_USER = 5


@app.post("/board/create-session")
async def create_board_session(
    req: BoardSessionRequest,
    current_user: User = Depends(get_current_user),
):
    """Create a new board lesson session and return session_id."""
    # Rate limit: per-user and global session caps
    user_sessions = [s for s in _board_sessions.values() if s.get("user_id") == current_user.id]
    if len(user_sessions) >= MAX_SESSIONS_PER_USER:
        raise HTTPException(status_code=429, detail="Too many active board sessions")
    if len(_board_sessions) >= MAX_BOARD_SESSIONS:
        raise HTTPException(status_code=503, detail="Server session limit reached")

    session_id = str(_uuid.uuid4())
    from core.board.state_manager import BoardStateManager
    from mcp.board_server import BoardMCPServer
    state_mgr = BoardStateManager()
    board_server = BoardMCPServer(state_manager=state_mgr)

    _board_sessions[session_id] = {
        "state_manager": state_mgr,
        "board_server": board_server,
        "config": req.dict(),
        "status": "created",
        "user_id": current_user.id,
    }

    return {"success": True, "session_id": session_id}


@app.delete("/board/cleanup-sessions")
async def cleanup_board_sessions(
    current_user: User = Depends(get_current_user),
):
    """Test-only: clear all in-memory board sessions.  Only available when
    MENTORMIND_ENV=testing."""
    if os.getenv("MENTORMIND_ENV") != "testing":
        raise HTTPException(status_code=403, detail="Only available in testing mode")
    count = len(_board_sessions)
    _board_sessions.clear()
    return {"success": True, "cleared": count}


@app.get("/board/session/{session_id}")
async def get_board_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get current board state and event log for a session (supports reconnection)."""
    session = _board_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Board session not found")
    if session.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized for this session")

    from core.board.state_manager import BoardStateManager
    state_mgr: BoardStateManager = session["state_manager"]
    return {
        "success": True,
        "session_id": session_id,
        "status": session["status"],
        "state": state_mgr.get_state(),
        "event_log": state_mgr.get_event_log(),
    }


@app.post("/board/session/{session_id}/save")
async def save_board_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    """Persist the board session data to the database."""
    session = _board_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Board session not found")
    if session.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized for this session")

    from core.board.state_manager import BoardStateManager
    state_mgr: BoardStateManager = session["state_manager"]
    board_data = {
        "session_id": session_id,
        "config": session["config"],
        "state": state_mgr.get_state(),
        "event_log": state_mgr.get_event_log(),
    }

    # Store in Redis for retrieval (1 hour TTL)
    try:
        from celery_app import _redis_client as _rc
        if _rc:
            import json as _json
            _rc.setex(
                f"board_session:{session_id}",
                3600,
                _json.dumps(board_data, default=str),
            )
    except Exception as e:
        logger.warning(f"Failed to save board session to Redis: {e}")

    session["status"] = "saved"
    return {"success": True, "session_id": session_id}


@app.post("/board/session/{session_id}/summary")
async def get_board_summary(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    """Return the cached post-lesson summary, computing it on demand if absent."""
    session = _board_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Board session not found")
    if session.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    cached = session.get("cached_summary")
    if cached:
        return {"success": True, "summary": cached}
    from core.board.summarizer import summarize_session
    state_mgr = session["state_manager"]
    language = session["config"].get("language", "zh")
    summary = await summarize_session(state_mgr, language=language)
    session["cached_summary"] = summary
    return {"success": True, "summary": summary}


def _make_board_share_token(session_id: str, user_id: str, ttl_seconds: int = 7 * 24 * 3600) -> str:
    import base64
    import hashlib
    import hmac
    import time as _time

    secret = os.getenv("BETTER_AUTH_SECRET", "")
    if not secret:
        raise HTTPException(status_code=500, detail="Share links are not configured")
    expires_at = int(_time.time()) + ttl_seconds
    payload = f"{session_id}.{user_id}.{expires_at}"
    sig = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    raw = f"{payload}.{sig}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _verify_board_share_token(token: str, session_id: str) -> str:
    import base64
    import hashlib
    import hmac
    import time as _time

    secret = os.getenv("BETTER_AUTH_SECRET", "")
    if not secret:
        raise HTTPException(status_code=500, detail="Share links are not configured")
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        token_session_id, user_id, exp_text, sig = raw.rsplit(".", 3)
        if token_session_id != session_id:
            raise ValueError("session mismatch")
        expires_at = int(exp_text)
        if expires_at < int(_time.time()):
            raise HTTPException(status_code=410, detail="Share link expired")
        payload = f"{token_session_id}.{user_id}.{expires_at}"
        expected = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            raise ValueError("bad signature")
        return user_id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid share token")


@app.post("/board/session/{session_id}/share")
async def create_board_share_link(
    session_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a signed, expiring public summary link for a board session."""
    _validate_session_id_or_400(session_id)
    loaded = _board_load_state(db, session_id, user_id=str(current_user.id))
    mem = _board_sessions.get(session_id)
    if loaded is None and not mem:
        raise HTTPException(status_code=404, detail="Board session not found")
    if isinstance(loaded, dict) and loaded.get("__forbidden__"):
        raise HTTPException(status_code=403, detail="Not authorized for this session")
    if mem and str(mem.get("user_id")) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized for this session")

    token = _make_board_share_token(session_id, str(current_user.id))
    origin = str(request.base_url).rstrip("/")
    return {
        "success": True,
        "session_id": session_id,
        "token": token,
        "share_url": f"{origin}/board-share/{session_id}?token={token}",
    }


@app.get("/board/session/{session_id}/share")
async def get_public_board_share(
    session_id: str,
    token: str,
    db: Session = Depends(get_db),
):
    """Resolve a signed board summary link without requiring login."""
    _validate_session_id_or_400(session_id)
    owner_id = _verify_board_share_token(token, session_id)
    loaded = _board_load_state(db, session_id, user_id=owner_id)
    if not loaded or loaded.get("__forbidden__"):
        raise HTTPException(status_code=404, detail="Board session not found")

    narration = loaded.get("narration_log") or []
    elements = loaded.get("elements") or {}
    title = loaded.get("title") or loaded.get("topic") or "Board lesson"
    excerpt_parts = []
    for item in narration[:5]:
        text = item.get("text") or item.get("narration") or item.get("content")
        if isinstance(text, str) and text.strip():
            excerpt_parts.append(text.strip())
    fallback_summary = "\n\n".join(excerpt_parts)

    return {
        "success": True,
        "session": {
            "id": loaded.get("id"),
            "title": title,
            "topic": loaded.get("topic"),
            "status": loaded.get("status"),
            "updated_at": loaded.get("updated_at"),
            "element_count": len(elements),
            "summary_markdown": fallback_summary,
        },
    }


async def _delayed_session_cleanup(session_id: str, delay_seconds: float) -> None:
    """Drop a board session from memory after a grace period.

    The delay lets the frontend fetch the cached summary or reconnect briefly
    after the WebSocket closes without hitting a 404.
    """
    try:
        await asyncio.sleep(delay_seconds)
    except asyncio.CancelledError:
        return
    _board_sessions.pop(session_id, None)


def _board_session_to_state_dict(session: dict, status: Optional[str] = None, conversation_state: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Convert an in-memory _board_sessions entry into the persisted state shape."""
    state_mgr = session.get("state_manager")
    board_dict = None
    elements: Dict[str, Any] = {}
    element_order: List[str] = []
    narration_log: List[Dict[str, Any]] = []
    last_event_seq = 0
    try:
        if state_mgr is not None:
            board_dict = state_mgr.get_state()
            if isinstance(board_dict, dict):
                elements = board_dict.get("elements", {}) or {}
                element_order = list(elements.keys())
                narration_log = board_dict.get("narration_queue", []) or []
                last_event_seq = len(board_dict.get("event_log", []) or [])
    except Exception:
        pass
    return {
        "board": board_dict,
        "elements": elements,
        "element_order": element_order,
        "narration_log": narration_log,
        "audio_queue": session.get("audio_queue", []) or [],
        "chat_history": session.get("chat_history", []) or [],
        "last_event_seq": last_event_seq,
        "status": status or session.get("status") or "generating",
        "conversation_state": conversation_state or [],
    }


def _persist_board_session_sync(
    session_id: str,
    session: dict,
    status: Optional[str] = None,
    last_event_seq: Optional[int] = None,
    conversation_state: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Synchronous helper — never call directly from an async coroutine; use _persist_board_session_safe."""
    try:
        from database.base import SessionLocal as _SL
        with _SL() as _db:
            cfg = session.get("config") or {}
            state_dict = _board_session_to_state_dict(session, status=status, conversation_state=conversation_state)
            # Caller passed an explicit running counter — override the value
            # derived from in-memory event_log so a server restart can't reset
            # the persisted seq to 0.
            if isinstance(last_event_seq, int):
                state_dict["last_event_seq"] = last_event_seq
            _board_save_state(
                _db,
                session_id,
                user_id=str(session.get("user_id")) if session.get("user_id") is not None else None,
                plan_id=session.get("plan_id"),
                unit_id=session.get("unit_id"),
                topic=cfg.get("topic"),
                title=cfg.get("topic"),
                status=status,
                state=state_dict,
                config=cfg,
            )
    except Exception as exc:
        logger.warning(f"_persist_board_session_safe failed for {session_id}: {exc}")


async def _persist_board_session_safe(
    session_id: str,
    session: dict,
    status: Optional[str] = None,
    last_event_seq: Optional[int] = None,
    conversation_state: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Best-effort durable save offloaded to a thread so we don't block the asyncio loop."""
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None, _persist_board_session_sync, session_id, session, status, last_event_seq, conversation_state
        )
    except Exception as exc:
        logger.warning(f"_persist_board_session_safe scheduling failed for {session_id}: {exc}")


# ── Board Persistence Endpoints ─────────────────────────────────────────────

@app.get("/board/{session_id}/state")
async def get_board_persisted_state(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the persisted state for a saved board session.

    404 if not found. 403 if owned by another user. Used by the client to
    hydrate the reducer before opening the WebSocket on revisit.
    """
    _validate_session_id_or_400(session_id)
    loaded = _board_load_state(db, session_id, user_id=str(current_user.id))
    if loaded is None:
        mem = _board_sessions.get(session_id)
        if mem is None:
            raise HTTPException(status_code=404, detail="Board session not found")
        if mem.get("user_id") and str(mem["user_id"]) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized for this session")
        loaded = {
            "id": session_id,
            "user_id": str(mem.get("user_id", "")),
            "plan_id": mem.get("plan_id"),
            "unit_id": mem.get("unit_id"),
            "topic": mem.get("config", {}).get("topic"),
            "title": mem.get("config", {}).get("topic"),
            "status": mem.get("status", "created"),
            "elements": {},
            "element_order": [],
            "narration_log": [],
            "audio_queue": [],
            "chat_history": [],
            "last_event_seq": 0,
            "config": mem.get("config", {}),
            "created_at": None,
            "updated_at": None,
        }
    if isinstance(loaded, dict) and loaded.get("__forbidden__"):
        raise HTTPException(status_code=403, detail="Not authorized for this session")
    return {"success": True, "session": loaded}


class BoardStateSavePayload(BaseModel):
    state: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    last_event_seq: Optional[int] = None


@app.post("/board/{session_id}/save")
@limiter.limit("60/minute")
async def save_board_persisted_state(
    session_id: str,
    request: Request,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Accept a durable snapshot of board state from the client.

    Auth optional — used by sendBeacon on unmount/beforeunload, which cannot
    always attach the auth header. If a user is authenticated we record their
    id for ownership checks.
    """
    _validate_session_id_or_400(session_id)
    # Cap payload size at 256KB to keep these writes cheap.
    raw = await request.body()
    if len(raw) > 256 * 1024:
        raise HTTPException(status_code=413, detail="Payload too large")
    try:
        body = json.loads(raw.decode("utf-8") or "{}") if raw else {}
        if not isinstance(body, dict):
            body = {}
    except Exception:
        body = {}

    state = body.get("state") if isinstance(body.get("state"), dict) else None
    status = body.get("status") if isinstance(body.get("status"), str) else None
    seq = body.get("last_event_seq")
    if state is not None and isinstance(seq, int) and "last_event_seq" not in state:
        state["last_event_seq"] = seq

    user_id = str(current_user.id) if current_user else None
    mem = _board_sessions.get(session_id) or {}
    existing = db.query(BoardSession).filter(BoardSession.id == session_id).first()

    # Anti-squat: only accept saves when (a) the row already exists with a
    # matching owner, OR (b) an in-memory session exists for this id (which is
    # only created via the authenticated /study-plan/.../board-lesson endpoint),
    # OR (c) the row exists and is unclaimed AND the requesting user owns the
    # in-memory session of the same id. An unauthenticated POST with no prior
    # row and no in-memory session is rejected as a squatter.
    mem_user_id = str(mem.get("user_id")) if mem.get("user_id") is not None else None
    if existing is None and not mem:
        raise HTTPException(status_code=404, detail="Unknown board session")
    if existing is not None and existing.user_id and user_id and str(existing.user_id) != user_id:
        raise HTTPException(status_code=403, detail="Not authorized for this session")
    if existing is not None and existing.user_id and mem_user_id and str(existing.user_id) != mem_user_id:
        # In-memory session belongs to a different user than the persisted row.
        raise HTTPException(status_code=403, detail="Not authorized for this session")
    # If we have neither auth nor an in-memory session, but a row already exists
    # with no owner, treat as squat: refuse silently.
    if existing is not None and existing.user_id is None and not user_id and not mem_user_id:
        raise HTTPException(status_code=403, detail="Anonymous saves are not allowed for this session")
    incoming_seq = None
    if state is not None and isinstance(state.get("last_event_seq"), int):
        incoming_seq = state.get("last_event_seq")
    elif isinstance(seq, int):
        incoming_seq = seq
    existing_seq = existing.last_event_seq if existing and isinstance(existing.last_event_seq, int) else None
    if (
        existing is not None
        and isinstance(incoming_seq, int)
        and isinstance(existing_seq, int)
        and incoming_seq <= existing_seq
        and (status is None or status == existing.status)
    ):
        return {"success": True, "skipped": True}
    cfg = mem.get("config") or {}
    # Bind to whichever owner we can identify: prefer authenticated user, else
    # fall back to the in-memory owner so sendBeacon (no auth) still binds.
    bound_user_id = user_id or mem_user_id
    _board_save_state(
        db,
        session_id,
        user_id=bound_user_id,
        plan_id=mem.get("plan_id"),
        unit_id=mem.get("unit_id"),
        topic=cfg.get("topic"),
        title=cfg.get("topic"),
        status=status,
        state=state,
        config=cfg or None,
    )
    return {"success": True}


@app.get("/board/my-sessions")
async def list_my_board_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return saved sessions for the current user, newest first."""
    sessions = _board_list_user_sessions(db, str(current_user.id), limit=50)
    return {"success": True, "sessions": sessions}


# ── Telemetry Endpoints ──────────────────────────────────────────────────────

class TelemetryEventPayload(BaseModel):
    session_id: str
    event_type: str
    page: Optional[str] = None
    url: Optional[str] = None
    latency_ms: Optional[int] = None
    payload: Optional[Dict[str, Any]] = None
    viewport_w: Optional[int] = None
    viewport_h: Optional[int] = None


@app.post("/telemetry/event")
@limiter.limit("60/minute")
async def post_telemetry_event(
    request: Request,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Record a single client-side telemetry event. No auth required."""
    raw = await request.body()
    if len(raw) > 8 * 1024:
        raise HTTPException(status_code=413, detail="Payload too large")
    try:
        body = json.loads(raw.decode("utf-8") or "{}") if raw else {}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")

    event_type = body.get("event_type")
    session_id = body.get("session_id")
    if not isinstance(event_type, str) or event_type not in ALLOWED_EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown event_type")
    if not isinstance(session_id, str) or not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    def _str_or_none(v, max_len: int) -> Optional[str]:
        if v is None:
            return None
        if not isinstance(v, str):
            v = str(v)
        return v[:max_len]

    def _int_or_none(v) -> Optional[int]:
        if v is None:
            return None
        try:
            return int(v)
        except Exception:
            return None

    # Defense-in-depth: clamp every string field inside `payload` to 8000 chars
    # so a future event_type with large strings can't blow up the row. Special
    # case `survey_response.freeText` to 4000 (matches the client cap).
    raw_payload = body.get("payload") if isinstance(body.get("payload"), dict) else {}
    safe_payload: Dict[str, Any] = {}
    for k, v in raw_payload.items():
        if isinstance(v, str):
            cap = 8000
            if event_type == "survey_response" and k == "freeText":
                cap = 4000
            safe_payload[k] = v[:cap]
        else:
            safe_payload[k] = v

    user_agent = request.headers.get("user-agent")
    client_host = request.client.host if request.client else None

    event = TelemetryEvent(
        user_id=str(current_user.id) if current_user else None,
        session_id=session_id[:255],
        event_type=event_type[:64],
        page=_str_or_none(body.get("page"), 64),
        url=_str_or_none(body.get("url"), 512),
        latency_ms=_int_or_none(body.get("latency_ms")),
        payload=safe_payload,
        viewport_w=_int_or_none(body.get("viewport_w")),
        viewport_h=_int_or_none(body.get("viewport_h")),
        user_agent=_str_or_none(user_agent, 512),
        ip_address=_str_or_none(client_host, 45),
    )
    try:
        db.add(event)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning(f"telemetry insert failed: {exc}")
        # Telemetry failure must never block the user-facing flow.
        return {"ok": True, "recorded": False}
    return {"ok": True}


def _percentile(values: List[float], pct: float) -> Optional[float]:
    if not values:
        return None
    s = sorted(values)
    if pct <= 0:
        return float(s[0])
    if pct >= 100:
        return float(s[-1])
    k = (pct / 100.0) * (len(s) - 1)
    f = int(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return float(s[f])
    return float(s[f] + (s[c] - s[f]) * (k - f))


@app.get("/admin/telemetry/aggregate")
async def get_admin_telemetry_aggregate(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    group_by: Optional[str] = "page",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregate telemetry counters and latency percentiles for admin dashboards.

    Admin-gated via the `User.role` field. Falls back to summary-only if a
    bad date is passed.
    """
    if (current_user.role or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    from datetime import datetime as _dt
    from sqlalchemy import func as _fn, case as _case

    q = db.query(TelemetryEvent)
    try:
        if start_date:
            q = q.filter(TelemetryEvent.created_at >= _dt.fromisoformat(start_date))
        if end_date:
            q = q.filter(TelemetryEvent.created_at <= _dt.fromisoformat(end_date))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start_date/end_date")

    if event_type:
        if event_type not in ALLOWED_EVENT_TYPES:
            raise HTTPException(status_code=400, detail="Unknown event_type")
        q = q.filter(TelemetryEvent.event_type == event_type)

    # Build a reusable filter list once, so the percentile + group-by queries
    # stay in sync with the top-error query. Avoid q.all() — Postgres does
    # the percentile work via percentile_cont.
    filters = []
    try:
        if start_date:
            filters.append(TelemetryEvent.created_at >= _dt.fromisoformat(start_date))
        if end_date:
            filters.append(TelemetryEvent.created_at <= _dt.fromisoformat(end_date))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start_date/end_date")
    if event_type:
        filters.append(TelemetryEvent.event_type == event_type)

    # Top-level summary — compute percentiles in SQL.
    summary_q = db.query(
        _fn.percentile_cont(0.5).within_group(TelemetryEvent.latency_ms.asc()).label("p50"),
        _fn.percentile_cont(0.95).within_group(TelemetryEvent.latency_ms.asc()).label("p95"),
        _fn.percentile_cont(0.99).within_group(TelemetryEvent.latency_ms.asc()).label("p99"),
        _fn.count().label("total"),
        _fn.count(_fn.distinct(TelemetryEvent.session_id)).label("unique_sessions"),
    )
    for f in filters:
        summary_q = summary_q.filter(f)
    summary_row = summary_q.one()
    summary = {
        "total": int(summary_row.total or 0),
        "unique_sessions": int(summary_row.unique_sessions or 0),
        "p50": float(summary_row.p50) if summary_row.p50 is not None else None,
        "p95": float(summary_row.p95) if summary_row.p95 is not None else None,
        "p99": float(summary_row.p99) if summary_row.p99 is not None else None,
    }

    # Group breakdown — single SQL query with percentile_cont per group.
    if group_by not in ("page", "event_type"):
        group_by = "page"
    group_col = TelemetryEvent.page if group_by == "page" else TelemetryEvent.event_type

    group_q = db.query(
        group_col.label("key"),
        _fn.count().label("count"),
        _fn.avg(TelemetryEvent.latency_ms).label("avg_latency"),
        _fn.sum(
            _case(
                (TelemetryEvent.event_type.in_(["error_console", "error_network"]), 1),
                else_=0,
            )
        ).label("err_count"),
    )
    for f in filters:
        group_q = group_q.filter(f)
    group_q = group_q.group_by(group_col).order_by(_fn.count().desc())

    by_group = []
    for row in group_q.all():
        cnt = int(row.count or 0)
        err_count = int(row.err_count or 0)
        by_group.append({
            "key": row.key or "",
            "count": cnt,
            "avg_latency": float(row.avg_latency) if row.avg_latency is not None else None,
            "error_rate": (err_count / cnt) if cnt else 0.0,
        })

    # Top errors — single focused query that only loads error rows (still
    # bounded; payload signatures are inspected in Python because they vary).
    err_q = db.query(TelemetryEvent.payload).filter(
        TelemetryEvent.event_type.in_(["error_console", "error_network"])
    )
    for f in filters:
        err_q = err_q.filter(f)
    err_q = err_q.limit(5000)

    err_counter: Dict[str, int] = {}
    for (payload,) in err_q.all():
        try:
            p = payload or {}
            sig = (
                p.get("message")
                or p.get("status_code")
                or p.get("url")
                or "unknown"
            )
            sig = str(sig)[:200]
        except Exception:
            sig = "unknown"
        err_counter[sig] = err_counter.get(sig, 0) + 1
    top_errors = [
        {"signature": k, "count": v}
        for k, v in sorted(err_counter.items(), key=lambda kv: -kv[1])[:20]
    ]

    return {
        "success": True,
        "summary": summary,
        "by_group": by_group,
        "top_errors": top_errors,
        "group_by": group_by,
        "filters": {
            "start_date": start_date,
            "end_date": end_date,
            "event_type": event_type,
        },
    }


# ── Feedback Survey Endpoints ────────────────────────────────────────────────

# Allowed enum-ish values for the survey. Anything outside these = 400.
_SURVEY_PMF_ALLOWED = {"very_disappointed", "somewhat", "not"}
_SURVEY_LIKERT_KEYS = {
    "plan_useful",
    "lesson_clarity",
    "latency_ok",
    "smooth",
    "return_next_week",
}
_SURVEY_LANG_ALLOWED = {"en", "zh"}


@app.post("/feedback/submit")
@limiter.limit("30/minute")
async def post_feedback_submit(
    request: Request,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Record a single in-app feedback survey response. Optional auth.

    Auto-derives ``derived_*`` context from telemetry_events keyed on the
    client-provided ``session_id`` (last 24h) so each response is correlated
    to behaviour.
    """
    raw = await request.body()
    if len(raw) > 16 * 1024:
        raise HTTPException(status_code=413, detail="Payload too large")
    try:
        body = json.loads(raw.decode("utf-8") or "{}") if raw else {}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")

    def _trunc_str(v, max_len: int) -> Optional[str]:
        if v is None:
            return None
        if not isinstance(v, str):
            v = str(v)
        return v[:max_len]

    # ---- Validation ---------------------------------------------------------
    pmf_score = body.get("pmf_score")
    if pmf_score is not None and pmf_score not in _SURVEY_PMF_ALLOWED:
        raise HTTPException(status_code=400, detail="Invalid pmf_score")

    nps_raw = body.get("nps")
    nps_val: Optional[int] = None
    if nps_raw is not None:
        try:
            nps_val = int(nps_raw)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid nps")
        if nps_val < 0 or nps_val > 10:
            raise HTTPException(status_code=400, detail="Invalid nps")

    likert_raw = body.get("likert")
    likert_clean: Dict[str, int] = {}
    if likert_raw is not None:
        if not isinstance(likert_raw, dict):
            raise HTTPException(status_code=400, detail="Invalid likert")
        for k, v in likert_raw.items():
            if k not in _SURVEY_LIKERT_KEYS:
                raise HTTPException(status_code=400, detail=f"Invalid likert key: {k}")
            try:
                iv = int(v)
            except Exception:
                raise HTTPException(status_code=400, detail=f"Invalid likert value for {k}")
            if iv < 1 or iv > 5:
                raise HTTPException(status_code=400, detail=f"Invalid likert value for {k}")
            likert_clean[k] = iv

    prior_tools_raw = body.get("prior_tools")
    prior_tools_clean: List[str] = []
    if prior_tools_raw is not None:
        if not isinstance(prior_tools_raw, list):
            raise HTTPException(status_code=400, detail="Invalid prior_tools")
        for item in prior_tools_raw[:12]:
            if not isinstance(item, str):
                continue
            prior_tools_clean.append(item[:64])

    language_raw = body.get("language")
    if language_raw not in _SURVEY_LANG_ALLOWED:
        language_clean = "en"
    else:
        language_clean = language_raw

    session_id = _trunc_str(body.get("session_id"), 255)

    # ---- Auto-derive context from telemetry --------------------------------
    derived_board_lessons: Optional[int] = None
    derived_plans_created: Optional[int] = None
    derived_session_minutes: Optional[int] = None
    if session_id:
        try:
            from datetime import datetime as _dt, timedelta as _td
            from sqlalchemy import func as _fn
            since = _dt.utcnow() - _td(hours=24)

            sess_filter = (
                (TelemetryEvent.session_id == session_id)
                & (TelemetryEvent.created_at >= since)
            )

            derived_board_lessons = int(
                db.query(_fn.count(_fn.distinct(TelemetryEvent.id)))
                .filter(sess_filter)
                .filter(TelemetryEvent.event_type == "board_lesson_open")
                .scalar()
                or 0
            )

            # study_plan_chat_rtt where payload->>'phase' = 'plan_review'.
            # Use raw JSON access on the payload column. Postgres stores it as
            # JSONB, so payload->>'phase' is the safest extractor.
            from sqlalchemy import text as _text
            plan_q = (
                db.query(_fn.count())
                .filter(sess_filter)
                .filter(TelemetryEvent.event_type == "study_plan_chat_rtt")
                .filter(_text("(payload->>'phase') = 'plan_review'"))
            )
            derived_plans_created = int(plan_q.scalar() or 0)

            # Session minutes: max(created_at) - min(created_at) within session.
            ts_row = (
                db.query(
                    _fn.min(TelemetryEvent.created_at).label("first"),
                    _fn.max(TelemetryEvent.created_at).label("last"),
                )
                .filter(sess_filter)
                .one()
            )
            if ts_row and ts_row.first and ts_row.last:
                delta = (ts_row.last - ts_row.first).total_seconds() / 60.0
                derived_session_minutes = int(min(max(delta, 0), 720))
        except Exception as exc:
            logger.warning(f"feedback derive failed: {exc}")

    user_agent = request.headers.get("user-agent")
    client_host = request.client.host if request.client else None

    response_row = SurveyResponse(
        user_id=str(current_user.id) if current_user else None,
        session_id=session_id,
        exam=_trunc_str(body.get("exam"), 64),
        school_year=_trunc_str(body.get("school_year"), 64),
        prior_tools=prior_tools_clean,
        likert=likert_clean,
        pmf_score=pmf_score,
        nps=nps_val,
        pain_point=_trunc_str(body.get("pain_point"), 4000),
        feature_request=_trunc_str(body.get("feature_request"), 4000),
        other_feedback=_trunc_str(body.get("other_feedback"), 4000),
        contact_email=_trunc_str(body.get("contact_email"), 255),
        language=language_clean,
        derived_session_minutes=derived_session_minutes,
        derived_board_lessons=derived_board_lessons,
        derived_plans_created=derived_plans_created,
        user_agent=_trunc_str(user_agent, 512),
        ip_address=_trunc_str(client_host, 45),
    )
    try:
        db.add(response_row)
        db.commit()
        db.refresh(response_row)
    except Exception as exc:
        db.rollback()
        logger.error(f"feedback insert failed: {exc}")
        raise HTTPException(status_code=500, detail="Failed to save feedback")
    return {"ok": True, "id": response_row.id}


@app.get("/admin/feedback")
async def get_admin_feedback(
    limit: int = 50,
    offset: int = 0,
    exam: Optional[str] = None,
    pmf: Optional[str] = None,
    language: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Paginated admin view of feedback responses with optional filters."""
    if (current_user.role or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    from datetime import datetime as _dt
    from sqlalchemy import func as _fn

    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    q = db.query(SurveyResponse)
    try:
        if start_date:
            q = q.filter(SurveyResponse.created_at >= _dt.fromisoformat(start_date))
        if end_date:
            q = q.filter(SurveyResponse.created_at <= _dt.fromisoformat(end_date))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start_date/end_date")
    if exam:
        q = q.filter(SurveyResponse.exam == exam)
    if pmf:
        if pmf not in _SURVEY_PMF_ALLOWED:
            raise HTTPException(status_code=400, detail="Invalid pmf")
        q = q.filter(SurveyResponse.pmf_score == pmf)
    if language:
        q = q.filter(SurveyResponse.language == language)

    total = int(q.with_entities(_fn.count(SurveyResponse.id)).scalar() or 0)
    rows = (
        q.order_by(SurveyResponse.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "total": total,
        "rows": [r.to_dict() for r in rows],
        "limit": limit,
        "offset": offset,
        "filters": {
            "exam": exam,
            "pmf": pmf,
            "language": language,
            "start_date": start_date,
            "end_date": end_date,
        },
    }


@app.get("/admin/feedback/aggregate")
async def get_admin_feedback_aggregate(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregate counters for the feedback survey: PMF, NPS, likert means &
    distributions, exam/language breakdowns. Admin-gated."""
    if (current_user.role or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    from datetime import datetime as _dt
    from sqlalchemy import func as _fn

    filters = []
    try:
        if start_date:
            filters.append(SurveyResponse.created_at >= _dt.fromisoformat(start_date))
        if end_date:
            filters.append(SurveyResponse.created_at <= _dt.fromisoformat(end_date))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start_date/end_date")

    base_q = db.query(SurveyResponse)
    for f in filters:
        base_q = base_q.filter(f)

    total = int(
        db.query(_fn.count(SurveyResponse.id)).filter(*filters).scalar() or 0
    )

    # Exam distribution
    exam_q = (
        db.query(SurveyResponse.exam, _fn.count(SurveyResponse.id))
        .filter(*filters)
        .group_by(SurveyResponse.exam)
    )
    exam_distribution: Dict[str, int] = {}
    for k, c in exam_q.all():
        if k:
            exam_distribution[k] = int(c or 0)

    # Language distribution
    lang_q = (
        db.query(SurveyResponse.language, _fn.count(SurveyResponse.id))
        .filter(*filters)
        .group_by(SurveyResponse.language)
    )
    language_distribution: Dict[str, int] = {}
    for k, c in lang_q.all():
        if k:
            language_distribution[k] = int(c or 0)

    # PMF distribution
    pmf_q = (
        db.query(SurveyResponse.pmf_score, _fn.count(SurveyResponse.id))
        .filter(*filters)
        .group_by(SurveyResponse.pmf_score)
    )
    pmf_counts: Dict[str, int] = {"very_disappointed": 0, "somewhat": 0, "not": 0}
    pmf_total = 0
    for k, c in pmf_q.all():
        if k in pmf_counts:
            pmf_counts[k] = int(c or 0)
            pmf_total += pmf_counts[k]
    very_disappointed_pct = (
        (pmf_counts["very_disappointed"] / pmf_total) if pmf_total else 0.0
    )
    pmf_block: Dict[str, Any] = dict(pmf_counts)
    pmf_block["very_disappointed_pct"] = very_disappointed_pct

    # NPS — bucket on the fly
    nps_rows = (
        db.query(SurveyResponse.nps).filter(*filters).filter(SurveyResponse.nps.isnot(None))
    )
    promoters = passives = detractors = 0
    nps_total = 0
    for (n,) in nps_rows.all():
        if n is None:
            continue
        nps_total += 1
        if n >= 9:
            promoters += 1
        elif n >= 7:
            passives += 1
        else:
            detractors += 1
    promoters_pct = (promoters / nps_total) if nps_total else 0.0
    passives_pct = (passives / nps_total) if nps_total else 0.0
    detractors_pct = (detractors / nps_total) if nps_total else 0.0
    nps_score = (promoters_pct - detractors_pct) * 100.0

    # Likert means + distributions — pull rows in Python because likert is JSON.
    likert_rows_q = (
        db.query(SurveyResponse.likert).filter(*filters).filter(SurveyResponse.likert.isnot(None))
    )
    likert_sum: Dict[str, float] = {k: 0.0 for k in _SURVEY_LIKERT_KEYS}
    likert_count: Dict[str, int] = {k: 0 for k in _SURVEY_LIKERT_KEYS}
    likert_dist: Dict[str, Dict[str, int]] = {
        k: {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0} for k in _SURVEY_LIKERT_KEYS
    }
    for (lk,) in likert_rows_q.all():
        if not isinstance(lk, dict):
            continue
        for key in _SURVEY_LIKERT_KEYS:
            v = lk.get(key)
            try:
                iv = int(v) if v is not None else None
            except Exception:
                iv = None
            if iv is None or iv < 1 or iv > 5:
                continue
            likert_sum[key] += iv
            likert_count[key] += 1
            likert_dist[key][str(iv)] += 1
    likert_means: Dict[str, Optional[float]] = {}
    for key in _SURVEY_LIKERT_KEYS:
        if likert_count[key]:
            likert_means[key] = round(likert_sum[key] / likert_count[key], 2)
        else:
            likert_means[key] = None

    # Date range — actual min/max created_at among matching rows.
    date_row = (
        db.query(
            _fn.min(SurveyResponse.created_at).label("start"),
            _fn.max(SurveyResponse.created_at).label("end"),
        )
        .filter(*filters)
        .one()
    )
    date_range = {
        "start": date_row.start.isoformat() if date_row.start else None,
        "end": date_row.end.isoformat() if date_row.end else None,
    }

    return {
        "total": total,
        "exam_distribution": exam_distribution,
        "language_distribution": language_distribution,
        "pmf": pmf_block,
        "nps": {
            "promoters_pct": promoters_pct,
            "passives_pct": passives_pct,
            "detractors_pct": detractors_pct,
            "score": nps_score,
            "total": nps_total,
        },
        "likert_means": likert_means,
        "likert_distribution": likert_dist,
        "date_range": date_range,
    }


@app.websocket("/ws/board/{session_id}")
async def board_websocket(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for streaming board lesson events in real-time.

    Important: every reject path MUST call `accept()` first and then send a
    structured `error` event before closing with an application close code.
    Closing before `accept()` makes browsers report a generic 'WebSocket
    connection failed' with no code, which prevents the client from
    distinguishing fatal errors from transient drops.
    """
    # Always accept first so close codes / error events reach the browser.
    await websocket.accept()
    print(f"🔌 [ws/board] accepted session={session_id}", flush=True)

    # Reject malformed session_id paths early.
    if not _SESSION_ID_RE.fullmatch(session_id or ""):
        try:
            await websocket.send_json(
                {"event_type": "error", "data": {"error": "Invalid session_id format", "code": 4400}}
            )
        except Exception:
            pass
        try:
            await websocket.close(code=4400)
        except Exception:
            pass
        return

    async def _reject(code: int, reason: str):
        try:
            await websocket.send_json({"event_type": "error", "data": {"error": reason, "code": code}})
        except Exception:
            pass
        try:
            await websocket.close(code=code)
        except Exception:
            pass

    # Authenticate via token query parameter
    token = websocket.query_params.get("token")
    if not token:
        await _reject(4001, "Missing auth token")
        return
    try:
        from auth import verify_token_or_test_bypass
        from database.base import SessionLocal
        with SessionLocal() as db:
            db_user = verify_token_or_test_bypass(token, db)
        resolved_user_id = db_user.id
    except Exception as exc:
        logger.warning(f"[ws/board] token decode failed: {exc}")
        print(f"🔌 [ws/board] token rejected session={session_id} error={exc}", flush=True)
        await _reject(4001, "Token rejected — sign in again and reload")
        return

    session = _board_sessions.get(session_id)

    # Resurrect from DB if the in-memory session has been garbage-collected.
    if not session:
        from database.base import SessionLocal as _SL
        with _SL() as _db:
            loaded = _board_load_state(_db, session_id, user_id=str(resolved_user_id))
        if loaded and not loaded.get("__forbidden__"):
            conv = loaded.get("conversation_state") or []
            board_meta = loaded.get("board_metadata") or {}
            config = loaded.get("config") or {}

            from core.board.state_manager import BoardStateManager
            from core.board.models import BoardState
            state_mgr = BoardStateManager()
            try:
                board_state = BoardState.from_dict(board_meta)
                state_mgr._state = board_state
            except Exception:
                state_mgr.create_board(
                    title=config.get("topic", ""),
                    layout=board_meta.get("layout", "full_canvas"),
                    background=board_meta.get("background", "dark_board"),
                    topic=config.get("topic", ""),
                )

            from mcp.board_server import BoardMCPServer
            board_server = BoardMCPServer(state_manager=state_mgr)

            persisted_status = loaded.get("status", "generating")
            if conv and persisted_status != "done":
                session = {
                    "state_manager": state_mgr,
                    "board_server": board_server,
                    "config": config,
                    "user_id": resolved_user_id,
                    "plan_id": loaded.get("plan_id"),
                    "unit_id": loaded.get("unit_id"),
                    "status": "generating",
                    "audio_queue": loaded.get("audio_queue", []),
                    "chat_history": loaded.get("chat_history", []),
                    "_conversation_state": conv,
                }
                _board_sessions[session_id] = session
                logger.info(f"[ws/board] Resurrected session {session_id} from DB with conversation state")
            else:
                try:
                    await websocket.send_json({
                        "event_type": "session_state",
                        "timestamp": time.time(),
                        "data": loaded,
                    })
                    await websocket.send_json({
                        "event_type": "done",
                        "timestamp": time.time(),
                        "data": {"message": "Session is read-only. Start a new lesson to continue."},
                    })
                except Exception:
                    pass
                try:
                    await websocket.close(code=1000)
                except Exception:
                    pass
                return
        else:
            print(f"🔌 [ws/board] missing session={session_id} user={resolved_user_id}", flush=True)
            await _reject(4004, "Lesson session expired or was cleared. Start a new lesson.")
            return

    if str(session.get("user_id")) != str(resolved_user_id):
        print(f"🔌 [ws/board] forbidden session={session_id} user={resolved_user_id}", flush=True)
        await _reject(4003, "You are not allowed to view this lesson session.")
        return

    # After disconnection, if the session had LLM conversation state saved we
    # can resume the stream.  "done" means the generator finished naturally —
    # everything else should resume.
    existing_status = session.get("status")
    conv_state = session.get("_conversation_state") or None
    if not conv_state and existing_status == "done":
        state_dict = _board_session_to_state_dict(session, status=existing_status)
        try:
            await websocket.send_json({
                "event_type": "session_state",
                "timestamp": time.time(),
                "data": state_dict,
            })
            await websocket.send_json({
                "event_type": "done",
                "timestamp": time.time(),
                "data": {},
            })
        except WebSocketDisconnect:
            return
        except Exception:
            pass
        try:
            while True:
                try:
                    await asyncio.wait_for(websocket.receive_json(), timeout=30)
                except asyncio.TimeoutError:
                    continue
        except WebSocketDisconnect:
            pass
        return

    session["status"] = "streaming"
    config = session["config"]
    from mcp.board_server import BoardMCPServer
    from mcp.agent_tools import AgentToolsServer
    from core.streaming.lesson_generator import StreamingLessonGenerator
    from core.streaming.tts_sync import BoardTTSSync
    board_server: BoardMCPServer = session["board_server"]
    agent_server = AgentToolsServer()

    # Resume from saved conversation state if available.
    resume_messages = session.get("_conversation_state") or None

    generator = StreamingLessonGenerator(
        board_server=board_server, agent_tools_server=agent_server
    )
    tts_sync = BoardTTSSync(language="zh-CN" if config["language"] == "zh" else "en-US")

    paused = False

    # Initial durable save so that even an early disconnect leaves a row.
    await _persist_board_session_safe(session_id, session, status="generating")

    # Running counter shared with the disconnect/cleanup paths below so the
    # persisted last_event_seq reflects monotonic progress, not in-memory
    # event_log length (which resets on server restart).
    emitted_counter = {"n": 0}

    async def _send_events():
        nonlocal paused
        # When resuming, first send the current board snapshot so the client
        # can immediately render previously generated content (elements,
        # narration, chat) while the LLM continues.
        if resume_messages:
            state_dict = _board_session_to_state_dict(session, status="generating")
            try:
                await websocket.send_json({
                    "event_type": "session_state",
                    "timestamp": time.time(),
                    "data": state_dict,
                })
            except WebSocketDisconnect:
                return
            except Exception:
                pass

        board_stream = generator.generate_lesson(
            topic=config["topic"],
            language=config["language"],
            student_level=config["student_level"],
            duration_minutes=config["duration_minutes"],
            custom_requirements=config.get("custom_requirements"),
            resume_messages=resume_messages,
        )
        tts_stream = tts_sync.stream_with_tts(board_stream)

        try:
            async for event in tts_stream:
                while paused:
                    await asyncio.sleep(0.1)
                try:
                    await websocket.send_json(event.to_dict())
                except WebSocketDisconnect:
                    await _persist_board_session_safe(
                        session_id, session, status="paused",
                        last_event_seq=emitted_counter["n"],
                        conversation_state=generator._current_messages,
                    )
                    return
                except Exception as e:
                    logger.error(f"Error sending board event: {e}")
                    await _persist_board_session_safe(
                        session_id, session, status="error",
                        last_event_seq=emitted_counter["n"],
                        conversation_state=generator._current_messages,
                    )
                    return
                if event.event_type == "audio_ready":
                    session.setdefault("audio_queue", []).append(event.to_dict())
                if event.event_type == "element_added" and event.data.get("narration"):
                    session.setdefault("chat_history", []).append({
                        "role": "assistant",
                        "text": event.data["narration"],
                        "timestamp": event.timestamp,
                    })
                emitted_counter["n"] += 1
                if emitted_counter["n"] % 5 == 0:
                    await _persist_board_session_safe(
                        session_id, session, status="generating",
                        last_event_seq=emitted_counter["n"],
                        conversation_state=generator._current_messages,
                    )
        except Exception as exc:
            logger.exception("[ws/board] lesson stream crashed")
            print(f"🔌 [ws/board] stream crashed session={session_id} error={exc}", flush=True)
            try:
                await websocket.send_json({
                    "event_type": "error",
                    "timestamp": time.time(),
                    "data": {"error": f"Board lesson failed: {exc}"},
                })
            except Exception:
                pass
            await _persist_board_session_safe(
                session_id, session, status="error",
                last_event_seq=emitted_counter["n"],
                conversation_state=generator._current_messages,
            )
            return

        # Auto-generate summary the moment the lesson stream finishes so the
        # client receives it without a follow-up HTTP round-trip.
        try:
            from core.board.summarizer import summarize_session
            state_mgr = session["state_manager"]
            summary_dict = await summarize_session(
                state_mgr, language=config.get("language", "zh")
            )
            session["cached_summary"] = summary_dict
            markdown = (
                summary_dict.get("summary_markdown")
                or summary_dict.get("fallback_summary")
                or ""
            )
            if markdown:
                try:
                    await websocket.send_json({
                        "event_type": "summary_ready",
                        "timestamp": time.time(),
                        "data": {"summary": markdown},
                    })
                except WebSocketDisconnect:
                    await _persist_board_session_safe(
                        session_id, session, status="done",
                        last_event_seq=emitted_counter["n"],
                        conversation_state=generator._current_messages,
                    )
                    return
        except Exception as exc:
            logger.warning(f"Auto-summary generation failed: {exc}")

        try:
            await websocket.send_json(
                {"event_type": "done", "timestamp": time.time(), "data": {}}
            )
        except WebSocketDisconnect:
            await _persist_board_session_safe(
                session_id, session, status="done",
                last_event_seq=emitted_counter["n"],
                conversation_state=generator._current_messages,
            )
            return
        except Exception as e:
            logger.debug(f"Could not send done event: {e}")

        await _persist_board_session_safe(
            session_id, session, status="done",
            last_event_seq=emitted_counter["n"],
            conversation_state=generator._current_messages,
        )

    send_task = asyncio.create_task(_send_events())

    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_json(), timeout=0.5)
                action = msg.get("action")
                if action == "pause":
                    paused = True
                elif action == "resume":
                    paused = False
                elif action == "user_message":
                    text = (msg.get("text") or "").strip()
                    if text:
                        try:
                            await websocket.send_json({
                                "event_type": "user_message",
                                "timestamp": time.time(),
                                "data": {"text": text},
                            })
                        except Exception as exc:
                            logger.debug(f"Could not echo user_message: {exc}")
                        # Persist chat on server so reconnect doesn't lose it
                        session.setdefault("chat_history", []).append({
                            "role": "user",
                            "text": text,
                            "timestamp": time.time(),
                        })
                        generator.enqueue_user_message(text)
            except asyncio.TimeoutError:
                if send_task.done():
                    break
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        pass
    finally:
        send_task.cancel()
        try:
            await send_task
        except asyncio.CancelledError:
            pass
        # Preserve mid-stream status — don't overwrite "paused" set by the
        # internal disconnect handler in _send_events.
        current = session.get("status")
        if current not in ("paused", "error"):
            session["status"] = "completed"
        # Persist conversation state on the in-memory session so a reconnect
        # can find it without hitting the DB again.
        if generator._current_messages:
            session["_conversation_state"] = generator._current_messages
        await _persist_board_session_safe(
            session_id,
            session,
            status=session.get("status"),
            last_event_seq=emitted_counter["n"],
            conversation_state=generator._current_messages,
        )
        asyncio.create_task(_delayed_session_cleanup(session_id, 600))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
