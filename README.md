# MentorMind

AI-driven educational platform for study plans, quick tutoring, seminar-style discussion, board lessons, and multimodal learning support.

## Overview

MentorMind is a Compound AI System that "understands, reconstructs, and teaches" educational content. The current product is centered on:

**Key features:**
- **Quick question (`/ask`)**: image/PDF/audio/text context, problem-vs-discussion response modes, learner follow-up actions, and math rendering.
- **Study plan (`/study-plan`)**: AP, IB, A Level, Gaokao, and general curricula with low-friction intake and Mina-guided planning.
- **Seminar mode (`/seminar`)**: multiplayer/AI debate rooms with facilitator-style AI support.
- **Board lessons (`/board/[sessionId]`)**: interactive board sessions with saved state, narration, and lesson elements.
- **Multimodal ingestion**: audio transcription and image/PDF OCR through queued backend workers.
- **First-party feedback loop**: structured user reports and automatic error breadcrumbs stored in telemetry for later AI-agent triage.

## Feedback, Error Collection, and AI Triage

MentorMind has three first-party feedback entry points for beta testing:

1. **Global quick feedback**
   - Entry: the visible fixed `Report / 报告问题` button on every page, plus the message icon in the topbar.
   - UI: `web/app/components/FeedbackHub.tsx`.
   - Use cases: bug report, function feedback, feeling feedback, or general feedback.
   - Storage: sends a `feedback_moment` telemetry event to `POST /telemetry/event`, stored in the `telemetry_events` table.

2. **Surface-local report**
   - Entry: `ReportIssueButton` mounted on high-risk flows, including board lessons and study-plan generation/review.
   - UI: `web/app/components/ReportIssueButton.tsx` opening `FeedbackHub` with a surface-specific snapshot.
   - Use cases: "this board lesson is mismatched", "plan generation failed", "this generated plan is wrong."
   - Storage: same `feedback_moment` telemetry path, with `payload.surface` and `payload.context.app_snapshot` identifying the flow.

3. **Moment-level report**
   - Entry: `Mark this moment / 标记这一刻` on specific answer cards, currently wired on `/ask`.
   - UI: `web/app/components/FeedbackMoment.tsx`.
   - Use cases: "this answer/step/UI state is wrong right here."
   - Storage: also sends a `feedback_moment` telemetry event, so it is analyzed together with error telemetry.

Both feedback paths automatically attach bounded debugging context from `web/app/lib/telemetry.ts`:

- current route and URL
- viewport size and browser language/user agent
- feedback kind, severity, surface, and interaction id
- user note and expected behavior
- recent safe telemetry breadcrumbs
- recent console errors, failed network requests, WebSocket closes, and long-task signals
- a surface-specific app snapshot, for example `/ask` answer mode and upload state

Automatic error collection:

- `error_console`: global browser errors and unhandled promise rejections
- React render crashes are captured by `ErrorBoundary`, which also shows a local report button with the crash context.
- `error_network`: failed `fetch` requests with method, path, status code, and duration
- `ws_close`: WebSocket close events where implemented
- `long_task`: browser jank signals
- `page_view`, `page_unload`, and normal `interaction` breadcrumbs

Backend path:

- Allowed event types live in `backend/database/models/telemetry.py`.
- Event ingestion and payload sanitization live in `backend/server.py` at `POST /telemetry/event`.
- Data is stored in `telemetry_events` with `session_id`, `event_type`, `page`, `url`, `latency_ms`, `payload`, viewport, user agent, IP, and timestamp.
- User-written fields are capped; nested feedback context is recursively bounded before storage.

AI/coding-agent triage contract:

1. Query recent `feedback_moment`, `error_console`, `error_network`, `ws_close`, and latency events from `telemetry_events`.
2. Group by `payload.surface`, `page`, `payload.feedback_kind`, API path/status, and error signature.
3. Build an issue packet with:
   - user report
   - expected behavior
   - route, viewport, and browser
   - recent events/errors
   - likely surface files
   - reproduction steps
   - suggested tests
4. Reproduce locally with Playwright/API tests.
5. Patch, run focused checks, and summarize the fix.

Production autopilot QA:

- `scripts/prod-autopilot-qa.mjs` runs authenticated production journeys against `https://mentormind.cloud`, stores local reports under `web/.browser-sessions/prod-autopilot-qa/`, and auto-reports real findings as `feedback_moment` telemetry events with `schema = mentormind.prod_autopilot_bug.v1`.
- It currently covers responsive primary routes, `/ask` discussion flow, study-plan create routing, WebSocket upgrade, malformed API requests, malformed upload requests, and a bounded low-concurrency pressure smoke.

More detail is in `docs/ai-testing-feedback-architecture.md`.

Architectural references used for this loop:

- **Sentry-style breadcrumbs**: keep a short timeline of actions/errors before the user reports a problem.
- **OpenTelemetry-style event attributes**: store structured event names plus bounded attributes instead of ad hoc logs.
- **Session replay tools such as LogRocket/FullStory**: capture route, device, network, and recent actions, but here we avoid full replay and keep a privacy-light bounded snapshot.
- **GitHub issue template / bug packet workflow**: convert messy user feedback into a reproducible packet with expected/actual behavior and evidence.
- **Event-sourcing-lite**: store small append-only telemetry facts first, then derive issue clusters later.

## Architecture

### Backend Structure

```
backend/
├── server.py                  # FastAPI app, HTTP endpoints, and WebSocket endpoints
├── celery_app.py              # Celery tasks and queue workers
├── auth.py                    # Better Auth/test-bypass token verification
├── config/                    # Configuration management
├── core/                      # Study plan, board, ingestion, generation, and agent logic
│   ├── agents/                # Study-plan and subject agents
│   ├── board/                 # Board state/session helpers
│   ├── content/               # Unit content generation
│   ├── modules/               # Legacy and current lesson/video pipeline modules
│   └── rendering/             # Manim rendering helpers
├── database/                  # SQLAlchemy base, models, and storage helpers
├── prompts/                   # Subject, framework, board, seminar, and video prompts
├── services/                  # LLM, ASR, OCR, TTS, storage, and API clients
└── tests/                     # Backend-focused pytest tests
```

```
web/
├── app/                       # Next.js 14 App Router pages/components/API proxy routes
├── app/api/backend/           # Next.js proxy routes to FastAPI
├── app/components/            # App shell, feedback, auth, math, board, and shared UI
├── app/lib/                   # Telemetry, subjects, framework metadata, translations
├── app/hooks/                 # Upload, board WS, shortcuts, fullscreen, and local draft hooks
├── public/                    # Static fixtures/assets
└── package.json               # Frontend scripts/dependencies
```

### Current Frontend Entry Points

- `/`: minimal product home.
- `/ask`: one-off question flow with upload context, discussion/problem modes, next-step actions, and moment feedback.
- `/study-plan`: course framework and subject selection, learner profile, Mina planning chat, review, and save.
- `/study-plan/[id]`: plan detail, unit generation, board lesson entry, and AI ask sidebar.
- `/seminar`: multiplayer/AI seminar rooms.
- `/board/[sessionId]`: interactive board lesson session.
- `/admin/feedback`: beta survey and feedback review.

### Core Services

1. **FastAPI server** (`backend/server.py`)
   - Main API surface for study plans, quick questions, ingestion, board sessions, seminar rooms, feedback, and telemetry.

2. **Celery workers** (`backend/celery_app.py`)
   - Background lesson generation, image OCR, audio transcription, notification sync, and memory-heavy tasks.
   - The `heavy_ml` queue is required for long audio transcription/OCR flows.

3. **FunASR service** (`backend/services/funasr/`)
   - Audio transcription service integration.

4. **PaddleOCR service** (`backend/services/paddleocr/`)
   - Image/PDF OCR service integration.

5. **LLM/TTS clients** (`backend/services/api_client.py`, `backend/services/tts/`, `backend/services/siliconflow_tts.py`)
   - DeepSeek/SiliconFlow-backed reasoning and speech synthesis. The architecture docs explicitly prohibit OpenAI API usage in production code.

6. **Telemetry and feedback**
   - Browser collection in `web/app/lib/telemetry.ts`.
   - UI entry points in `FeedbackHub` and `FeedbackMoment`.
   - Backend storage through `POST /telemetry/event`.

### Getting Started with Real Services

1. **Set up environment variables**:
```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file and add your DeepSeek API key
# Get your API key from: https://platform.deepseek.com/
# Edit .env and set: DEEPSEEK_API_KEY=your_actual_key_here

# Optional: Set local service endpoints if you have them running
# FUNASR_ENDPOINT, PADDLE_OCR_ENDPOINT
```

2. **Start the backend locally**:
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python server.py
```

3. **Run focused backend tests**:
```bash
cd backend
python -m pytest tests/test_telemetry_events.py -q
```

4. **Run the frontend**:
```bash
cd ../web
pnpm install
pnpm dev
```

The local frontend defaults to `http://localhost:3000` and proxies backend calls through `web/app/api/backend/*`.

### Configuration Management

Runtime settings come from `.env` / environment variables and are read by `backend/config/config.py`, the Docker Compose files, and the Next.js proxy routes.

Important deployment variables:

- `DEEPSEEK_API_KEY`: required for DeepSeek-backed AI responses.
- `NEXT_PUBLIC_API_BASE`: frontend browser API base when not using same-origin proxy.
- `BACKEND_URL`: Next.js server-side proxy target, usually `http://backend:8000` in Docker or `http://localhost:8000` locally.
- `NEXT_PUBLIC_BACKEND_WS_URL`: leave blank for same-origin production WebSockets through nginx `/ws/`.
- `NEXT_PUBLIC_AUDIO_INGEST_POLL_MINUTES`: frontend audio-transcription polling window.
- `MENTORMIND_ADMIN_USERS`: optional comma/space-separated user ids, usernames, or emails allowed to view `/admin/feedback` and `/admin/metrics`.
- `NEXT_PUBLIC_SHOW_TWEAKS`: set `true` only when you want the tweaks panel visible outside local dev.

## Quick Start

### Production on a CentOS VPS

Use the production compose workflow for the single-VPS deployment:

```bash
cp .env.example .env
# edit .env with production secrets and public URL
./scripts/deploy-prod.sh deploy
```

This builds the backend image once for the API and Celery workers, runs migrations, starts PostgreSQL/Redis/backend/web/nginx, and preserves Docker dependency layers plus model/data volumes across deploys.

For HTTPS, terminate TLS in the VPS-level nginx or another front proxy, then forward to the bundled nginx. Keep WebSocket upgrade headers and the larger upload/body timeout settings from `nginx/external-tls-proxy.example.conf`.

### Local Development

```bash
cd mentormind

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python server.py

# Frontend, in another terminal
cd web
pnpm install
pnpm dev
```

The app runs at `http://localhost:3000`; the backend runs at `http://localhost:8000`.

### Docker Development

```bash
cp .env.example .env
docker compose up --build
```

### Common Debug Paths

- Frontend proxy routes: `web/app/api/backend/*`.
- FastAPI endpoints: `backend/server.py`.
- Celery queues/tasks: `backend/celery_app.py`.
- Upload handling: `web/app/hooks/useIngestUpload.ts`, `/ingest/audio`, `/ingest/image`.
- Feedback/telemetry: `web/app/lib/telemetry.ts`, `FeedbackHub`, `FeedbackMoment`, `/telemetry/event`.
- Production proxy: `nginx/default.conf`, `nginx/nginx.conf`, `nginx/external-tls-proxy.example.conf`.

### Legacy Video Pipeline Note

Several files under `docs/` describe the earlier educational video-generation system. Those documents are useful historical research, but the current beta product source of truth is the app architecture, deployment, study-plan, quick-question, seminar, upload, and feedback-loop documentation listed in `docs/README.md`.

## 📊 Technology Stack ("Dragon Stack")

| Component | Technology | Provider | Why This Choice |
|-----------|------------|----------|-----------------|
| Main LLM | DeepSeek V4 Flash / Pro | DeepSeek | Low-cost Chinese/English reasoning with approved model allowlist |
| Planning / generation | DeepSeek V4 Pro | DeepSeek | Higher-quality structured lesson and study-plan generation |
| ASR | FunASR (Paraformer) | Alibaba DAMO | State-of-the-art Chinese recognition |
| OCR | PaddleOCR | Baidu | Best for complex Chinese textbooks |
| Knowledge Graph | NetworkX → NebulaGraph | Open Source | Graph analysis + distributed storage |
| Vector DB | Milvus | Zilliz | Leading open-source vector DB (born in China) |

## 💰 Cost Analysis

**Estimated Monthly Costs (Aliyun/Tencent Cloud):**
- Model APIs (DeepSeek): ~$50 USD (50M tokens)
- Compute (ECS GPU): ~$100 USD
- Storage (OSS): ~$10 USD
- **Total: ~$160 USD/month** (vs. ~$1500+ for Western stack)

## Current Roadmap

This repository includes older planning documents for the original video-generation direction. The current product roadmap is tracked around study plans, quick tutoring, seminar mode, upload robustness, and feedback-driven iteration.

### Implemented in the current beta

- [x] FastAPI + Next.js app shell.
- [x] Study-plan creation and Mina planning chat.
- [x] Quick-question flow with image/PDF/audio/text context.
- [x] Math rendering for quick-question answers.
- [x] Discussion-mode quick-question responses with learner next-step actions.
- [x] Seminar room backend/frontend skeleton.
- [x] Board lesson sessions and WebSocket state sync.
- [x] Production nginx upload/body-size and WebSocket proxy settings.
- [x] Audio ingestion worker availability checks for `heavy_ml`.
- [x] Global and moment-level feedback collection into telemetry.
- [x] Production autopilot QA runner for live journey/pressure/upload-edge checks.

### Active gaps

- [ ] Extend `FeedbackMoment` beyond `/ask` to study-plan chat turns, seminar turns, upload errors, and board lessons.
- [ ] Build an issue-packet exporter that clusters telemetry rows into agent-readable bug folders.
- [ ] Promote the production autopilot QA journeys into CI/staging Playwright specs for `/ask`, `/study-plan`, `/seminar`, and `/board`.
- [ ] Improve long-audio UX with chunking or streaming transcription instead of asking users to manually trim files.
- [ ] Harden seminar WebSocket/audio-turn behavior behind production nginx.
- [ ] Continue prompt/product work for distinctive teaching styles, examples, and visual explanation quality.

## 🧪 Testing

```bash
# From repo root: backend focused tests
python -m pytest

# Telemetry/feedback event tests
python -m pytest tests/test_telemetry_events.py -q

# Upload validation regression
python -m pytest tests/integration/test_ingest_upload_errors.py -q

# Production autopilot QA, after installing web deps and Chromium
cd web
pnpm run qa:install-browsers
BASE_URL=https://mentormind.cloud QA_INVITE_CODE=<invite-code> pnpm run qa:prod
# Or reuse an existing tester account:
BASE_URL=https://mentormind.cloud QA_USERNAME=<username> QA_PASSWORD=<password> pnpm run qa:prod

# Frontend type check
pnpm exec tsc --noEmit
```

## Configuration and Validation

Environment variables are defined in `.env.example` and loaded by the backend config layer, Docker Compose, and Next.js proxy routes. Backend config validation lives in `backend/config/config.py`:

```python
from backend.config.config import config

warnings = config.validate_config()
```

The most important operational settings are documented in this README, `web/README.md`, and `docs/deployment_plans.md`.

## Project Structure

```text
mentormind/
├── backend/                    # FastAPI, Celery, AI services, DB models, tests
├── web/                        # Next.js 14 frontend and proxy routes
├── docs/                       # Current docs plus historical analysis
├── nginx/                      # Production nginx and external TLS proxy examples
├── scripts/                    # Deployment/smoke helper scripts
├── docker-compose.yml          # Local/full-stack compose
├── docker-compose.prod.yml     # Single-VPS production compose
├── .env.example                # Environment template
└── README.md                   # Current high-level handoff
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- DeepSeek for their excellent Chinese LLMs
- Alibaba DAMO for FunASR
- Baidu for PaddleOCR
- The open-source AI education community

---

**MentorMind**: Understanding, Reconstructing, and Teaching for the Chinese Education Market.
