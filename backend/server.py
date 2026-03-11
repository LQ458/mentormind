"""
MentorMind Backend Server
Production API with bilingual support and clean organization
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Dict, Any, List

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
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
from celery_app import create_class_video_task, transcript_to_lesson_task, celery_app
from database import LessonStorageSQL, init_database
from config import config

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


# ── Lazy-loaded AI models (loaded on first use) ───────────────────────────────
import threading
_funasr_models = {}  # keyed by language code ("zh")
_whisper_model = None  # for English ASR
_whisper_lock = threading.Lock()  # Whisper is NOT thread-safe; serialize inference calls
_paddleocr_model = None

def _get_whisper():
    """Return Whisper base model for English ASR (~140MB, low memory usage)."""
    global _whisper_model
    if _whisper_model is None:
        try:
            import whisper
            print("⏳ Loading Whisper base model for English (~140MB)...")
            _whisper_model = whisper.load_model("base")
            print("✅ Whisper base model loaded")
        except ImportError:
            raise RuntimeError("openai-whisper not installed. Run: pip install openai-whisper")
        except Exception as e:
            raise RuntimeError(f"Whisper model load error: {e}")
    return _whisper_model

def _get_funasr(language: str = "zh"):
    """Return ASR model for the given language.
    English → Whisper base (low memory, ~500MB RAM).
    Chinese → FunASR paraformer-zh.
    """
    global _funasr_models
    lang_key = "en" if language in ("en", "en-US", "en-GB") else "zh"
    if lang_key == "en":
        return _get_whisper()  # use whisper for English; paraformer-en is too large for 7.5GB server
    if lang_key not in _funasr_models:
        try:
            from funasr import AutoModel
            print("⏳ Loading FunASR Chinese model (paraformer-zh, first run downloads ~500MB)...")
            _funasr_models[lang_key] = AutoModel(
                model="paraformer-zh",
                vad_model="fsmn-vad",
                punc_model="ct-punc",
                disable_update=True,
            )
            print(f"✅ FunASR {lang_key} model loaded")
        except ImportError:
            raise RuntimeError("funasr not installed. Run: pip install funasr modelscope")
        except Exception as e:
            raise RuntimeError(f"FunASR model load error: {e}")
    return _funasr_models[lang_key]

def _get_paddleocr():
    global _paddleocr_model
    if _paddleocr_model is None:
        try:
            from paddleocr import PaddleOCR
            print("⏳ Loading PaddleOCR model...")
            _paddleocr_model = PaddleOCR(use_angle_cls=True, lang="ch", use_gpu=False, show_log=False)
            print("✅ PaddleOCR model loaded")
        except ImportError:
            raise RuntimeError("paddleocr not installed. Run: pip install paddleocr paddlepaddle")
        except Exception as e:
            raise RuntimeError(f"PaddleOCR model load error: {e}")
    return _paddleocr_model
# ─────────────────────────────────────────────────────────────────────────────

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

# Mount static files (audio/video)
if os.path.exists(config.DATA_DIR):
    app.mount("/api/files", StaticFiles(directory=config.DATA_DIR), name="files")
    print(f"📂 Mounted static files from: {config.DATA_DIR}")
else:
    print(f"⚠️ Data directory not found: {config.DATA_DIR}")

@app.on_event("startup")
async def preload_models():
    """Pre-load AI models on startup to avoid OOM during user requests."""
    import asyncio
    preload_lang = os.getenv("PRELOAD_ASR_LANG", "en")
    if preload_lang.lower() == "none":
        print("⏭️ ASR model preload skipped (PRELOAD_ASR_LANG=none)")
        return
    print(f"⏳ Pre-loading ASR model for language: '{preload_lang}' ...")
    try:
        await asyncio.get_event_loop().run_in_executor(None, lambda: _get_funasr(preload_lang))
        lang_key = "en" if preload_lang in ("en", "en-US", "en-GB") else "zh"
        model_name = "Whisper base" if lang_key == "en" else "FunASR paraformer-zh"
        print(f"✅ {model_name} '{preload_lang}' model ready")
    except Exception as e:
        print(f"⚠️ FunASR preload failed (service will still start): {e}")


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "ok", 
        "service": "MentorMind Backend API",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/status")
async def get_status():
    """Get detailed system status — probes each service"""
    import aiohttp
    import ssl

    funasr_endpoint = os.getenv("FUNASR_ENDPOINT", "http://localhost:10095")
    paddle_endpoint = os.getenv("PADDLE_OCR_ENDPOINT", "http://localhost:8866")
    deepseek_key = os.getenv("DEEPSEEK_API_KEY", "")

    async def probe(url: str) -> str:
        try:
            connector = aiohttp.TCPConnector(ssl=False)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=2)) as r:
                    return "online" if r.status < 500 else "offline"
        except Exception:
            return "offline"

    funasr_status, paddle_status = await asyncio.gather(
        probe(funasr_endpoint),
        probe(paddle_endpoint),
    )

    return {
        "status": "running",
        "service": "MentorMind Backend",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "deepseek": "configured" if deepseek_key else "missing_key",
            "funasr": funasr_status,
            "paddle_ocr": paddle_status,
            "tts": "active",
            "ai_lessons": "active",
        },
        "subscription": {
            "plan": "Pro",
            "monthly_cost": 29.99,
            "lessons_included": 1000,
            "lessons_used": 0,
            "lessons_remaining": 1000,
            "cost_this_month": 0.00,
            "renewal_date": (datetime.now().replace(day=1) if datetime.now().day > 1 else datetime.now()).isoformat()
        }
    }



@app.get("/languages")
async def get_languages():
    """Get supported languages"""
    return {
        "languages": [
            {"code": "zh", "name": "Chinese", "native_name": "中文"},
            {"code": "en", "name": "English", "native_name": "English"},
            {"code": "ja", "name": "Japanese", "native_name": "日本語"},
            {"code": "ko", "name": "Korean", "native_name": "한국어"}
        ],
        "default": "zh"
    }

@app.get("/voices")
async def get_voices():
    """Get available TTS voices"""
    try:
        tts = TTSSynthesizer()
        voices = tts.get_available_voices()
        return {
            "success": True,
            "voices": voices,
            "count": len(voices)
        }
    except Exception as e:
        print(f"❌ Error getting voices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-topics")
async def analyze_topics(request: Dict[str, Any]):
    """Analyze student query and generate learning topics with bilingual support"""
    try:
        student_query = request.get("studentQuery", "")
        language = request.get("language", "zh").lower()
        
        if not student_query:
            raise HTTPException(status_code=400, detail="studentQuery is required")
        
        print(f"🔍 Analyzing topics: '{student_query}' (lang: {language})")
        
        # Initialize class creator
        creator = ClassCreator()
        
        # Generate topics using AI with full bilingual support
        enhanced_topics = await creator.analyze_student_query(student_query, language)
        
        print(f"✅ Generated {len(enhanced_topics)} topics")
        return {
            "success": True,
            "topics": enhanced_topics,
            "query": student_query,
            "language": language,
            "timestamp": datetime.now().isoformat(),
            "bilingual_support": True
        }
        
    except Exception as e:
        print(f"❌ Error analyzing topics: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/create-class")
async def create_class(request: Dict[str, Any]):
    """Create class/lesson with full support"""
    try:
        # Extract request data
        topic = request.get("topic", "")
        language = request.get("language", "zh").lower()
        student_level = request.get("studentLevel", "beginner")
        duration_minutes = request.get("durationMinutes", 30)
        include_video = request.get("includeVideo", True)
        include_exercises = request.get("includeExercises", True)
        include_assessment = request.get("includeAssessment", True)
        custom_requirements = request.get("customRequirements")
        target_audience = request.get("targetAudience", "students")
        difficulty_level = request.get("difficultyLevel", "intermediate")
        voice_id = request.get("voiceId", "anna")
        
        if not topic:
            raise HTTPException(status_code=400, detail="topic is required")
        
        print(f"🎓 Creating class: '{topic}' (lang: {language}, level: {student_level}, voice: {voice_id})")
        
        # Dispatch to Celery Queue instead of processing synchronously
        job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        task = create_class_video_task.delay(request, job_id)
        
        # Return job ID immediately to avoid HTTP timeout
        response = {
            "success": True,
            "job_id": task.id,
            "status": "pending",
            "message": "Video generation queued successfully.",
            "topic": topic
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"❌ Error queuing class: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/job-status/{job_id}")
async def get_job_status(job_id: str):
    """Poll for the status of a class generation job.
    
    Uses a direct Redis key (set by the worker) as the primary source of truth,
    falling back to Celery's AsyncResult only to check if the task is still running.
    """
    try:
        import redis as _redis
        redis_url = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
        r = _redis.Redis.from_url(redis_url, decode_responses=True)
        
        # 1. Check direct Redis key first (most reliable)
        result_json = r.get(f"job_result:{job_id}")
        if result_json:
            print(f"✅ [job-status] Found direct Redis result for job_id={job_id}")
            result_data = json.loads(result_json)
            return {"status": "completed", "result": result_data}
        
        # 2. Fall back to Celery AsyncResult to check if task is still running
        task_result = AsyncResult(job_id, app=celery_app)
        print(f"🔍 [job-status] Polling job_id={job_id} | celery_state={task_result.state}")
        
        if task_result.state == 'FAILURE':
            print(f"❌ [job-status] Job FAILED: {task_result.info}")
            return {"status": "failed", "error": str(task_result.info)}
        elif task_result.state == 'STARTED':
            return {"status": "processing"}
        else:
            # PENDING or any other state - task hasn't finished yet
            return {"status": "pending"}
            
    except Exception as e:
        print(f"❌ Error polling job status: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/job-stream/{job_id}")
async def stream_job_status(job_id: str):
    """
    Server-Sent Events (SSE) endpoint to stream job status updates.
    The client maintains a single connection, and the server pushes updates.
    """
    async def event_generator():
        import redis as _redis
        redis_url = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
        r = _redis.Redis.from_url(redis_url, decode_responses=True)
        
        try:
            # Send initial connection success event
            yield f"data: {json.dumps({'status': 'connected', 'message': 'SSE connection established'})}\n\n"
            
            poll_count = 0
            while True:
                # 1. Check direct Redis key first (most reliable)
                result_json = r.get(f"job_result:{job_id}")
                if result_json:
                    print(f"✅ [job-stream] Found direct Redis result for job_id={job_id}")
                    result_data = json.loads(result_json)
                    yield f"data: {json.dumps({'status': 'completed', 'result': result_data})}\n\n"
                    break
                
                # 2. Fall back to Celery AsyncResult to check state
                task_result = AsyncResult(job_id, app=celery_app)
                
                # Every 10 seconds, print a debug log so we don't spam terminal
                if poll_count % 5 == 0:
                    print(f"🔄 [job-stream] Streaming job_id={job_id} | celery_state={task_result.state}")
                
                if task_result.state == 'FAILURE':
                    print(f"❌ [job-stream] Job FAILED: {task_result.info}")
                    yield f"data: {json.dumps({'status': 'failed', 'error': str(task_result.info)})}\n\n"
                    break
                elif task_result.state == 'STARTED':
                    yield f"data: {json.dumps({'status': 'processing'})}\n\n"
                elif task_result.state == 'PENDING':
                    yield f"data: {json.dumps({'status': 'pending'})}\n\n"
                    
                poll_count += 1
                await asyncio.sleep(2)  # Stream an event every 2 seconds
                
        except asyncio.CancelledError:
            print(f"⚠️ [job-stream] Client disconnected for job_id={job_id}")
            raise
        except Exception as e:
            print(f"❌ [job-stream] Error: {e}")
            yield f"data: {json.dumps({'status': 'failed', 'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/ingest/audio")
async def ingest_audio(
    file: UploadFile = File(...),
    language: str = Form(default="zh"),
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
):
    """Transcribe user-uploaded audio (ASR).

    When `process=true`, the transcription is immediately dispatched to a
    Celery worker that generates a full structured lesson from the transcript.
    The endpoint returns instantly with a `job_id` that the client polls via
    GET /job-status/{job_id}.

    When `process=false` (default), the raw transcript text is returned
    synchronously (same behaviour as before).
    """
    try:
        # Validate file type
        allowed_types = {"audio/wav", "audio/mpeg", "audio/mp4", "audio/ogg",
                         "audio/flac", "audio/x-m4a", "audio/webm"}
        if file.content_type and file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported audio format: {file.content_type}"
            )

        # Save upload to a temp file
        suffix = os.path.splitext(file.filename or ".wav")[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        try:
            lang_key = "en" if language in ("en", "en-US", "en-GB") else "zh"
            model = await asyncio.get_event_loop().run_in_executor(None, lambda: _get_funasr(language))

            if lang_key == "en":
                # Whisper is not thread-safe; acquire lock before inference
                def _whisper_transcribe(path):
                    with _whisper_lock:
                        return model.transcribe(path)
                result_raw = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: _whisper_transcribe(tmp_path)
                )
                full_text = result_raw.get("text", "").strip()
            else:
                # FunASR paraformer-zh
                result = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: model.generate(input=tmp_path, batch_size_s=60)
                )
                full_text = " ".join(r["text"] for r in (result or []) if r.get("text", "").strip())

            print(f"✅ ASR transcription complete: {len(full_text)} chars")

            # ── Option A: return raw transcript ────────────────────────────
            if process.lower() != "true":
                return {
                    "success": True,
                    "text": full_text,
                    "language": language,
                }

            # ── Option B: dispatch to Celery for lesson generation ─────────
            job_id = f"audio_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
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
            task = transcript_to_lesson_task.delay(full_text, request_data, job_id)
            print(f"✅ Dispatched transcript_to_lesson task: {task.id}")
            return {
                "success": True,
                "status": "processing",
                "job_id": task.id,
                "transcript_chars": len(full_text),
                "message": "Transcript captured. Lesson generation queued.",
                "language": language,
            }

        finally:
            os.unlink(tmp_path)

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error transcribing audio: {e}")
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")



@app.post("/ingest/image")
async def ingest_image(
    file: UploadFile = File(...),
    language: str = Form(default="zh")
):
    """Extract text from user-uploaded image/slide using PaddleOCR (in-process)."""
    try:
        allowed_types = {"image/jpeg", "image/png", "image/bmp", "image/tiff",
                         "image/webp", "application/pdf"}
        if file.content_type and file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported image format: {file.content_type}"
            )

        suffix = os.path.splitext(file.filename or ".jpg")[1] or ".jpg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        try:
            ocr = await asyncio.get_event_loop().run_in_executor(None, _get_paddleocr)
            result = await asyncio.get_event_loop().run_in_executor(
                None, lambda: ocr.ocr(tmp_path, cls=True)
            )
            lines = []
            for block in (result or []):
                for line in (block or []):
                    if line and len(line) >= 2:
                        text, conf = line[1]
                        if text.strip():
                            lines.append(text)
            full_text = "\n".join(lines)
            print(f"✅ PaddleOCR complete: {len(lines)} lines, {len(full_text)} chars")
            return {
                "success": True,
                "text": full_text,
                "regions": len(lines),
                "language": language
            }
        finally:
            os.unlink(tmp_path)

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error extracting image text: {e}")
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")



@app.post("/teach")
async def teach_endpoint(request: Dict[str, Any]):
    """Teaching endpoint for Next.js API route compatibility"""
    try:
        student_query = request.get("studentQuery", "")
        mode = request.get("mode", "batch")
        
        if not student_query:
            raise HTTPException(status_code=400, detail="studentQuery is required")
        
        print(f"🎓 Teaching query: '{student_query}' (mode: {mode})")
        
        # Initialize class creator
        creator = ClassCreator()
        
        # Analyze the query first
        topics = await creator.analyze_student_query(student_query)
        
        # Return teaching response
        return {
            "success": True,
            "student_query": student_query,
            "mode": mode,
            "topics": topics,
            "teaching_plan": "Generated based on student query",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"❌ Error in teach endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/results")
async def get_results_get():
    """Get all saved lessons (GET endpoint for frontend compatibility)"""
    try:
        # Get all lessons from storage (handles both PostgreSQL and file-based)
        lessons_result = lesson_storage.get_all_lessons()
        
        # Handle different storage return types
        if isinstance(lessons_result, tuple):  # PostgreSQL returns (lessons, total_count)
            lessons, total_count = lessons_result
            # Lessons are already formatted by PostgreSQL storage
            formatted_lessons = lessons
        else:  # File-based storage returns list of LessonMetadata objects
            lessons = lessons_result
            total_count = len(lessons)
            # Format lessons for frontend
            formatted_lessons = []
            for lesson in lessons:
                formatted_lessons.append({
                    "id": lesson.id,
                    "timestamp": lesson.timestamp,
                    "query": lesson.query,
                    "lesson_title": lesson.class_title,
                    "quality_score": lesson.quality_score,
                    "cost_usd": lesson.cost_usd,
                    "language": lesson.language,
                    "student_level": lesson.student_level,
                    "duration_minutes": lesson.duration_minutes
                })
            # Sort by timestamp (newest first)
            formatted_lessons.sort(key=lambda x: x["timestamp"], reverse=True)
        
        return {
            "success": True,
            "results": formatted_lessons,
            "total": total_count,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"❌ Error getting results from storage: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/results")
async def get_results_post(request: Dict[str, Any]):
    """Get all saved lessons (POST endpoint)"""
    try:
        # Get all lessons from storage (handles both PostgreSQL and file-based)
        lessons_result = lesson_storage.get_all_lessons()
        
        # Handle different storage return types
        if isinstance(lessons_result, tuple):  # PostgreSQL returns (lessons, total_count)
            lessons, total_count = lessons_result
            # Lessons are already formatted by PostgreSQL storage
            formatted_lessons = lessons
        else:  # File-based storage returns list of LessonMetadata objects
            lessons = lessons_result
            total_count = len(lessons)
            # Format lessons for frontend
            formatted_lessons = []
            for lesson in lessons:
                formatted_lessons.append({
                    "id": lesson.id,
                    "timestamp": lesson.timestamp,
                    "query": lesson.query,
                    "lesson_title": lesson.class_title,
                    "quality_score": lesson.quality_score,
                    "cost_usd": lesson.cost_usd,
                    "language": lesson.language,
                    "student_level": lesson.student_level,
                    "duration_minutes": lesson.duration_minutes
                })
            # Sort by timestamp (newest first)
            formatted_lessons.sort(key=lambda x: x["timestamp"], reverse=True)
        
        return {
            "success": True,
            "results": formatted_lessons,
            "total": total_count,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"❌ Error getting results from storage: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/lessons/{lesson_id}")
async def get_lesson_detail(lesson_id: str):
    """Get full details for a specific lesson"""
    try:
        lesson = lesson_storage.get_lesson(lesson_id)
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
            
        return {
            "success": True,
            "lesson": lesson,
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error getting lesson details: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/lessons")
async def delete_all_lessons():
    """Delete ALL lessons (Hard Delete)"""
    try:
        lesson_storage.clear_all_lessons()
        return {
            "success": True, 
            "message": "All lessons deleted",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"❌ Error deleting all lessons: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/lessons/{lesson_id}")
async def delete_lesson(lesson_id: str):
    """Delete a lesson by ID"""
    try:
        print(f"🗑️ Deleting lesson: {lesson_id}")
        success = lesson_storage.delete_lesson(lesson_id)
        if not success:
            raise HTTPException(status_code=404, detail="Lesson not found")
            
        return {
            "success": True,
            "message": f"Lesson {lesson_id} deleted successfully",
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error deleting lesson: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/config")
async def get_config():
    """Get system configuration"""
    return {
        "ai_provider": getattr(config, 'AI_PROVIDER', 'unknown'),
        "model": getattr(config, 'MODEL', 'unknown'),
        "max_tokens": getattr(config, 'MAX_TOKENS', 2000),
        "temperature": getattr(config, 'TEMPERATURE', 0.7),
        "timeout": getattr(config, 'TIMEOUT', 30),
        "bilingual_support": True,
        "supported_languages": ["zh", "en", "ja", "ko"],
        "api_key_configured": bool(getattr(config, 'API_KEY', None))
    }

if __name__ == "__main__":
    print("🚀 Starting MentorMind Backend Server...")
    print("=====================================")
    print("🌐 API: http://localhost:8000")
    print("📚 Endpoints:")
    print("  GET  /               - Health check")
    print("  GET  /status         - System status") 
    print("  GET  /languages      - Supported languages")
    print("  POST /analyze-topics - Analyze topics")
    print("  POST /create-class   - Create class")
    print("  POST /ingest/audio   - FunASR audio transcription")
    print("  POST /ingest/image   - PaddleOCR text extraction")
    print("  GET  /config         - Configuration")
    print("=====================================")
    
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)