# MentorMind VPS Scaling, Safety, and Growth Plan

## Current Production Shape

The production path is a single CentOS VPS running Docker Compose:

- nginx publishes port 80 and routes frontend, WebSockets, media, and media proxy traffic.
- Next.js handles browser pages plus `/api/backend/*` proxy routes.
- FastAPI handles generation, board streaming, persistence, and auth verification.
- Celery workers process long-running class and unit generation queues.
- PostgreSQL stores durable user, study-plan, lesson, and board-session state.
- Redis stores Celery broker/results and short-lived job/unit status.

This is good enough for a controlled beta, but the main bottleneck is not HTTP serving. It is LLM/TTS/rendering concurrency and high-frequency board save traffic.

## Study Plan Generation Efficiency

Near-term changes:

- Add idempotency for `/study-plan/create` using a client-provided `request_id` or a hash of user id plus normalized plan payload. This prevents duplicate plans from double-clicks or retries.
- For `/study-plan/{plan_id}/unit/{unit_id}/generate`, store Celery `task_id`, requested `content_types`, and `generation_started_at` on the unit. The current status flag prevents some duplicates, but storing the task id improves resume, cancellation, and admin visibility.
- Cache generated unit content by `subject + framework + course_name + unit title + topics + content_types + language + difficulty`. Many beta users will request overlapping AP/Gaokao units.
- Split unit content generation into smaller cacheable tasks by content type. The generator already runs content types concurrently inside one Celery task; moving each type to its own task improves partial success and retry behavior.
- Make educational image search optional or delayed. It is non-critical enrichment and should not hold the main unit content path.

Recommended worker layout for 100 active users:

- Keep `orchestration` concurrency modest, around 4-8 per VPS depending on CPU/RAM.
- Keep `rendering` concurrency at 1 unless Manim rendering is proven stable with more.
- Keep `heavy_ml` concurrency low, around 1-2, because ASR/OCR/model loading can dominate memory.
- Add queue-depth alerts before increasing concurrency. More workers can make LLM/provider limits worse if there is no backpressure.

## Board Lesson Generation And Saving

Current strengths:

- Board sessions are owner-checked.
- Board snapshots are persisted to `board_sessions`.
- WebSocket reconnect can resurrect sessions from the database.
- Client saves are debounced and unload uses `sendBeacon`.

Risks at 100 concurrent board users:

- Client save debounce is currently 750 ms, which can create heavy write pressure during active streaming.
- Save payloads are capped at 256 KB, but frequent JSON writes still hit Postgres.
- `_board_sessions` is process-local. If the backend scales to multiple API containers, WebSocket affinity or Redis-backed session coordination becomes required.
- `MAX_BOARD_SESSIONS = 100` means exactly 100 active board sessions can saturate one backend and block the 101st user.

Near-term changes:

- Increase client save debounce to 2-3 seconds during streaming, with immediate save on unload and every important terminal event.
- On the backend, skip board save writes when `last_event_seq` is not newer than the persisted row.
- Batch board persistence server-side: persist every 10 events or every 5 seconds, whichever comes first.
- Store board event deltas in Redis Streams during active generation, then compact to PostgreSQL snapshots periodically and at completion.
- Raise `MAX_BOARD_SESSIONS` only after measuring memory per session. A safer beta default is 100 active sessions per VPS with clear 429 messaging and a wait/retry UX.

## Anti-Scraping And Automation Protection

Already present:

- Auth is required for study-plan and board lesson creation.
- Board session ownership checks prevent cross-user session access.
- Board save rejects unknown session ids and oversized payloads.
- SlowAPI limits board save to `60/minute`.
- nginx now limits per-IP connections, auth endpoint bursts, WebSocket connection bursts, and media proxy bursts.

Next changes:

- Add per-user quotas in Redis for expensive actions:
  - study plan chat messages per hour
  - unit generations per day
  - board lessons per day
  - concurrent board sessions per user
- Add request fingerprinting for unauthenticated routes: IP, user-agent, accept-language, and a short-lived signed cookie.
- Add a proof-of-work or CAPTCHA challenge only after suspicious behavior, not for normal learners.
- Require signed URLs or HMAC signatures for `/media-proxy/` and reject unsigned external URL proxying.
- Add admin abuse dashboard: top IPs, top users by token spend, failed auth bursts, open board sessions, queue depth.
- Put Cloudflare or another edge proxy in front of the VPS when public beta begins. Use WAF managed rules, bot fight mode, and country/ASN rules only if abuse appears.

## DAU Growth: Simpler Next Phase

The DAU goal argues for reducing first-use friction before building more heavy infrastructure.

Recommended path:

1. Mobile web/PWA first
   - Fastest path from current Next.js app.
   - Add install prompt, shareable study-plan links, push-style in-app notifications, and a lightweight daily review page.
   - Best for testing retention loops without app-store overhead.

2. WeChat Mini Program second
   - Strong fit if the target beta is Chinese students/parents.
   - Use it as a thin shell over core flows: login, daily tasks, study-plan library, board lesson launch, progress reminders.
   - Keep generation APIs on the existing backend.

3. Native app later
   - Useful after retention is proven.
   - More expensive to build and maintain, and slower to iterate while the learning loop is still changing.

DAU mechanics to prioritize:

- Daily task card: one small review, one weak-point question, one recommended board lesson.
- Streaks tied to meaningful learning actions, not just opening the app.
- WeChat/share invite for a generated study plan or board summary.
- Parent/teacher digest for progress, especially for Gaokao/AP style goals.
- Notification loop for completed generation: “your board lesson is ready” and “review this before it fades.”
- Public lightweight diagnostic without signup, then account creation only when saving the plan.

## Suggested Next Engineering Phase

1. Add Redis per-user quotas and queue-depth visibility.
2. Reduce board save frequency and add backend no-op detection by `last_event_seq`.
3. Store generation task ids on study-plan units.
4. Add cache keys for common unit content.
5. Build a PWA daily review home screen and shareable board summary link.
6. Revisit horizontal scaling only after measuring real beta traffic on one VPS.
