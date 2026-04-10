import os
import json
import asyncio
import textwrap
import redis
from celery import Celery
from datetime import datetime

# Import Mentormind dependencies
from core.create_classes import ClassCreator, ClassCreationRequest, Language
from database import LessonStorageSQL, init_database
from database.base import SessionLocal
from database.models.user import User
from core.asr import transcribe_with_local_model_result
from core.summarize import summarize_extracted_content
from core.rendering.layout_manager import ContentType
from config import config
import redis

# Initialize Celery app
# In production, broker and backend should come from environment variables.
REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")

# Direct Redis client for storing job results (bypasses Celery's result backend)
_redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

celery_app = Celery(
    "mentormind_tasks",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

# Configure Celery settings
celery_app.conf.update(
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_connection_max_retries=10,
    broker_connection_timeout=30,
    broker_pool_limit=10,
    redis_max_connections=20,
    redis_socket_connect_timeout=15,
    redis_socket_timeout=120,
    redis_retry_on_timeout=True,
    result_backend_transport_options={
        "retry_policy": {"max_retries": 5, "interval_start": 0.2, "interval_step": 0.5, "interval_max": 3},
    },
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=1800,  # 30 minutes hard limit for long-form rendering and retries
    task_soft_time_limit=1500, # 25 minutes soft limit
    worker_lost_wait=30,  # Wait before marking lost worker tasks as failed
    
    # --- RESOURCE ISOLATION QUEUES ---
    task_queues={
        "orchestration": {"exchange": "orchestration", "routing_key": "orchestration"},
        "rendering": {"exchange": "rendering", "routing_key": "rendering"},
        "heavy_ml": {"exchange": "heavy_ml", "routing_key": "heavy_ml"},
    },
    task_default_queue="orchestration",
    task_routes={
        "mentormind.create_class_video": {"queue": "orchestration"},
        "mentormind.transcript_to_lesson": {"queue": "orchestration"},
        "mentormind.sync_proactive_notifications": {"queue": "orchestration"},
        "mentormind.render_manim_scene": {"queue": "rendering"},
        "mentormind.transcribe_audio": {"queue": "heavy_ml"},
        "mentormind.ocr_image": {"queue": "heavy_ml"},
        "mentormind.generate_unit_content": {"queue": "orchestration"},
    },
)


@celery_app.task(bind=True, name="mentormind.sync_proactive_notifications")
def sync_proactive_notifications_task(self):
    """
    Background task: materialize in-app proactive notifications for all active users.
    Safe to run periodically from celery beat or cron-triggered worker calls.
    """
    print("🔔 Syncing proactive notifications for active users...")
    try:
        init_database()
        lesson_storage = LessonStorageSQL()
        session = SessionLocal()
        try:
            users = session.query(User).filter(User.is_active.is_(True)).all()
            total_created = 0
            for user in users:
                try:
                    created = lesson_storage.sync_proactive_notifications(str(user.id))
                    total_created += len(created)
                except Exception as exc:
                    print(f"⚠️ Failed notification sync for user {user.id}: {exc}")
            print(f"✅ Proactive notification sync complete. Created {total_created} notifications.")
            return {"success": True, "users_processed": len(users), "created": total_created}
        finally:
            session.close()
    except Exception as exc:
        print(f"❌ Proactive notification sync failed: {exc}")
        return {"success": False, "error": str(exc)}

@celery_app.task(bind=True, name="mentormind.create_class_video")
def create_class_video_task(self, request_data: dict, job_id: str):
    """
    Celery task that executes the heavy AI video reasoning pipeline.
    This runs asynchronously so the FastAPI web server isn't blocked.
    """
    import asyncio
    print(f"[{job_id}] Received celery task to generate video for topic: {request_data.get('topic')}")
    
    # We must run the async ClassCreator inside a synchronous wrapper
    async def _run_pipeline():
        creator = ClassCreator()

        def _progress(stage: str, percent: int, label: str):
            self.update_state(state='PROGRESS', meta={
                'stage': stage,
                'percent': percent,
                'label': label,
            })
            print(f"[{job_id}] PROGRESS {percent}% — {stage}: {label}")

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
            voice_id=request_data.get("voice_id", "anna"),
            user_id=request_data.get("user_id"),
            syllabus=request_data.get("syllabus"), # Pass locked syllabus
        )
        
        # Execute the pipeline
        if language == "en":
            result = await creator.create_class_english(class_request, progress_callback=_progress)
        else:
            result = await creator.create_class_chinese(class_request, progress_callback=_progress)
            
        return result

    # Run the event loop — always create a fresh loop for Celery workers
    # (asyncio.get_event_loop() is unreliable in forked worker processes)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(_run_pipeline())
    finally:
        loop.close()
    
    # Extract title and description from nested lesson plan if missing
    plan_dict = result.lesson_plan if isinstance(result.lesson_plan, dict) else {}
    final_title = result.class_title or plan_dict.get("title") or plan_dict.get("class_title") or request_data.get("topic") or "Generated Lesson"
    final_desc = result.class_description or plan_dict.get("description") or plan_dict.get("class_description") or "AI Generated Lesson"

    # video_url / audio_url are already clean relative paths (e.g. 'videos/manim/.../LessonScene.mp4')
    # produced by output.py → create_classes.py. No further transformation needed.
    print(f"[{job_id}] 🔍 Pipeline result: video_url={result.video_url!r}  audio_url={result.audio_url!r}  success={result.success}")

    # AI Quality Evaluation of Generated Content
    quality_evaluation = None
    try:
        print(f"[{job_id}] 🔍 Running AI quality evaluation...")
        from core.agents.video_quality_agent import VideoQualityAgent

        # Resolve absolute paths for file-level checks
        video_abs = None
        audio_abs = None
        if result.video_url:
            candidate = os.path.join(config.DATA_DIR, result.video_url) if not os.path.isabs(result.video_url) else result.video_url
            if os.path.isfile(candidate):
                video_abs = candidate
        if result.audio_url:
            candidate = os.path.join(config.DATA_DIR, result.audio_url) if not os.path.isabs(result.audio_url) else result.audio_url
            if os.path.isfile(candidate):
                audio_abs = candidate

        agent = VideoQualityAgent()
        quality_evaluation = agent.evaluate_final_output(
            result=result,
            request_data=request_data,
            video_absolute_path=video_abs,
            audio_absolute_path=audio_abs,
        )

        print(f"[{job_id}] ✅ Quality evaluation complete: {quality_evaluation['overall_score']}/10 (Grade: {quality_evaluation['grade']})")

    except Exception as e:
        print(f"[{job_id}] ⚠️ Quality evaluation failed: {e}")
        quality_evaluation = {
            "overall_score": 0.0,
            "error": str(e),
            "assessment_quality": "unavailable"
        }

    # Return serializable dict for Celery Task result
    render_failed = request_data.get("include_video", True) and not result.video_url
    response = {
        "success": result.success and not render_failed,
        "language": result.language_used.value if result.language_used else request_data.get("language"),
        "topic": request_data.get("topic") or final_title,
        "class_title": final_title,
        "class_description": final_desc,
        "lesson_plan": result.lesson_plan,
        "resources": result.resources,
        "ai_insights": result.ai_insights,
        "audio_url": result.audio_url,
        "video_url": result.video_url,
        "quality_evaluation": quality_evaluation,  # New: AI quality assessment
        "timestamp": datetime.now().isoformat()
    }
    if render_failed:
        response["error"] = "Video rendering failed before a final media file was produced."
    
    # Save the lesson to PostgreSQL database directly in the worker
    if response["success"]:
        try:
            init_database()
            lesson_storage = LessonStorageSQL()
            save_payload = {
                **response,
                "student_level": result.student_level if hasattr(result, 'student_level') else request_data.get("student_level", "beginner"),
                "duration_minutes": request_data.get("duration_minutes", 30),
                "difficulty_level": request_data.get("difficulty_level", "intermediate"),
                "user_id": request_data.get("user_id")
            }
            saved_info = lesson_storage.save_lesson(save_payload)
            response["lesson_id"] = saved_info["id"]
            print(f"[{job_id}] ✅ Successfully saved lesson to DB: {saved_info['id']}")
        except Exception as e:
            print(f"[{job_id}] ⚠️ Failed to save lesson to DB: {e}")
    else:
        print(f"[{job_id}] ⚠️ Skipping DB save because lesson generation did not produce a final video")
    
    # Store result directly in Redis so /job-status can read it reliably
    # (bypasses Celery's result backend which can be unreliable in Docker)
    try:
        _redis_client.setex(
            f"job_result:{self.request.id}",
            3600,  # 1 hour TTL
            json.dumps(response)
        )
        print(f"[{job_id}] ✅ Stored job result in Redis key: job_result:{self.request.id}")
    except Exception as e:
        print(f"[{job_id}] ⚠️ Failed to store job result in Redis: {e}")
    
    return response


# ── Transcript → Lesson pipeline ─────────────────────────────────────────────

# Max characters per chunk sent to DeepSeek.
# DeepSeek V3 context window is ~64k tokens; 12k chars ≈ ~4k tokens, safe for large lectures.
_TRANSCRIPT_CHUNK_CHARS = 12_000


def _chunk_transcript(text: str, chunk_size: int = _TRANSCRIPT_CHUNK_CHARS) -> list[str]:
    """Split a long transcript into overlapping chunks so no context is lost at boundaries."""
    if len(text) <= chunk_size:
        return [text]

    # Wrap on sentence boundaries when possible (split on ". " / "。")
    import re
    sentences = re.split(r'(?<=[.。!?！？])\s+', text)
    chunks, current = [], ""
    for sentence in sentences:
        if len(current) + len(sentence) + 1 > chunk_size and current:
            chunks.append(current.strip())
            # 20 % overlap: keep last few sentences of previous chunk
            overlap_start = max(0, len(current) - chunk_size // 5)
            current = current[overlap_start:] + " " + sentence
        else:
            current = (current + " " + sentence).strip()
    if current:
        chunks.append(current.strip())
    return chunks


@celery_app.task(bind=True, name="mentormind.transcript_to_lesson",
                 time_limit=1800)  # Increased to 30 mins
def transcript_to_lesson_task(self, transcript_or_file: str, request_data: dict, job_id: str, is_file: bool = False):
    """
    Celery task: turn a raw ASR transcript (or audio file) into a structured MentorMind lesson.

    Steps:
      1. Chunk transcript (handles 30-min+ recordings that exceed LLM context).
      2. Per-chunk topic extraction via DeepSeek (summarise -> topic title).
      3. Merge summaries -> derive a single lesson topic string.
      4. Reuse the existing ClassCreator pipeline (same as create_class_video_task).

    request_data keys (all optional, sensible defaults apply):
      language, student_level, duration_minutes, include_video,
      include_exercises, include_assessment, target_audience, difficulty_level, voice_id
    """
    print(f"[{job_id}] transcript_to_lesson: {'file' if is_file else 'text'}, lang={request_data.get('language','zh')}")
    # transcript is defined inside _run or after source determination

    async def _run():
        import json
        from services.api_client import api_client

        language = request_data.get("language", "zh")
        
        # Determine transcript source
        if is_file:
            print(f"[{job_id}] Transcribing audio file: {transcript_or_file}")
            transcription = await transcribe_with_local_model_result(transcript_or_file, language)
            transcript = transcription["text"]
            language = transcription.get("detected_language", language)
            # Clean up temp file in worker
            if os.path.exists(transcript_or_file):
                os.unlink(transcript_or_file)
        else:
            transcript = transcript_or_file

        if not transcript:
            raise ValueError("No transcript available for lesson generation")

        chunks = _chunk_transcript(transcript)
        print(f"[{job_id}] Split into {len(chunks)} chunk(s)")

        # -- Step 1: Summarise each chunk ------------------------------------
        summaries = []
        for i, chunk in enumerate(chunks):
            lang_instruction = (
                "请用中文回复。" if language == "zh"
                else "Reply entirely in English."
            )
            prompt = textwrap.dedent(f"""
                {lang_instruction}
                Below is a transcript segment from a lecture (Part {i+1}/{len(chunks)}).
                Please extract:
                1. Core topic of this segment (1-2 sentences)
                2. Key knowledge points (max 5)
                3. A one-sentence summary

                Reply in JSON format:
                {{
                  "topic": "...",
                  "key_points": ["...", "..."],
                  "summary": "..."
                }}

                Transcript content:
                {chunk[:8000]}
            """).strip()

            try:
                resp = await api_client.deepseek.chat_completion(
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                )
                content = resp.data.get("choices", [{}])[0].get("message", {}).get("content", "")
                # Robust JSON parse
                import re as _re
                m = _re.search(r'\{.*\}', content, _re.DOTALL)
                chunk_data = json.loads(m.group()) if m else {"topic": "", "key_points": [], "summary": content[:200]}
            except Exception as e:
                print(f"[{job_id}] Chunk {i+1} summary failed: {e}")
                chunk_data = {"topic": "", "key_points": [], "summary": ""}

            summaries.append(chunk_data)
            print(f"[{job_id}] Chunk {i+1}/{len(chunks)} → topic: {chunk_data.get('topic','')[:60]}")

        # -- Step 2: Merge summaries -> lesson topic ---------------------------
        all_topics = [s.get("topic", "") for s in summaries if s.get("topic")]
        all_key_points = []
        for s in summaries:
            all_key_points.extend(s.get("key_points", []))
        all_summaries_text = "\n".join(f"- {s.get('summary','')}" for s in summaries if s.get("summary"))

        lang_instruction = "Reply in Chinese." if language == "zh" else "Reply entirely in English."
        merge_prompt = textwrap.dedent(f"""
            {lang_instruction}
            The following are topics and summaries from different segments of a lecture. Please synthesize them into:
            1. A concise lesson title (max 10 words)
            2. A core topic description (2-3 sentences)
            3. The top 5 most important knowledge points

            Reply in JSON format:
            {{
              "lesson_title": "...",
              "lesson_topic": "...",
              "key_points": ["...", "..."]
            }}

            Segment Topics: {json.dumps(all_topics, ensure_ascii=False)}
            Segment Summaries:
            {all_summaries_text}
        """).strip()

        try:
            resp = await api_client.deepseek.chat_completion(
                messages=[{"role": "user", "content": merge_prompt}],
                temperature=0.3,
            )
            content = resp.data.get("choices", [{}])[0].get("message", {}).get("content", "")
            import re as _re
            m = _re.search(r'\{.*\}', content, _re.DOTALL)
            merged = json.loads(m.group()) if m else {}
        except Exception as e:
            print(f"[{job_id}] Merge step failed: {e}")
            merged = {}

        lesson_topic = merged.get("lesson_topic") or merged.get("lesson_title") or (all_topics[0] if all_topics else "Lecture")
        lesson_title_hint = merged.get("lesson_title", "")
        key_points_text = "\n".join(f"- {kp}" for kp in merged.get("key_points", all_key_points[:5]))

        print(f"[{job_id}] Derived topic: {lesson_topic}")

        # -- Step 3: Feed into ClassCreator (reuse existing pipeline) --------
        # Append key points as custom requirements
        custom_req = request_data.get("custom_requirements") or ""
        if key_points_text:
            instruction = "This lesson is generated based on the following recording. Please ensure it covers these points:" if language != "zh" else "本课程基于以下录音内容生成，请确保课程涵盖这些知识点："
            custom_req = (
                f"{instruction}\n{key_points_text}"
                + (f"\n\nAdditional requirements: {custom_req}" if custom_req else "")
            )

        enriched_request_data = {
            **request_data,
            "topic": lesson_topic,
            "custom_requirements": custom_req,
        }

        creator = ClassCreator()
        lang_enum = Language(language) if language in ["en", "zh", "ja", "ko"] else Language.CHINESE
        class_request = ClassCreationRequest(
            topic=lesson_topic,
            language=lang_enum,
            student_level=request_data.get("student_level", "beginner"),
            duration_minutes=request_data.get("duration_minutes", 30),
            include_video=request_data.get("include_video", True),
            include_exercises=request_data.get("include_exercises", True),
            include_assessment=request_data.get("include_assessment", True),
            custom_requirements=custom_req or None,
            target_audience=request_data.get("target_audience", "students"),
            difficulty_level=request_data.get("difficulty_level", "intermediate"),
            voice_id=request_data.get("voice_id", "anna"),
        )

        if language == "en":
            result = await creator.create_class_english(class_request)
        else:
            result = await creator.create_class_chinese(class_request)

        # video_url / audio_url are clean relative paths from output.py. Use them directly.
        return {
            "success": result.success,
            "source": "audio_transcript",
            "language": result.language_used.value if result.language_used else language,
            "topic": lesson_topic,
            "lesson_title_hint": lesson_title_hint,
            "class_title": result.class_title,
            "class_description": result.class_description,
            "lesson_plan": result.lesson_plan,
            "resources": result.resources,
            "ai_insights": result.ai_insights,
            "audio_url": result.audio_url,
            "video_url": result.video_url,
            # Transcript metadata for reference
            "transcript_chars": len(transcript),
            "transcript_chunks": len(chunks),
            "chunk_summaries": summaries,
            "timestamp": datetime.now().isoformat(),
        }

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        response = loop.run_until_complete(_run())
    finally:
        loop.close()
    
    # Save the lesson to PostgreSQL database directly in the worker
    try:
        init_database()
        lesson_storage = LessonStorageSQL()
        save_payload = {
            **response,
            "student_level": "beginner",  # Default for transcripts
            "duration_minutes": 30,
            "difficulty_level": "intermediate"
        }
        saved_info = lesson_storage.save_lesson(save_payload)
        response["lesson_id"] = saved_info["id"]
        print(f"[{job_id}] ✅ Successfully saved transcript lesson to DB: {saved_info['id']}")
    except Exception as e:
        print(f"[{job_id}] ⚠️ Failed to save transcript lesson to DB: {e}")
    
    # Store result directly in Redis (bypasses Celery's result backend)
    try:
        _redis_client.setex(
            f"job_result:{self.request.id}",
            3600,
            json.dumps(response)
        )
        print(f"[{job_id}] ✅ Stored transcript job result in Redis key: job_result:{self.request.id}")
    except Exception as e:
        print(f"[{job_id}] ⚠️ Failed to store transcript job result in Redis: {e}")
    
    return response
@celery_app.task(bind=True, name="mentormind.transcribe_audio", time_limit=1800)
def transcribe_audio_task(self, file_path: str, language: str, job_id: str, target_language: str = "en"):
    """
    Celery task: transcribe audio file and provide summary for 'Learning Context'.
    """
    print(f"[{job_id}] Received transcription task for file: {file_path}")
    
    async def _run():
        # 1. Transcribe
        transcription = await transcribe_with_local_model_result(file_path, language)
        full_text = transcription["text"]
        print(f"[{job_id}] Transcription complete: {len(full_text)} chars")
        
        # 2. Summarize
        summary = await summarize_extracted_content(
            full_text,
            "audio",
            target_language=target_language,
            source_language=transcription.get("detected_language"),
        )
        
        return {
            "success": True,
            "text": full_text,
            "summary": summary,
            "language": transcription.get("detected_language", language),
            "detected_language": transcription.get("detected_language", language),
            "transcription_engine": transcription.get("engine"),
            "timestamp": datetime.now().isoformat()
        }

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    try:
        response = loop.run_until_complete(_run())
    except Exception as e:
        print(f"[{job_id}] ❌ Transcription task failed: {e}")
        response = {"success": False, "error": str(e)}
    finally:
        # Clean up temp file in worker
        if os.path.exists(file_path):
            os.unlink(file_path)

    # Store result in Redis
    try:
        _redis_client.setex(
            f"job_result:{self.request.id}",
            3600,
            json.dumps(response)
        )
    except Exception as e:
        print(f"[{job_id}] ⚠️ Failed to store result in Redis: {e}")
        
    return response

@celery_app.task(bind=True, name="mentormind.ocr_image", time_limit=300)
def ocr_image_task(self, file_path: str, language: str, job_id: str, target_language: str = "en"):
    """
    Celery task: extract text from image using PaddleOCR and provide summary.
    """
    print(f"[{job_id}] Received OCR task for file: {file_path}")

    async def _run():
        from core.asr import extract_text_with_paddleocr
        # 1. OCR directly (extract_text_with_paddleocr is synchronous inside executor)
        ocr = await asyncio.get_event_loop().run_in_executor(None, extract_text_with_paddleocr, file_path)
        full_text = ocr.get("text", "")
        print(f"[{job_id}] OCR complete: {len(full_text)} chars")

        # 2. Summarize
        summary = await summarize_extracted_content(
            full_text,
            "image",
            target_language=target_language,
        )

        return {
            "success": True,
            "text": full_text,
            "summary": summary,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    try:
        response = loop.run_until_complete(_run())
    except Exception as e:
        print(f"[{job_id}] ❌ OCR task failed: {e}")
        response = {"success": False, "error": str(e)}
    finally:
        # Clean up temp file in worker
        if os.path.exists(file_path):
            os.unlink(file_path)

    # Store result in Redis
    try:
        _redis_client.setex(
            f"job_result:{self.request.id}",
            3600,
            json.dumps(response)
        )
    except Exception as e:
        print(f"[{job_id}] ⚠️ Failed to store result in Redis: {e}")

    return response


# ── Study Plan: Unit Content Generation ─────────────────────────────────────

@celery_app.task(bind=True, name="mentormind.generate_unit_content", time_limit=600)
def generate_unit_content_task(self, unit_id: str, plan_data: dict, unit_data: dict,
                                content_types: list, language: str = "zh"):
    """
    Celery task: generate study content (guides, quizzes, flashcards, etc.) for a study plan unit.
    """
    print(f"[unit:{unit_id}] Generating content types: {content_types}")

    async def _run():
        from core.content.unit_generator import UnitContentGenerator
        generator = UnitContentGenerator()
        return await generator.generate(
            unit_data=unit_data,
            plan_data=plan_data,
            content_types=content_types,
            language=language,
        )

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(_run())
    except Exception as e:
        print(f"[unit:{unit_id}] ❌ Content generation failed: {e}")
        result = {"error": str(e)}
    finally:
        loop.close()

    # Store result in Redis for polling
    try:
        _redis_client.setex(
            f"unit_content:{unit_id}",
            7200,  # 2 hour TTL
            json.dumps(result, default=str)
        )
    except Exception as e:
        print(f"[unit:{unit_id}] ⚠️ Failed to store result in Redis: {e}")

    # Update the unit in the database
    try:
        init_database()
        session = SessionLocal()
        try:
            from database.models.study_plan import StudyPlanUnit
            unit = session.query(StudyPlanUnit).filter(StudyPlanUnit.id == unit_id).first()
            if unit:
                for ct in content_types:
                    if ct in result and result[ct] is not None:
                        setattr(unit, ct, result[ct])
                unit.content_status = "ready" if not result.get("error") else "failed"
                session.commit()
                print(f"[unit:{unit_id}] ✅ Updated unit content in DB")
        finally:
            session.close()
    except Exception as e:
        print(f"[unit:{unit_id}] ⚠️ Failed to update unit in DB: {e}")
