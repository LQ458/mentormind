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
    
    # Extract title and description from nested lesson plan if missing
    plan_dict = result.lesson_plan if isinstance(result.lesson_plan, dict) else {}
    final_title = result.class_title or plan_dict.get("title") or plan_dict.get("class_title") or request_data.get("topic") or "Generated Lesson"
    final_desc = result.class_description or plan_dict.get("description") or plan_dict.get("class_description") or "AI Generated Lesson"

    # video_url / audio_url are already clean relative paths (e.g. 'videos/manim/.../LessonScene.mp4')
    # produced by output.py → create_classes.py. No further transformation needed.
    print(f"[{job_id}] 🔍 Pipeline result: video_url={result.video_url!r}  audio_url={result.audio_url!r}  success={result.success}")

    # Return serializable dict for Celery Task result
    response = {
        "success": result.success,
        "language": result.language_used.value if result.language_used else request_data.get("language"),
        "topic": request_data.get("topic") or final_title,
        "class_title": final_title,
        "class_description": final_desc,
        "lesson_plan": result.lesson_plan,
        "resources": result.resources,
        "ai_insights": result.ai_insights,
        "audio_url": result.audio_url,
        "video_url": result.video_url,
        "timestamp": datetime.now().isoformat()
    }
    
    # Save the lesson to PostgreSQL database directly in the worker
    try:
        init_database()
        lesson_storage = LessonStorageSQL()
        save_payload = {
            **response,
            "student_level": result.student_level if hasattr(result, 'student_level') else request_data.get("student_level", "beginner"),
            "duration_minutes": request_data.get("duration_minutes", 30),
            "difficulty_level": request_data.get("difficulty_level", "intermediate")
        }
        saved_info = lesson_storage.save_lesson(save_payload)
        response["lesson_id"] = saved_info["id"]
        print(f"[{job_id}] ✅ Successfully saved lesson to DB: {saved_info['id']}")
    except Exception as e:
        print(f"[{job_id}] ⚠️ Failed to save lesson to DB: {e}")
    
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
                 time_limit=1200)  # 20-minute hard limit for very long recordings
def transcript_to_lesson_task(self, transcript: str, request_data: dict, job_id: str):
    """
    Celery task: turn a raw ASR transcript into a structured MentorMind lesson.

    Steps:
      1. Chunk transcript (handles 30-min+ recordings that exceed LLM context).
      2. Per-chunk topic extraction via DeepSeek (summarise → topic title).
      3. Merge summaries → derive a single lesson topic string.
      4. Reuse the existing ClassCreator pipeline (same as create_class_video_task).

    request_data keys (all optional, sensible defaults apply):
      language, student_level, duration_minutes, include_video,
      include_exercises, include_assessment, target_audience, difficulty_level, voice_id
    """
    print(f"[{job_id}] transcript_to_lesson: {len(transcript)} chars, lang={request_data.get('language','zh')}")

    async def _run():
        import json
        from services.api_client import api_client

        language = request_data.get("language", "zh")
        chunks = _chunk_transcript(transcript)
        print(f"[{job_id}] Split into {len(chunks)} chunk(s)")

        # ── Step 1: Summarise each chunk ────────────────────────────────────
        summaries = []
        for i, chunk in enumerate(chunks):
            lang_instruction = (
                "请用中文回复。" if language == "zh"
                else "Reply entirely in English."
            )
            prompt = textwrap.dedent(f"""
                {lang_instruction}
                下面是一段课堂录音的转录片段（第 {i+1}/{len(chunks)} 段）。
                请提取：
                1. 本段的核心主题（1-2句）
                2. 关键知识点列表（最多5条）
                3. 本段的一句话摘要

                以 JSON 格式回复：
                {{
                  "topic": "...",
                  "key_points": ["...", "..."],
                  "summary": "..."
                }}

                转录内容：
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

        # ── Step 2: Merge summaries → lesson topic ───────────────────────────
        all_topics = [s.get("topic", "") for s in summaries if s.get("topic")]
        all_key_points = []
        for s in summaries:
            all_key_points.extend(s.get("key_points", []))
        all_summaries_text = "\n".join(f"- {s.get('summary','')}" for s in summaries if s.get("summary"))

        lang_instruction = "请用中文回复。" if language == "zh" else "Reply entirely in English."
        merge_prompt = textwrap.dedent(f"""
            {lang_instruction}
            以下是一节课各片段的主题和摘要，请综合提炼出：
            1. 整节课的课程标题（简洁，10字以内）
            2. 整节课的核心主题描述（2-3句话）
            3. 最重要的5个知识点

            以 JSON 格式回复：
            {{
              "lesson_title": "...",
              "lesson_topic": "...",
              "key_points": ["...", "..."]
            }}

            各段主题：{json.dumps(all_topics, ensure_ascii=False)}
            各段摘要：
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

        # ── Step 3: Feed into ClassCreator (reuse existing pipeline) ────────
        # Append key points as custom requirements so the lesson plan reflects
        # the actual lecture content rather than generic knowledge.
        custom_req = request_data.get("custom_requirements") or ""
        if key_points_text:
            custom_req = (
                f"本课程基于以下录音内容生成，请确保课程涵盖这些知识点：\n{key_points_text}"
                + (f"\n\n额外要求：{custom_req}" if custom_req else "")
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

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    response = loop.run_until_complete(_run())
    
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
