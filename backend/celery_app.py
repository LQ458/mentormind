import os
import asyncio
from celery import Celery
from datetime import datetime

# Import Mentormind dependencies
from core.create_classes import ClassCreator, ClassCreationRequest, Language

# Initialize Celery app
# In production, broker and backend should come from environment variables.
REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "mentormind_tasks",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

# Optional celery configurations
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,  # 10 minutes max for Manim rendering tasks
)

@celery_app.task(bind=True, name="mentormind.create_class_video")
def create_class_video_task(self, request_data: dict, job_id: str):
    """
    Celery task that executes the heavy AI video reasoning pipeline.
    This runs asynchronously so the FastAPI web server isn't blocked.
    """
    print(f"[{job_id}] Received celery task to generate video for topic: {request_data.get('topic')}")
    
    # We must run the async ClassCreator inside a synchronous wrapper
    async def _run_pipeline():
        creator = ClassCreator()
        
        language = request_data.get("language", "zh")
        class_request = ClassCreationRequest(
            topic=request_data.get("topic", ""),
            language=Language(language) if language in ["en", "zh", "ja", "ko"] else Language.CHINESE,
            student_level=request_data.get("student_level", "beginner"),
            duration_minutes=request_data.get("duration_minutes", 30),
            include_video=request_data.get("include_video", True),
            include_exercises=request_data.get("include_exercises", True),
            include_assessment=request_data.get("include_assessment", True),
            custom_requirements=request_data.get("custom_requirements"),
            target_audience=request_data.get("target_audience", "students"),
            difficulty_level=request_data.get("difficulty_level", "intermediate"),
            voice_id=request_data.get("voice_id", "anna")
        )
        
        # Execute the pipeline
        if language == "en":
            result = await creator.create_class_english(class_request)
        else:
            result = await creator.create_class_chinese(class_request)
            
        return result

    # Run the event loop
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    result = loop.run_until_complete(_run_pipeline())
    
    # Return serializable dict for Celery Task result
    response = {
        "success": result.success,
        "language": result.language_used.value if result.language_used else request_data.get("language"),
        "topic": request_data.get("topic"),
        "class_title": result.class_title,
        "class_description": result.class_description,
        "lesson_plan": result.lesson_plan,
        "resources": result.resources,
        "ai_insights": result.ai_insights,
        "audio_url": result.audio_url,
        "video_url": result.video_url,
        "timestamp": datetime.now().isoformat()
    }
    
    # In a full highly-scalable system, this task would also save `response` to Postgres,
    # and the frontend would poll Postgres for status updates.
    
    return response
