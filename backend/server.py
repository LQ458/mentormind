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
from pydantic import BaseModel, EmailStr
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
from database.models.user import User
from auth import get_current_user, get_optional_user
from config import config
from core.asr import transcribe_with_local_model, get_asr_status, extract_text_with_paddleocr

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


async def summarize_extracted_content(text: str, source_type: str = "text") -> str:
    """Summarize extracted OCR or ASR text using AI for better UI display."""
    if not text or len(text.strip()) < 10:
        return text

    from services.api_client import api_client
    prompt = f"Please provide a very concise summary (one sentence, max 20 words) of the following {source_type} content extracted from a student's upload. This summary will be shown in a 'Learning Context' sidebar. If the content is in Chinese, summarize in Chinese. If in English, summarize in English.\n\nContent:\n{text[:2000]}"

    try:
        messages = [{"role": "user", "content": prompt}]
        response = await api_client.deepseek.chat_completion(messages=messages, max_tokens=100)
        if response.success and response.data:
            summary = response.data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            return summary
    except Exception as e:
        print(f"⚠️ Summary failed: {e}")

    return text[:60] + "..."


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
async def analyze_topics(request: Dict[str, Any]):
    """Analyze student query to identify learning topics"""
    try:
        query = request.get("studentQuery", "")
        language = request.get("language", "zh")
        
        if not query:
            raise HTTPException(status_code=400, detail="studentQuery is required")
            
        creator = ClassCreator()
        topics = await creator.analyze_student_query(query)
        
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
async def create_class(request: ClassCreationRequest):
    """Initiate class creation job"""
    try:
        job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Determine language code for Celery
        lang_code = request.language.value if hasattr(request.language, 'value') else request.language
        
        request_data = {
            "topic": request.topic,
            "language": lang_code,
            "student_level": request.student_level,
            "duration_minutes": request.duration_minutes,
            "include_video": request.include_video,
            "include_exercises": request.include_exercises,
            "include_assessment": request.include_assessment,
            "voice_id": request.voice_id
        }
        
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
        return json.loads(result_json)
        
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
                yield f"data: {result_json}\n\n"
                break
                
            task_result = AsyncResult(job_id, app=celery_app)
            status = task_result.status.lower()
            
            if status != last_status:
                data = {"status": status, "job_id": job_id}
                if status == "failure":
                    data["error"] = str(task_result.result)
                    yield f"data: {json.dumps(data)}\n\n"
                    break
                yield f"data: {json.dumps(data)}\n\n"
                last_status = status
                
            if status in ["success", "failure", "revoked"]:
                break
                
            await asyncio.sleep(2)
            
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
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Transcribe user-uploaded audio (ASR)."""
    try:
        # Validate file type
        allowed_types = {"audio/wav", "audio/mpeg", "audio/mp4", "audio/ogg",
                         "audio/flac", "audio/x-m4a", "audio/webm"}
        if file.content_type and file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {file.content_type}")

        suffix = os.path.splitext(file.filename or ".wav")[1] or ".wav"
        
        # Check file size (approx 10MB as threshold for async)
        file.file.seek(0, os.SEEK_END)
        file_size = file.file.tell()
        file.file.seek(0)
        is_long_file = file_size > 10 * 1024 * 1024 # 10MB
        
        # Determine job_id
        job_id = f"asr_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        try:
            # If it's a long file and only transcription is requested (process=false),
            # dispatch to Celery transcribe_audio_task instead of running in-process.
            if is_long_file and process.lower() != "true":
                print(f"📦 Long file detected ({file_size/1024/1024:.1f}MB), dispatching async transcription: {job_id}")
                task = transcribe_audio_task.delay(tmp_path, language, job_id)
                return {
                    "success": True,
                    "status": "processing",
                    "job_id": task.id,
                    "message": "Long audio detected. Transcription started in background.",
                    "language": language,
                }

            # Normal in-process transcription for short files
            if process.lower() != "true":
                full_text = await transcribe_with_local_model(tmp_path, language)
                print(f"✅ ASR transcription complete: {len(full_text)} chars")
                summary = await summarize_extracted_content(full_text, "audio")
                return {
                    "success": True,
                    "text": full_text,
                    "summary": summary,
                    "language": language,
                }

            # Option B: dispatch to Celery for lesson generation
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
            if current_user:
                request_data["user_id"] = str(current_user.id)
            task = transcript_to_lesson_task.delay(full_text, request_data, job_id)
            return {
                "success": True,
                "status": "processing",
                "job_id": task.id,
                "message": "Lesson generation queued.",
                "language": language,
            }
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    except Exception as e:
        print(f"❌ Error transcribing audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/image")
async def ingest_image(
    file: UploadFile = File(...),
    language: str = Form(default="zh")
):
    """Extract text from user-uploaded image using PaddleOCR."""
    try:
        allowed_types = {"image/jpeg", "image/png", "image/bmp", "image/tiff",
                         "image/webp", "application/pdf"}
        if file.content_type and file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {file.content_type}")

        suffix = os.path.splitext(file.filename or ".jpg")[1] or ".jpg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        try:
            ocr = await asyncio.get_event_loop().run_in_executor(None, extract_text_with_paddleocr, tmp_path)
            full_text = ocr.get("text", "")
            summary = await summarize_extracted_content(full_text, "image")

            return {
                "success": True,
                "text": full_text,
                "summary": summary,
                "language": language
            }
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    except Exception as e:
        print(f"❌ OCR failed: {e}")
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
        lessons, total = lesson_storage.get_all_lessons(user_id=str(current_user.id))
        return {"success": True, "results": lessons, "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)