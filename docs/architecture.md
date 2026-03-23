# MentorMind — Codebase Architecture

## Overview

MentorMind is a bilingual (Chinese/English) AI-powered educational platform that generates lesson content, animated videos (Manim), narrated audio (TTS), and interactive learning experiences from a student's learning query.

**API rule: All LLM/TTS calls use DeepSeek or SiliconFlow only. No OpenAI services are used or allowed.**

```
mentormind/
├── backend/               ← Python FastAPI server + all AI pipeline logic
├── web/                   ← Next.js 13 App Router frontend
├── docker-compose.yml     ← Full-stack launcher (Postgres + Redis + Backend + Celery + FunASR + PaddleOCR)
├── .env / .env.example    ← All API keys and connection strings
└── architecture.md        ← This file
```

---

## Data Flow: A Single Class Generation Request

```mermaid
sequenceDiagram
    participant Browser
    participant Next.js (web/)
    participant FastAPI (server.py)
    participant Redis Queue
    participant Celery Worker (celery_app.py)
    participant ClassCreator (core/create_classes.py)
    participant RobustVideoGenerationPipeline
    participant ManimService
    participant SiliconFlow TTS
    participant CloudStorageManager
    participant PostgreSQL

    Browser->>Next.js (web/): POST /api/backend/create-class (with Clerk JWT)
    Next.js (web/)->>FastAPI (server.py): Proxy → POST /create-class
    FastAPI (server.py)->>Redis Queue: celery_task.delay(request_data, job_id)
    FastAPI (server.py)-->>Browser: { job_id: "..." } (instant)

    Browser->>FastAPI (server.py): GET /job-stream/{job_id} (SSE)
    Note over Browser,FastAPI (server.py): Falls back to polling /job-status/{job_id} if SSE breaks

    Redis Queue->>Celery Worker (celery_app.py): Pick up task
    Celery Worker (celery_app.py)->>ClassCreator: create_class_chinese/english()
    ClassCreator->>RobustVideoGenerationPipeline: syllabus -> storyboard -> render_plan
    RobustVideoGenerationPipeline-->>ClassCreator: validated render plan + debug artifacts
    ClassCreator->>SiliconFlow TTS: Synthesize narration audio per scene
    ClassCreator->>ManimService: Render validated plan (with layout-aware canvas_config)
    ManimService-->>ClassCreator: local video file path
    ClassCreator->>ClassCreator: ffprobe audio-stream validation + artifact packaging
    ClassCreator->>CloudStorageManager: upload_file()
    CloudStorageManager-->>ClassCreator: public CDN URL
    Celery Worker (celery_app.py)->>PostgreSQL: lesson_storage.save_lesson()
    Celery Worker (celery_app.py)-->>Redis Queue: Mark task SUCCESS

    FastAPI (server.py)-->>Browser: SSE event { status: "completed", result: { video_url, ... } }
```

---

## Backend (`backend/`)

### Entry Points

| File | Role |
| :--- | :--- |
| `server.py` | **FastAPI app** — all HTTP endpoints. Initializes DB on startup. Imports `celery_app`. |
| `celery_app.py` | **Celery task runner** — wraps `ClassCreator` pipeline as an async background task. Also contains `sync_proactive_notifications` Celery task. |

### API Endpoints (in `server.py`)

#### Lesson Generation

| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/create-class` | Dispatches class generation job to Celery. Returns `{ job_id }` instantly. |
| `GET` | `/job-status/{job_id}` | Polls Celery result backend. Returns `{ status, result }`. |
| `GET` | `/job-stream/{job_id}` | **SSE stream** of job progress events. Returns `{ status: "completed", result }` on finish. Falls back gracefully to polling. |
| `POST` | `/analyze-topics` | AI topic analysis from student query text. |
| `POST` | `/debug/generation/pipeline` | Stage-level debug route. Returns syllabus, storyboard, render plan, review, and validation artifacts without rendering. |
| `POST` | `/debug/generation/video-script` | Stage-level debug route. Returns the final validated `VideoScript` payload that would be sent to Manim. |
| `GET` | `/lessons` | List all published lessons. |
| `GET` | `/lessons/{id}` | Get a specific lesson with full data. |
| `DELETE` | `/lessons/{id}` | Delete a lesson by ID. |

#### Auth & User Profile (Clerk-based)

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/users/me` | Get current user's profile (requires Clerk JWT). |
| `PATCH` | `/users/me` | Update current user's profile. |
| `POST` | `/users/me/profile` | Create or update the learner onboarding profile (`UserProfile`). |

#### Process-First Learning Engine

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/users/me/lessons` | List lessons created by the current user. |
| `GET` | `/users/me/lessons/{id}/state` | Get lesson progress, latest performance, next review due, and recent agent interaction history. |
| `POST` | `/users/me/lessons/{id}/progress` | Upsert progress percentage and completion status. |
| `POST` | `/users/me/lessons/{id}/performance` | Record a performance score + confidence from any assessment. Triggers spaced-review scheduling. |
| `POST` | `/users/me/lessons/{id}/seminar` | **Multi-agent seminar** — generates debate from 3 AI roles (Mentor, Top Student, Struggling Peer) + synthesis. |
| `POST` | `/users/me/lessons/{id}/simulation` | **Applied simulation** — puts the student in a real decision scenario with an AI counterparty. |
| `POST` | `/users/me/lessons/{id}/oral-defense` | **Oral defense** — AI panel of 3 experts questions the student's understanding. |
| `POST` | `/users/me/lessons/{id}/memory-challenge` | **Memory challenge** — generates a 3-min retrieval sprint (no replaying). |
| `POST` | `/users/me/lessons/{id}/deliberate-error` | **Error audit** — presents a plausible-but-flawed claim for the student to find and correct. |
| `GET` | `/users/me/review-queue` | Returns overdue or due-soon `MemoryReview` items (spaced repetition queue). |
| `GET` | `/users/me/notifications` | Returns `ProactiveNotification` items (auto-syncs from review queue). |
| `PATCH` | `/users/me/notifications/{id}` | Mark a notification as read or dismissed. |
| `POST` | `/users/me/notifications/sync` | Manually trigger sync of proactive notifications from review queue. |

#### Media Ingestion

| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/ingest/audio` | Upload audio → FunASR transcription (async, returns `job_id`). |
| `POST` | `/ingest/image` | Upload image → PaddleOCR extraction (async, returns `job_id`). |

---

## Core AI Pipeline (`backend/core/`)

| File | Role |
| :--- | :--- |
| `core/create_classes.py` | **Main orchestrator.** `ClassCreator` calls cognitive, agentic, and output modules. Supports `create_class_chinese()` and `create_class_english()`. Accepts `user_id` and `lesson_design` preferences. |
| `core/modules/agentic.py` | Agentic reasoning — plans lesson structure using LLM tool-calling. |
| `core/modules/cognitive.py` | Cognitive processing — understands and categorizes student learning intent. |
| `core/modules/ingestion.py` | `MultimodalIngestionPipeline` — processes audio (FunASR) and images (PaddleOCR). |
| `core/modules/output.py` | `OutputPipeline` — orchestrates TTS, renderer execution, ffprobe validation, and cloud upload. |
| `core/modules/robust_video_generation.py` | **New staged pipeline.** Builds `syllabus -> storyboard -> render_plan`, applies deterministic validation/repair, and records debug artifacts + prompt versions. |
| `core/modules/video_scripting.py` | `VideoScriptGenerator` — converts the validated render plan into the final `VideoScript` object for Manim. |
| `core/modules/storage_manager.py` | `CloudStorageManager` — uploads MP4/MP3 to S3-compatible endpoints via `boto3`. |
| `core/rendering/manim_renderer.py` | `ManimService` — renders the validated `VideoScript` with layout-aware `canvas_config`, graph ranges, and self-correction retries (max 3). Detects CJK chars in `write_tex` and falls back to `Text` renderer. |

### Robust Video Generation Stages

| Stage | Input | Output | Failure Handling |
| :--- | :--- | :--- | :--- |
| `Syllabus` | topic + source content + learner context | chaptered teaching blueprint | deterministic syllabus fallback |
| `Storyboard` | syllabus | scene-by-scene pedagogy + layout intent | deterministic storyboard fallback |
| `Render Plan` | storyboard | renderer-safe actions + `canvas_config` | deterministic render-plan fallback |
| `Validation` | render plan | repaired render plan + warnings | clamps duration, text length, actions, graph ranges |
| `Review` | repaired render plan | optional patch recommendations | only safe scene-level patches are applied |

This replaces the older “single freeform director prompt -> direct render” path. The new system is intentionally easier to debug because every stage can be inspected independently.

### Process-First Learning Helpers (in `server.py`)

| Helper Function | Role |
| :--- | :--- |
| `_generate_multi_agent_seminar_turn()` | Calls DeepSeek to generate 3-role debate + synthesis + next moderator prompt. |
| `_generate_simulation_turn()` | Generates counterparty response, coach feedback, and pressure level for a scenario. |
| `_generate_oral_defense_turn()` | Generates panel questions, verdict, and follow-up from 3 expert personas. |
| `_generate_memory_challenge()` | Produces a title, 3 recall questions, and self-check anchors. |
| `_generate_deliberate_error_audit()` | Produces a flawed claim, distractor elements, and the correction. |

All helpers include DeepSeek LLM calls with JSON-structured fallbacks if the LLM call fails.

---

## External Services (`backend/services/`)

| File | Service | Notes |
| :--- | :--- | :--- |
| `services/api_client.py` | **Unified LLM client** | Calls DeepSeek V3 or SiliconFlow endpoints only. **No OpenAI.** |
| `services/tts/` | TTS synthesis | Calls **SiliconFlow TTS** only. |
| `services/siliconflow.py` | SiliconFlow API wrapper | For LLM and image model calls. |
| `services/funasr/` | **Aliyun FunASR** | Audio-to-text transcription. Runs in Docker on port `10095`. |
| `services/paddleocr/` | **Baidu PaddleOCR** | Document OCR. Runs in Docker on port `8866`. |

---

## Database (`backend/database/`)

### ORM Models

#### `lessons` — `class Lesson`
Core lesson content, AI insights (video_url, audio_url, lesson plan stored in JSON), quality score.

#### `users` — `class User`
Clerk user ID as primary key (`String(255)`). Email, username, role, subscription tier, language preference.

#### `user_profiles` — `class UserProfile` ✨ NEW
Learner onboarding profile: grade level, subject interests, current challenges, long-term goals, preferred learning style, weekly study hours, `onboarding_completed` flag.

#### `user_lessons` — `class UserLesson`
Progress tracking per user per lesson: `progress_percentage`, `is_completed`, `time_spent_minutes`.

#### `student_performance` — `class StudentPerformance` ✨ NEW
Fine-grained assessment records from seminars, simulations, oral defenses: score, confidence, strengths, struggles, reflection, assessment type.

#### `memory_reviews` — `class MemoryReview` ✨ NEW
Spaced repetition queue using a forgetting-curve scheduler. Fields: `review_type`, `status`, `review_count`, `ease_factor`, `interval_hours`, `due_at`. Unique constraint: `(user_id, lesson_id, review_type)`.

#### `agent_interaction_turns` — `class AgentInteractionTurn` ✨ NEW
Lightweight log of live seminar, simulation, and oral-defense turns for context continuity. Fields: `interaction_type`, `user_input`, `agent_output`.

#### `proactive_notifications` — `class ProactiveNotification` ✨ NEW
In-app notification records derived from the review queue. Fields: `notification_type`, `title`, `body`, `action_url`, `status`, `delivery_channel`, `scheduled_for`, `read_at`.

### Storage Layer (`backend/database/storage.py`)

`LessonStorageSQL` class provides all persistence. Key methods:

| Method | Description |
| :--- | :--- |
| `save_lesson()` | Persist full lesson with objectives, resources, exercises. |
| `get_lesson_state()` | Combined query: progress + latest performance + next review + recent interactions by type. |
| `upsert_user_lesson_progress()` | Create or update `UserLesson` progress record. |
| `record_student_performance()` | Save assessment result + trigger `_schedule_memory_review()`. |
| `get_review_queue()` | Return overdue/upcoming `MemoryReview` items within a rolling horizon. |
| `sync_proactive_notifications()` | Derive new in-app notifications from overdue reviews; avoids duplicates. |
| `get_notifications()` | Fetch notifications, auto-syncing if needed. |
| `mark_notification_status()` | Mark a notification read/dismissed. |
| `store_agent_interaction()` | Persist one live agent turn. |
| `get_recent_agent_interactions()` | Fetch recent turns for continuity (last N by type). |
| `_schedule_memory_review()` | Spaced-review scheduler: ease factor + interval ladder based on mastery score. |

---

## Frontend (`web/`)

Next.js 13 App Router. All backend API calls are proxied through `web/app/api/backend/`.

### Pages

| Route | Description |
| :--- | :--- |
| `/` | Landing page |
| `/create` | Lesson creation: chat → topic → configure (with `LessonDesign` options) → generate (SSE + fallback polling) → preview |
| `/lessons/[id]` | Lesson detail with 5 tabs: **Seminar**, Practice, Content, Transcript, Video |
| `/dashboard` | Lesson history + **Process Inbox** (notifications) + **Today's Proactive Interventions** (review queue) |
| `/principles` | About / Features page — all 9 features + learning loop + design principles |
| `/settings` | Settings page |
| `/analytics` | Analytics |
| `/dev-form` | Direct upload speed test (audio/image ASR/OCR) |

### Lesson Detail Tabs (`/lessons/[id]`)

| Tab | Feature |
| :--- | :--- |
| **Seminar** | Multi-agent debate (Mentor / Top Student / Struggling Peer) + live moderator input |
| **Practice** | Memory Challenge · Oral Defense · Simulation · Deliberate Error Audit |
| **Content** | Structured lesson plan |
| **Transcript** | Manim scene narration text |
| **Video** | AI insights and video player |

### API Proxy Routes (`web/app/api/backend/`)

| Proxy Path | Forwards To |
| :--- | :--- |
| `create-class/` | `POST /create-class` |
| `job-status/[id]/` | `GET /job-status/{id}` |
| `job-stream/[id]/` | `GET /job-stream/{id}` (SSE) |
| `lessons/` | `GET /lessons` |
| `lessons/[id]/` | `GET / DELETE /lessons/{id}` |
| `users/me/` | `GET / PATCH /users/me` |
| `users/me/lessons/` | `GET /users/me/lessons` |
| `users/me/lessons/[id]/state/` | `GET /users/me/lessons/{id}/state` |
| `users/me/lessons/[id]/progress/` | `POST /users/me/lessons/{id}/progress` |
| `users/me/lessons/[id]/performance/` | `POST /users/me/lessons/{id}/performance` |
| `users/me/lessons/[id]/seminar/` | `POST /users/me/lessons/{id}/seminar` |
| `users/me/lessons/[id]/simulation/` | `POST /users/me/lessons/{id}/simulation` |
| `users/me/lessons/[id]/oral-defense/` | `POST /users/me/lessons/{id}/oral-defense` |
| `users/me/lessons/[id]/memory-challenge/` | `POST /users/me/lessons/{id}/memory-challenge` |
| `users/me/lessons/[id]/deliberate-error/` | `POST /users/me/lessons/{id}/deliberate-error` |
| `users/me/review-queue/` | `GET /users/me/review-queue` |
| `users/me/notifications/` | `GET /users/me/notifications` |
| `users/me/notifications/[id]/` | `PATCH /users/me/notifications/{id}` |
| `users/me/notifications/sync/` | `POST /users/me/notifications/sync` |
| `users/me/profile/` | `POST /users/me/profile` |
| `ingest/audio/` | `POST /ingest/audio` |
| `ingest/image/` | `POST /ingest/image` |
| `media/[...path]/` | Static media file proxy |

---

## Prompt Architecture

The prompt library is now split by responsibility:

| Prompt File | Role |
| :--- | :--- |
| `backend/prompts/video/lesson_syllabus.md` | Generates the pedagogical syllabus / chapter plan |
| `backend/prompts/video/storyboard_builder.md` | Converts syllabus into scene-level teaching moves + layout intent |
| `backend/prompts/video/render_plan_builder.md` | Converts storyboard into renderer-safe actions and `canvas_config` |
| `backend/prompts/video/render_plan_review.md` | Reviews render plan for density, coherence, and safety |
| `backend/prompts/rendering/manim_fix.md` | Repairs broken Manim code when execution fails |

Prompt hashes are recorded in the generation debug artifacts so a bad render can be traced back to the exact prompt version.

---

## Debugging Philosophy

The generation stack is now designed to fail in visible, inspectable layers:

- Prompt-stage failures should be debugged with `/debug/generation/pipeline`
- Renderer-payload issues should be debugged with `/debug/generation/video-script`
- Audio/video artifact issues should be debugged from `ai_insights.generation_debug`
- Final media files are validated with `ffprobe` so “render succeeded but audio is missing” is easier to catch

## SSE Job Streaming

The lesson generation flow uses **Server-Sent Events** with an automatic fallback to polling:

```
Browser
  │
  ├─ Opens EventSource → /api/backend/job-stream/{job_id}
  │     SSE events: { status: "pending|processing|completed", result?, error? }
  │
  └─ onerror handler fires (proxy timeout / nginx buffer)
        │
        └─ Falls back to polling /api/backend/job-status/{job_id} every 2s
              Max 90 attempts (~3 min) before timeout error
```

SSE response headers include `X-Accel-Buffering: no` to prevent nginx from buffering the stream.

---

## Local Dev Services (`docker-compose.yml`)

| Service | Image | Port | Role |
| :--- | :--- | :--- | :--- |
| `postgres` | `postgres:15-alpine` | 5432 | Main database |
| `redis` | `redis:alpine` | 6379 | Celery broker + job result backend |
| `backend` | Built from `backend/Dockerfile` | 8000 | FastAPI server |
| `celery-worker` | Built from `backend/Dockerfile` | — | Background task runner |
| `frontend` | Built from `web/Dockerfile` | 3000 | Next.js app |
| `funasr` | Aliyun FunASR runtime | 10095 | Audio transcription |
| `paddleocr` | Aliyun PaddleOCR | 8866 | OCR |

---

## Key Environment Variables (`.env`)

```bash
# === DATABASE ===
DATABASE_URL=postgresql://mentormind:mentormind@postgres:5432/mentormind_metadata

# === AI APIs (DeepSeek + SiliconFlow ONLY) ===
DEEPSEEK_API_KEY=...
SILICONFLOW_API_KEY=...

# === AUTHENTICATION (Clerk) ===
CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...

# === CLOUD STORAGE (Aliyun OSS / Cloudflare R2) ===
S3_ENABLED=false
S3_ENDPOINT_URL=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=mentormind-videos
S3_PUBLIC_URL_PREFIX=...

# === CELERY / REDIS ===
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0

# === FRONTEND ===
BACKEND_URL=http://backend:8000          # internal Docker network name
NEXT_PUBLIC_API_URL=http://localhost:8000

# === MANIM ===
MANIM_RENDER_QUALITY=m                   # l=low, m=medium, h=high
MANIM_RENDER_TIMEOUT_SECONDS=120
```

---

## Global Language System

Two-layer approach:
- **UI Language** — controlled by `LanguageContext` / `useLanguage()`, stored in `localStorage`.
- **Content Language** — sent as `language` in every AI generation request body. All LLM prompts include an explicit language instruction at the top via `LANGUAGE_INSTRUCTION` dict.

TTS voice auto-switches: `zh` → CosyVoice Chinese, `en` → CosyVoice English.

---

## Manim Video Rendering Notes

- Chinese characters are **not** allowed inside `write_tex` actions — the renderer detects CJK chars and falls back to `Text()`.
- `show_text` should be used for all Chinese labels.
- Docker image installs `texlive-lang-chinese`, `texlive-xetex`, and `fonts-noto-cjk` for full CJK support.
- Max 5 scenes are generated per lesson to keep render time under ~2 minutes.
- Render quality and timeout are configurable via `MANIM_RENDER_QUALITY` and `MANIM_RENDER_TIMEOUT_SECONDS`.
