# MentorMind — Technical Context for AI Planning Agent

## Your task

Recommend concrete, prioritized actions to:
1. Speed up the site for users in mainland China
2. Make login/signup and internal testing frictionless
3. Test and harden the board lesson feature (sound, resume, persistence, long sessions)

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14.2.29, React 18, TypeScript, Tailwind CSS |
| Backend | FastAPI v2 (`server.py`, ~90 endpoints), Python 3.12 |
| Task Queue | Celery 5.3.6 (3 isolated queues: orchestration, rendering, heavy_ml) |
| Database | PostgreSQL 15 Alpine |
| Cache/Broker | Redis 7 Alpine |
| Auth | Clerk (`@clerk/nextjs` v5.6.3, JWKS verification via `backend/auth.py`) |
| AI Models | DeepSeek V3 + R1 via SiliconFlow API (`api.siliconflow.cn`) |
| TTS | Volcengine (ByteDance `openspeech.bytedance.com`) with edge-tts fallback |
| ASR | FunASR (Alibaba Paraformer, port 10095) + Whisper fallback |
| OCR | PaddleOCR (Baidu, port 8866) |
| Video | Manim 0.18 (math animations), Remotion 4.0 (React video) |
| Visualization | D3.js 7 (knowledge graph), KaTeX (math rendering) |
| WS Streaming | Native Python `websockets` via FastAPI `/ws/board/{id}` |
| Container | Docker Compose, 7 services |
| Package mgmt | pnpm (frontend), pip (backend) |

---

## 2. Deployment Architecture

**Current production setup (inferred from logs and config):**

```
Browser (China user)
  → CloudFlare CDN (104.28.x.x observed)
    → Vercel (Next.js frontend, port 3000)
      → API proxy → Nginx (Docker container `nginx-proxy`, nginx:alpine)
        → 443/80 → upstream frontend:3000
        → /ws/ not yet routed (being fixed)
  → Also direct to backend via Nginx:
    → Tencent Cloud CVM `VM-0-16-centos` (CentOS)
      → Docker Compose stack on `mentormind-net`
        → backend:8000 (FastAPI)
        → 3x Celery workers
        → postgres:5432, redis:6379
```

**Key facts:**
- Frontend on Vercel (behind CloudFlare). No China-optimized CDN configured.
- Backend on Tencent Cloud CVM (likely HK or mainland China zone).
- Nginx container (`nginx-proxy`) on separate Docker network, connected via `mentormind-net`.
- No resource limits on any Docker container.
- No Redis query cache. Redis only for Celery broker + job results.
- Static assets: local filesystem (`data/`) or S3-compatible (R2/OSS) via `S3_ENABLED` env.
- FunASR and PaddleOCR services commented out in docker-compose (run locally or not at all).

**Planned production (from `docs/deployment_plans.md`):**
- Plan A: Alibaba Cloud HK (no ICP needed, DCDN for mainland video). ~5000 CNY/month.
- Plan B: Supabase + Vercel + Railway (MVP, explicitly warned as slow from China).

---

## 3. Auth System

**Clerk (primary, working):**
- Clerk test instance: `prime-snapper-91.clerk.accounts.dev` (dev keys: `pk_test_...`)
- Backend verifies JWT via JWKS (`PyJWKClient`, RS256, audience check skipped).
- Frontend: `<SignInButton mode="modal">` in Topbar. Clerk-hosted sign-in UI.
- User auto-created in PostgreSQL on first Clerk auth (`auth.py:128-140`).
- Every API call sends `Authorization: Bearer <token>` from `getToken()`.
- **No dev auth bypass exists.** No `SKIP_AUTH` flag. All endpoints require valid Clerk JWT.
- **Clerk dev keys in production** — the token logs show `prime-snapper-91.clerk.accounts.dev` issuer. Dev instances have strict rate limits.

**Legacy custom auth (broken):**
- Login/register pages at `/auth/login`, `/auth/register` with email+password forms.
- **Backend endpoints `/auth/login` and `/auth/register` do NOT exist in server.py.**
- Custom `AuthContext.tsx` stores `mm_token` in localStorage but nothing uses it.

**Test accounts:**
- `.env` has `TEST_USER=test`, `TEST_PASSWORD=abcde123A!` — never referenced in any code.
- No seed data, no test fixtures, no demo users.
- User records created only on first Clerk authentication.

---

## 4. Board Lesson Feature — Technical Details

### Sound/Audio
- **Primary TTS**: Volcengine (ByteDance) — `BV001_streaming` female / `BV002_streaming` male voices.
- **Fallback**: edge-tts (Microsoft neural voices) auto-triggers when Volcengine creds missing or on auth/network errors.
- **Audio pipeline**: `BoardTTSSync` in `backend/core/streaming/tts_sync.py`. Board elements emitted immediately. TTS runs async in background (max 4 parallel). Audio saved as MP3 to `data/board-audio/`.
- **Delivery**: `audio_ready` events over WebSocket with `audio_path` URL. Frontend `NarrationPlayer` (`web/app/components/board/NarrationPlayer.tsx`) plays via `<audio>` element.
- **Fast mode**: `BOARD_FAST_MODE` env var skips backend TTS, uses browser `window.speechSynthesis` instead.

### Resume After Disconnect
- **Reconnect**: 5 retries, exponential backoff (500ms→1s→2s→4s→8s + jitter).
- **Fatal close codes** (no retry): 4001 (unauthorized), 4003 (forbidden), 4004 (session not found).
- **State restoration**: On page load, fetches `GET /board/{id}/state` before opening WebSocket. Hydrates elements, narration log, audio queue, chat history.
- **In-memory grace period**: Session stays alive 600 seconds (10 min) after WS disconnect. After that, removed from memory but PostgreSQL row persists.
- **Client auto-save**: 750ms debounced save to `/board/{id}/save`. Also `sendBeacon` on tab close.

### Persistence
- **Database**: `board_sessions` PostgreSQL table. JSON columns for elements, element_order, narration_log, audio_queue, chat_history.
- **Save triggers**: WS connect, every 5 events, WS disconnect, client auto-save, tab close beacon.
- **Load**: `GET /board/{id}/state` checks DB first, falls back to in-memory `_board_sessions` dict (recent fix).

### Long-Running
- **No hard session timeout** for the main WebSocket stream (it's a direct coroutine, not a Celery task).
- **Rate limits**: 100 global sessions, 5 per user. Board elements max 200. Event log max 500.
- **Save endpoint**: 60 requests/minute, 256KB payload cap.
- **Celery task for re-generation**: 60s soft limit (`regenerate_board_segment_task`).

### WebSocket Auth
- Token sent as query param: `?token=<clerk_jwt>`. Decoded via `decode_token()` from `auth.py`. User ID matched against session owner.

---

## 5. China Performance Factors

| Factor | Current State | Impact |
|--------|--------------|--------|
| **Frontend CDN** | Vercel behind CloudFlare | CloudFlare has limited mainland China edge nodes. Vercel's default edge network is not China-optimized |
| **Backend location** | Tencent Cloud CVM (likely HK/CN) | Good for API calls from China |
| **AI API endpoints** | `api.siliconflow.cn` (China-hosted) | Good latency from China |
| **TTS** | `openspeech.bytedance.com` (China-hosted) | Good latency |
| **Image sources** | Unsplash, Pixabay, Wikipedia | International endpoints — slow from China |
| **Static assets** | Local filesystem or S3-compatible | No China CDN for uploaded media |
| **Frontend bundle** | Includes Remotion (video lib), D3, mathjs — no code splitting | Large initial load, bad on slow connections |
| **No Redis query cache** | Every request hits PostgreSQL | Adds latency on repeated queries |
| **Clerk hosted UI** | `clerk.accounts.dev` | Not optimized for China. Sign-in loads from global Clerk infrastructure |
| **No lazy loading** | No `next/dynamic` for heavy pages | Full bundle on first load |

---

## 6. Testing Infrastructure

- **Framework**: pytest v9.0.2, ~30 test files in `tests/unit/` and `tests/integration/`.
- **No test scripts in package.json** for frontend.
- **No Makefile**.
- **No CI/CD configuration** found.
- **No auth bypass for testing** — all endpoints require real Clerk JWT.
- **No seed data or fixtures** for test users.

---

## 7. Container Resource Usage

No CPU/memory limits set on any container. Current containers:
- `postgres` (PostgreSQL 15 Alpine)
- `redis` (Redis 7 Alpine)
- `backend` (FastAPI, port 8000)
- `celery-orchestration` (concurrency=4)
- `celery-rendering` (concurrency=1)
- `celery-heavy-ml` (concurrency=2)
- `frontend` (Next.js, port 3000)

---

## 8. Known Issues

1. **Nginx `/ws/` block** recently added to route WebSocket to backend:8000 (was crashing into frontend:3000).
2. **Clerk dev keys in production** — `pk_test_...` keys visible in JWT tokens. Rate-limited.
3. **No `NEXT_PUBLIC_BACKEND_WS_URL`** — removed (now uses same-origin `wss://mentormind.cloud/ws/...`).
4. **Board state 404** — fixed (now falls back to in-memory sessions).
5. **PostgreSQL connection pool bug** — crashes if DATABASE_URL set without POSTGRES_* vars.
6. **No database migrations framework** — manual `migrate_db.py` script only.
7. **Legacy auth pages broken** — `/auth/login` and `/auth/register` have no backend endpoints.
8. **Heavy frontend bundle** — Remotion, D3, mathjs all bundled. No `next/dynamic`.
