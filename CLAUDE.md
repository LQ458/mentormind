# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Python-primary project. The backend uses Python with Celery for async tasks. Frontend uses TypeScript/Next.js. Docker is used for local deployment.

## Debugging

When investigating bugs, first check if the issue is a client-side artifact (e.g., terminal display truncation) before diving into server-side debugging.

## Database

Before making database migration changes, always review existing migration scripts to understand the current migration direction and avoid contradictory migrations.

Before applying any fix, check what other files reference the affected table/column and whether the change could break existing migrations, auth flows, or API contracts. List potential secondary issues first.

## Development Workflow

After making backend changes (especially to routes, endpoints, or server config), always restart the relevant server/service before testing.

## Testing

Before analyzing test coverage, check for existing test files using `find . -name 'test_*' -o -name '*_test.*' -o -path '*/tests/*'` first. Do not assume no tests exist.

## MentorMind Backend Architecture

This is the backend for MentorMind, an AI-powered educational platform that creates personalized lessons and videos. The application supports bilingual operation (English/Chinese) and handles complex AI workflows for content generation.

### Core Architecture

- **FastAPI server** (`server.py`) - Main API server with authentication, lesson management, and video generation endpoints
- **Celery task queue** (`celery_app.py`) - Handles long-running tasks like video generation and content processing
- **PostgreSQL database** - User management, lesson storage, analytics via SQLAlchemy ORM
- **Redis** - Celery message broker and caching layer

### Key Components

#### Core Modules (`core/`)

- **create_classes.py** - Main class/lesson creation orchestration with cognitive processing
- **modules/mentor.py** - AI mentor agent for interactive teaching
- **modules/robust_video_generation.py** - Video generation pipeline using Manim
- **modules/video_scripting.py** - Script generation for educational videos
- **rendering/manim_renderer.py** - Mathematical animation rendering
- **asr.py** - Audio transcription using FunASR and Whisper
- **summarize.py** - Content summarization capabilities

#### Services (`services/`)

- **api_client.py** - External API integrations (SiliconFlow, OpenAI, etc.)
- **funasr/** - Speech recognition service
- **paddleocr/** - Optical character recognition for Chinese text
- **tts/** - Text-to-speech synthesis
- **heygen.py** - Video avatar generation
- **siliconflow.py** - LLM API integration

#### Database (`database/`)

- **models/** - SQLAlchemy models for users, lessons, analytics
- **storage.py** - Lesson storage and retrieval logic
- **base.py** - Database configuration

#### Prompts (`prompts/`)

- **video/** - Video generation prompts and templates
- **learning/** - Educational content prompts
- **language/** - Bilingual prompt support
- **loader.py** - Prompt template system

### Development Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run main server (port 8000)
python server.py

# Run auxiliary services
python funasr_server.py    # Speech recognition (port 10095)
python paddleocr_server.py # OCR service (port 8866)

# Run Celery worker for background tasks
celery -A celery_app worker --loglevel=info

# Database operations
python migrate_db.py  # Database migrations

# Testing
pytest                # Run tests
black .               # Code formatting  
flake8                # Linting

# Docker deployment
docker build -t mentormind-backend .
docker run -p 8000:8000 mentormind-backend
```

### Key Dependencies

- **FastAPI** - Web framework with async support
- **SQLAlchemy + asyncpg** - Database ORM and PostgreSQL driver
- **Celery + Redis** - Task queue and message broker
- **Manim** - Mathematical animation engine for video generation
- **FunASR + Whisper** - Speech recognition models
- **PaddleOCR** - Chinese text recognition
- **PyJWT** - Authentication tokens

### Chinese Language Support

The codebase includes comprehensive Chinese language support:

- **zhconv** - Traditional/Simplified Chinese conversion
- **jieba** - Chinese text segmentation
- **cn2an** - Chinese numeral conversion
- **pynlpir** - Chinese NLP processing
- **edge-tts** - Chinese TTS synthesis
- **texlive-lang-chinese** - LaTeX Chinese font support

### Video Generation Pipeline

The video generation system uses multiple stages:

1. **Content Planning** - Cognitive processing of educational material
2. **Script Generation** - Creating narration and visual descriptions
3. **Manim Rendering** - Mathematical animations and visual elements
4. **Audio Synthesis** - TTS generation with timing synchronization
5. **Final Assembly** - Combining audio, video, and interactive elements

### Authentication & User Management

- JWT-based authentication with user profiles
- PostgreSQL storage for user data and preferences
- Support for bilingual user preferences (English/Chinese)
- Analytics tracking for user engagement and learning progress

### Task Queue Architecture

Long-running operations use Celery:

- **create_class_video_task** - Full lesson video generation
- **transcript_to_lesson_task** - Convert audio to structured lessons
- **transcribe_audio_task** - Audio transcription processing

Results are stored in Redis with progress tracking for real-time updates.
