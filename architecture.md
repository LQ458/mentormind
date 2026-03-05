# MentorMind — Codebase Architecture

## Overview

MentorMind is a bilingual (Chinese/English) AI-powered educational platform that generates lesson content, animated videos (Manim/Remotion), narrated audio (TTS), and interactive exercises from a student's learning query.

**API rule: All LLM/TTS calls use DeepSeek or SiliconFlow only. No OpenAI services are used or allowed.**

```
mentormind/
├── backend/               ← Python FastAPI server + all AI pipeline logic
├── web/                   ← Next.js 13 App Router frontend
├── docker-compose.yml     ← Local full-stack launcher (Postgres + Backend + FunASR + PaddleOCR)
├── .env / .env.example    ← All API keys and connection strings
└── start.sh               ← Convenience dev startup script
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
    participant ManimService / RemotionService
    participant SiliconFlow TTS
    participant CloudStorageManager (OSS/R2)
    participant PostgreSQL

    Browser->>Next.js (web/): POST /api/backend [create-class]
    Next.js (web/)->>FastAPI (server.py): Proxy to POST /create-class
    FastAPI (server.py)->>Redis Queue: celery_task.delay(request_data, job_id)
    FastAPI (server.py)-->>Browser: { job_id: "..." } (instant)

    Browser->>FastAPI (server.py): GET /job-status/{job_id} (poll every 5s)

    Redis Queue->>Celery Worker (celery_app.py): Pick up task
    Celery Worker (celery_app.py)->>ClassCreator (core/create_classes.py): create_class_chinese/english()
    ClassCreator (core/create_classes.py)->>SiliconFlow TTS: Synthesize narration audio
    ClassCreator (core/create_classes.py)->>ManimService / RemotionService: Render video
    ManimService / RemotionService-->>ClassCreator (core/create_classes.py): local video file path
    ClassCreator (core/create_classes.py)->>CloudStorageManager (OSS/R2): upload_file()
    CloudStorageManager (OSS/R2)-->>ClassCreator (core/create_classes.py): public CDN URL
    Celery Worker (celery_app.py)->>PostgreSQL: lesson_storage.save_lesson()
    Celery Worker (celery_app.py)-->>Redis Queue: Mark task SUCCESS

    FastAPI (server.py)-->>Browser: { status: "completed", result: { video_url, audio_url ... } }
```

---

## Backend (`backend/`)

### Entry Points

| File | Role |
| :--- | :--- |
| `server.py` | **FastAPI app** — all HTTP endpoints. Initializes DB on startup. Imports `celery_app`. |
| `celery_app.py` | **Celery task runner** — wraps `ClassCreator` pipeline as an async background task. Connects to Redis via `CELERY_BROKER_URL`. |

### API Endpoints (in `server.py`)

| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/create-class` | Dispatches class generation job to Celery. Returns `{ job_id }` instantly. |
| `GET` | `/job-status/{job_id}` | Polls Celery result backend. Saves lesson to DB on first `SUCCESS`. |
| `POST` | `/analyze-topics` | AI topic analysis from student query text. |
| `GET` | `/lessons` | List all lessons from PostgreSQL. |
| `GET` | `/lessons/{id}` | Get a specific lesson with video/audio URLs. |
| `DELETE` | `/lessons/{id}` | Delete a lesson by ID. |
| `POST` | `/teach` | Legacy teaching query endpoint. |
| `GET` | `/health` | Health check. |

> **Missing endpoints (not yet implemented):**
> - `POST /ingest/audio` — for FunASR transcription of user-uploaded audio
> - `POST /ingest/image` — for PaddleOCR of user-uploaded images/slides
> - `POST /auth/register`, `POST /auth/login` — user authentication
> - `GET /users/me`, `PATCH /users/me` — user profile management

---

## Core AI Pipeline (`backend/core/`)

| File | Role |
| :--- | :--- |
| `core/create_classes.py` | **Main orchestrator.** `ClassCreator` calls cognitive, agentic, and output modules to assemble a `ClassCreationResult`. Supports `create_class_chinese()` and `create_class_english()`. |
| `core/database.py` | SQLAlchemy ORM model definitions + `DatabaseManager`. Has a known bug: `pool_size=db_config.max_connections` crashes if `db_config` is `None`. |
| `core/lesson_storage.py` | `LessonStorage` (file-based, legacy) and `LessonStorageSQL` (PostgreSQL, production). |
| `core/modules/agentic.py` | Agentic reasoning — plans lesson structure using LLM tool-calling. |
| `core/modules/cognitive.py` | Cognitive processing — understands and categorizes student learning intent. |
| `core/modules/ingestion.py` | `MultimodalIngestionPipeline` — processes audio (FunASR) and video slides (PaddleOCR scene detection). **Backend logic exists but no API endpoints or frontend UI expose it.** |
| `core/modules/output.py` | `OutputPipeline` — orchestrates TTS, video rendering, and cloud upload. |
| `core/modules/video_scripting.py` | `VideoScriptGenerator` — generates JSON Director Script (scenes, narration, visual types) via LLM. |
| `core/modules/storage_manager.py` | `CloudStorageManager` — uploads MP4/MP3 to S3-compatible endpoints via `boto3`. Controlled by `S3_ENABLED` env. |
| `core/modules/sophisticated_pipeline.py` | Advanced multi-step pipeline combining all modules. |
| `core/rendering/manim_renderer.py` | `ManimService` — LLM generates Manim Python code → executes locally → self-corrects on failure (max 3 retries). Used for math/physics topics. |
| `core/rendering/remotion_renderer.py` | `RemotionService` — React + Puppeteer renderer for general/history-style lessons. |

---

## External Services (`backend/services/`)

| File | Service | Notes |
| :--- | :--- | :--- |
| `services/api_client.py` | **Unified LLM client** | Calls DeepSeek V3 or SiliconFlow endpoints only. **No OpenAI.** |
| `services/tts/` | TTS synthesis | Calls **SiliconFlow TTS** only. **No OpenAI TTS.** |
| `services/siliconflow.py` | SiliconFlow API wrapper | For LLM and image model calls. |
| `services/funasr/` | **Aliyun FunASR** | Audio-to-text transcription. Used by `ingestion.py`. Runs locally in Docker on port `10095`. |
| `services/paddleocr/` | **Baidu PaddleOCR** | Document OCR + video slide text extraction. Runs locally in Docker on port `8866`. |
| `services/heygen.py` | HeyGen Avatar | Not integrated into main pipeline. |

---

## Database Models (`backend/core/database.py`)

### `lessons` table — `class Lesson`

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Auto-generated `uuid4` |
| `title` | String(255) | Required |
| `description` | Text | Optional |
| `topic` | String(255) | Required |
| `language` | String(10) | `zh`, `en`, `ja`, `ko` |
| `student_level` | String(20) | `beginner`, `intermediate`, `advanced` |
| `difficulty_level` | String(20) | `easy`, `medium`, `hard` |
| `duration_minutes` | Integer | Default: 30 |
| `quality_score` | Float | 0.0–1.0 AI confidence estimate |
| `cost_usd` | Float | API cost estimate |
| `ai_insights` | JSON | Stores `video_url`, `audio_url`, `provider`, `confidence`, full lesson plan |
| `created_at` | DateTime (TZ) | Auto set on insert |
| `updated_at` | DateTime (TZ) | Auto set on update |

**Relationships:** `objectives` → `LessonObjective`, `resources` → `LessonResource`, `exercises` → `LessonExercise`

**Indexes:** `language`, `student_level`, `created_at`, `quality_score`, `topic`

> **Note:** `video_url` and `audio_url` are stored **inside** `ai_insights` JSON, not dedicated columns. Consider adding dedicated columns for easier querying and indexing.

---

### `lesson_objectives` table — `class LessonObjective`

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | Integer (PK) | Auto-increment |
| `lesson_id` | UUID (FK → lessons.id) | CASCADE DELETE |
| `objective` | Text | Required learning objective |
| `order_index` | Integer | Display order |

---

### `lesson_resources` table — `class LessonResource`

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | Integer (PK) | Auto-increment |
| `lesson_id` | UUID (FK → lessons.id) | CASCADE DELETE |
| `resource_type` | String(50) | `video`, `document`, `link`, etc. |
| `title` | String(255) | Optional |
| `url` | Text | Optional |
| `description` | Text | Optional |

---

### `lesson_exercises` table — `class LessonExercise`

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | Integer (PK) | Auto-increment |
| `lesson_id` | UUID (FK → lessons.id) | CASCADE DELETE |
| `exercise_type` | String(50) | `quiz`, `coding`, `discussion` |
| `question` | Text | Required |
| `answer` | Text | Optional (model answer) |
| `difficulty` | String(20) | Optional |

---

> [!CAUTION]
> **No `users` table exists.** There is no User database model, no auth system, and no `user_id` on lessons. All lessons are global and anonymous. This must be implemented before any production launch.

---

## Configuration (`backend/config/config.py`)

| Config Class | Controls |
| :--- | :--- |
| `LLMModelConfig` | Model name, API endpoint (DeepSeek/SiliconFlow), API key, temperature, max_tokens |
| `DatabaseConfig` | Host, port, user, password, max_connections |
| `ProcessingConfig` | Timeout, max_retries, batch_size, cache |
| `CostOptimizationConfig` | Monthly budget, fallback model threshold |
| `StorageConfig` | S3/OSS credentials, bucket name, `S3_ENABLED` flag |

**Configured AI Models (no OpenAI):**
- `deepseek_v3` — DeepSeek V3 via `api.deepseek.com`
- `deepseek_r1` — DeepSeek R1 (reasoning) via `api.deepseek.com`
- `siliconflow_*` — Multiple models via `api.siliconflow.cn`
- `funasr` — Local FunASR at `ws://localhost:10095`
- `paddle_ocr` — Local PaddleOCR at `http://localhost:8866`

---

## Frontend (`web/`)

Next.js 13 App Router. All backend API calls are proxied through `web/app/api/backend/` which injects `NEXT_PUBLIC_API_URL`.

### Pages

| Route | File | Description |
| :--- | :--- | :--- |
| `/` | `app/page.tsx` | Landing page |
| `/create` | `app/create/page.tsx` | **Main lesson creation flow**: chat → topic select → configure → generate (polls job-status) → video player |
| `/lessons/[id]` | `app/lessons/[id]/page.tsx` | Lesson detail: video, audio, lesson plan, exercises |
| `/dashboard` | `app/dashboard/page.tsx` | Lesson history |
| `/settings` | `app/settings/page.tsx` | Settings page |
| `/analytics` | `app/analytics/page.tsx` | Analytics |

### API Proxy Routes (`web/app/api/backend/`)

| Route | Forwards To |
| :--- | :--- |
| `api/backend/route.ts` | `POST /create-class` |
| `api/backend/results/route.ts` | `GET /lessons` |
| `api/backend/lessons/route.ts` | `POST /lessons` |
| `api/backend/lessons/[id]/route.ts` | `GET / DELETE /lessons/{id}` |

> **Missing:** No proxy route for `/job-status`, `/ingest/*`, or any auth endpoints.

---

## Local Dev Services (via `docker-compose.yml`)

| Service | Image | Port | Required? |
| :--- | :--- | :--- | :--- |
| `postgres` | `postgres:15-alpine` | 5432 | ✅ Yes — main database |
| `backend` | Built from `backend/Dockerfile` | 8000 | ✅ Yes — API server |
| `funasr` | Aliyun FunASR runtime | 10095 | ✅ Yes — audio transcription |
| `paddleocr` | Aliyun PaddleOCR | 8866 | ✅ Yes — OCR |

> [!IMPORTANT]
> `docker-compose.yml` does NOT include **Redis** or a **Celery worker**. These are required for the async class generation queue. Start separately: `docker run -d -p 6379:6379 redis:alpine`

---

## Key Environment Variables (`.env`)

```bash
# === DATABASE ===
DATABASE_URL=postgresql://user:pass@host:5432/db    # Overrides all POSTGRES_* vars
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=mentormind
POSTGRES_PASSWORD=mentormind
POSTGRES_DB=mentormind_metadata

# === AI APIs (DeepSeek + SiliconFlow ONLY — no OpenAI keys) ===
DEEPSEEK_API_KEY=...
SILICONFLOW_API_KEY=...

# === CLOUD STORAGE (Aliyun OSS / Cloudflare R2 — S3-compatible) ===
S3_ENABLED=false
S3_ENDPOINT_URL=https://<bucket>.<region>.aliyuncs.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=mentormind-videos
S3_PUBLIC_URL_PREFIX=https://...

# === CELERY / REDIS ===
CELERY_BROKER_URL=redis://localhost:6379/0

# === FRONTEND ===
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Missing Features (Not Yet Implemented)

> [!WARNING]
> The following features are architecturally planned or required but have **no implementation** in the current codebase.

### 1. User System
- No `users` table in the database
- No user registration, login, or JWT/session auth
- No `user_id` FK on `lessons` — all lessons are global and anonymous
- **Action required:** Create `User` model, add `user_id` to `Lesson`, implement auth endpoints. Supabase Auth is the quickest path.

### 2. Audio Input (FunASR) — User Facing
- `FunASRService` and `AudioProcessor` backend logic exist and work
- **Missing:** `POST /ingest/audio` endpoint in `server.py`
- **Missing:** Microphone button or audio file upload in `/create` frontend page
- **Missing:** Frontend API proxy route for the audio ingestion endpoint

### 3. Image/OCR Input (PaddleOCR) — User Facing
- `PaddleOCRService` and `VideoProcessor` backend logic exist and work
- **Missing:** `POST /ingest/image` endpoint in `server.py`
- **Missing:** Image/slide upload UI in `/create` frontend page
- **Missing:** Frontend API proxy route for image upload

### 4. Global Language Context System
- Language is selected per-request via a `language` parameter
- **Missing:** Persistent global language preference across user sessions
- **Missing:** React Context or Zustand store wrapping all API calls with user's language setting
- **Missing:** `language` field on the (missing) `users` table

### 5. Redis + Celery in `docker-compose.yml`
- After the async refactoring, the app requires Redis but `docker-compose.yml` has no `redis` service
- **Action required:** Add `redis:alpine` and a `celery-worker` service to `docker-compose.yml`

### 6. `/job-status` Frontend Proxy Route
- `app/create/page.tsx` calls `${apiUrl}/job-status/${job_id}` directly, bypassing the Next.js API proxy
- This will cause CORS errors in production where the backend is on a different domain
- **Action required:** Create `web/app/api/backend/job-status/[id]/route.ts`

---

## Global Language Context System — Design

### Problem

The app has two distinct language dimensions that must be kept consistent:

1. **UI Language** — The language of all static interface text (navigation, buttons, labels). Managed by `LanguageContext.tsx` and `translations.ts`. Currently working.
2. **Content Language** — The language of all AI-generated educational content: lesson titles, explanations, narration script, video text, exercise questions, and topic suggestions. This content is generated by DeepSeek and must match the UI language.

**The bug:** Users can change UI to English, but DeepSeek is still prompted to reply in Chinese. The generated lesson content is language-inconsistent.

---

### Design: Two-Layer Language System

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: UI Language (existing, working)                        │
│  - Storage: localStorage("app-language")                         │
│  - Context: LanguageContext / useLanguage()                      │
│  - Scope: All UI strings via translations.ts                     │
│  - Changes immediately on toggle, persists across sessions       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ auto-synced
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: Content Language (new)                                 │
│  - Storage: localStorage("content-language")                     │
│  - Context: Same LanguageContext — adds `contentLanguage` field  │
│  - Scope: All API calls that trigger AI content generation       │
│  - Default: mirrors UI language; can be set independently        │
│             (e.g., "UI in Chinese, lesson content in English")   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ sent as { language: "en" | "zh" }
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Backend Enforcement                                    │
│  - FastAPI receives `language` in every request body            │
│  - `ClassCreationRequest.language` → passed to LLM prompts       │
│  - Prompts in `agentic.py`, `cognitive.py`, `video_scripting.py` │
│    inject EXPLICIT language instruction:                         │
│    "Respond ENTIRELY in {language}. Do not mix languages."       │
│  - TTS voice selection auto-switches based on language            │
│    (zh → CosyVoice-zh, en → CosyVoice-en)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

### Frontend State: Updated `LanguageContext.tsx`

```typescript
interface LanguageContextType {
    // UI language — controls all static interface text
    language: Language             // 'zh' | 'en'
    setLanguage: (lang: Language) => void

    // Content language — controls AI-generated lesson text
    contentLanguage: Language
    setContentLanguage: (lang: Language) => void

    // UI translation helper
    t: (path: string, vars?) => string
}
```

**Key rules:**
- When `setLanguage()` is called, `contentLanguage` is also updated **unless** the user has explicitly overridden it separately via Settings.
- `contentLanguage` is sent in every API call that generates content: `/analyze-topics`, `/create-class`.
- If a user sets UI=zh but contentLanguage=en, the UI shows Chinese labels but DeepSeek generates the lesson plan in English.

---

### Backend Enforcement: Prompt Language Lock

All prompts in `agentic.py`, `cognitive.py`, and `video_scripting.py` must include a **language instruction at the top**:

```python
LANGUAGE_INSTRUCTION = {
    "zh": "请用中文回复。所有内容、标题、说明和练习题均必须用中文书写。禁止使用英文。",
    "en": "Reply entirely in English. All content, titles, explanations, and exercises must be in English. Do not mix languages."
}

def build_prompt(base_prompt: str, language: str) -> str:
    return f"{LANGUAGE_INSTRUCTION[language]}\n\n{base_prompt}"
```

This is applied to every `api_client.py` call that generates educational content.

---

### TTS Voice Auto-Selection

The TTS voice must match the content language to avoid Chinese voice reading English text:

| `contentLanguage` | Default TTS Voice |
| :--- | :--- |
| `zh` | `CosyVoice2-0.5B` (Chinese female, `chinese_female_meimei`) |
| `en` | `CosyVoice2-0.5B` (English neutral, `english_neutral_voice`) |

The voice can be further overridden by the user's explicit voice selection in the UI.

---

### Content Consistency Rules (AI-Generated)

The following content types must **all** be in `contentLanguage`:

| Content Type | Module | Required Language Enforcement |
| :--- | :--- | :--- |
| Topic suggestions | `analyze-topics` endpoint | ✅ Pass `language`, inject in prompt |
| Lesson title & description | `cognitive.py` | ✅ Pass `language`, inject in prompt |
| Learning objectives | `agentic.py` | ✅ Pass `language`, inject in prompt |
| Video scene narrations | `video_scripting.py` | ✅ Pass `language`, inject in prompt |
| Manim code comments | `manim_renderer.py` | ✅ Math formulas are language-neutral |
| Exercise questions & answers | `agentic.py` | ✅ Pass `language`, inject in prompt |
| Chat assistant response | `/teach` endpoint | ✅ Pass `language`, inject in prompt |

---

### Settings UI: Separate Content Language Override

Added to `/settings` page under **Preferences**:

```
[ Default Language ]
  ○ 中文（简体）  ● English (US)

[ Content Generation Language ]      ← NEW, separate control
  ● Match UI Language   ○ Override: [ Select Language ▾ ]
```

This allows power users to use the app in Chinese but generate lesson content in English (for bilingual teaching).

