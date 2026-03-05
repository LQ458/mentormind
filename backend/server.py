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
from fastapi.responses import JSONResponse
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
from celery_app import create_class_video_task, celery_app
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

app = FastAPI(
    title="MentorMind API",
    description="Production backend API for MentorMind educational platform",
    version="2.0.0"
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
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
    """Get detailed system status"""
    return {
        "status": "running",
        "service": "MentorMind Backend",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat(),
        "endpoints": [
            "GET  /",
            "GET  /status", 
            "GET  /languages",
            "POST /analyze-topics",
            "POST /create-class",
            "GET  /config"
        ],
        "features": [
            "Bilingual support (Chinese/English)",
            "AI-powered topic analysis",
            "Class generation",
            "Real-time processing"
        ]
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
    """Poll for the status of a class generation job"""
    try:
        task_result = AsyncResult(job_id, app=celery_app)
        
        if task_result.state == 'PENDING':
            return {"status": "pending"}
        elif task_result.state == 'FAILURE':
            return {"status": "failed", "error": str(task_result.info)}
        elif task_result.state == 'SUCCESS':
            result_data = task_result.result
            
            # Save the lesson to PostgreSQL database
            if result_data.get("success"):
                try:
                    # Provide default values for missing DB columns if Celery didn't include them
                    save_payload = {
                        **result_data,
                        "student_level": result_data.get("student_level", "beginner"),
                        "duration_minutes": result_data.get("duration_minutes", 30),
                        "difficulty_level": result_data.get("difficulty_level", "intermediate")
                    }
                    if lesson_storage:
                        saved_info = lesson_storage.save_lesson(save_payload)
                        result_data["lesson_id"] = saved_info["id"]
                        print(f"✅ Class Generation Complete. Saved DB ID: {saved_info['id']}")
                except Exception as e:
                    print(f"⚠️ Failed to save completed job to database: {e}")
            
            return {"status": "completed", "result": result_data}
        else:
            return {"status": task_result.state.lower()}
            
    except Exception as e:
        print(f"❌ Error polling job status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ingest/audio")
async def ingest_audio(
    file: UploadFile = File(...),
    language: str = Form(default="zh")
):
    """Transcribe user-uploaded audio using FunASR. Returns extracted text."""
    try:
        from services.funasr.service import FunASRService
        
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
            funasr_lang = "zh-CN" if language == "zh" else "en-US"
            service = FunASRService()
            segments = await service.transcribe_audio(tmp_path, language=funasr_lang)
            full_text = " ".join(seg.text for seg in segments if seg.text.strip())
            
            print(f"✅ FunASR transcription complete: {len(full_text)} chars")
            return {
                "success": True,
                "text": full_text,
                "segments": [{"start": s.start_time, "end": s.end_time, "text": s.text, "confidence": s.confidence} for s in segments],
                "language": language
            }
        finally:
            os.unlink(tmp_path)
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error transcribing audio: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@app.post("/ingest/image")
async def ingest_image(
    file: UploadFile = File(...),
    language: str = Form(default="zh")
):
    """Extract text from user-uploaded image/slide using PaddleOCR. Returns extracted text."""
    try:
        from services.paddleocr.service import PaddleOCRService
        
        # Validate file type
        allowed_types = {"image/jpeg", "image/png", "image/bmp", "image/tiff",
                         "image/webp", "application/pdf"}
        if file.content_type and file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported image format: {file.content_type}"
            )
        
        # Save upload to a temp file
        suffix = os.path.splitext(file.filename or ".jpg")[1] or ".jpg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        
        try:
            ocr_lang = "ch" if language == "zh" else "en"
            service = PaddleOCRService()
            results = await service.extract_text_from_image(tmp_path, language=ocr_lang)
            full_text = "\n".join(r.text for r in results if r.text.strip())
            
            print(f"✅ PaddleOCR extraction complete: {len(results)} regions, {len(full_text)} chars")
            return {
                "success": True,
                "text": full_text,
                "regions": len(results),
                "language": language
            }
        finally:
            os.unlink(tmp_path)
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error extracting image text: {e}")
        import traceback
        traceback.print_exc()
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