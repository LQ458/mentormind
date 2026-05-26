# Pre-Beta Fixes — Design Document

**Date:** 2026-05-26  
**Status:** In Progress  
**Context:** Pre-internal-testing fixes identified during codebase audit

---

## Issue 1: Board Lesson Mid-Session Resume

### Problem
Board lessons cannot resume after browser close/disconnect:
- `StreamingLessonGenerator` always starts LLM from scratch — no resume parameter
- LLM conversation state (`messages[]`) never persisted
- Reconnect creates a new generator → duplicate events sent to client
- Board metadata (layout, background, current_focus) silently dropped during serialization
- `audio_queue` never populated server-side (only via unreliable client `sendBeacon`)
- Narration playback cursor always resets to 0 on reload

### Design
**True resume via LLM conversation persistence.** When a user disconnects mid-stream, the full `messages[]` array (system prompt + user messages + assistant tool calls + tool results) is persisted to a new `conversation_state` JSONB column in `board_sessions`. On reconnect, the conversation is re-injected into a fresh `StreamingLessonGenerator`, which continues teaching from where it left off.

**Why this works:** The LLM sees the full conversation history including all already-executed tool calls and their results. It produces a coherent continuation — not byte-identical to the original stream, but pedagogically sound.

### Changes

| Step | File | Description |
|------|------|-------------|
| 1a | `backend/migrate_db.py` | Add `conversation_state JSONB` column to `board_sessions` table |
| 1b | `backend/server.py` ~L4104 | Include `board` dict (layout, background, current_focus) in `_board_session_to_state_dict` |
| 1c | `backend/server.py` WS handler | Populate `session["audio_queue"]` on each `audio_ready` WebSocket event |
| 1d | `backend/server.py` WS handler | On disconnect, persist `messages[]` from `StreamingLessonGenerator` to `conversation_state` in DB |
| 1e | `backend/server.py` ~L5079 | On reconnect: load `conversation_state` + `BoardState.from_dict()`. If `conversation_state` exists, create generator with `resume_messages`. Don't create duplicate generator for completed sessions |
| 1f | `backend/core/streaming/lesson_generator.py` | Add `resume_messages: list[dict] \| None` param to `generate_lesson()`. If provided, load messages directly instead of building system prompt from scratch |
| 1g | `backend/core/board/state_manager.py` | Verify `from_dict()` restores all state correctly |
| 1h | `web/app/hooks/useBoardWebSocket.ts` | Track `last_played_audio_index`, persist via snapshot, restore on hydrate |
| 1i | `web/app/board/[sessionId]/page.tsx` | Show "Continue" / "View Archive" appropriate UI on in-progress sessions |

---

## Issue 2: Library Study Plans — Auth Migration Data Fix

### Problem
The Clerk → Better Auth migration (commit `c8046c2`, May 24 2026) changed user ID format from raw Clerk IDs (`user_2abc123...`) to deterministic UUID5 (`a1b2c3d4-...`). Study plans created pre-migration still have the old `user_id`, making them invisible in the library.

Additionally, the frontend silently swallows API errors — showing "No active study plans yet" instead of surfacing the actual error.

### Design
A one-time migration script that:
1. Finds all users with old-format IDs (matches `user_*` pattern)
2. Maps old ID → new UUID5 ID using the same derivation logic from the auth migration
3. Updates `study_plans.user_id`, `board_sessions.user_id`, `kg_concepts.user_id`, `kg_relationships.user_id`

Frontend fix: show error state instead of silent fallback to empty.

### Changes

| Step | File | Description |
|------|------|-------------|
| 2a | `backend/migrate_auth_user_ids.py` (new) | Migration script |
| 2b | `web/app/lessons/page.tsx` | Show error toast on API failure, add retry button |

---

## Issue 3: Multi-User Load Testing

### Problem
Zero load/concurrency testing infrastructure. No tools, no scripts, no metrics collection.

### Design
Use Locust (Python-native, WebSocket support via `locust-plugins`) for realistic load tests. Add a lightweight pytest smoke test for CI quick sanity checks.

**Scenarios:**
- Health check baseline
- Lesson listing under load
- Board session creation (triggers AI pipeline — use minimal durations)
- WebSocket board streaming (connect + receive events)

**Metrics:** P50/P90/P95/P99 latency, RPS, error rate, memory (psutil), DB connections.

### Changes

| Step | File | Description |
|------|------|-------------|
| 3a | `backend/requirements.txt` | Add locust, locust-plugins |
| 3b | `tests/load/locustfile.py` (new) | HttpUser + WebSocketUser scenarios |
| 3c | `tests/load/test_smoke.py` (new) | 5-user concurrent pytest burst test |
| 3d | `tests/load/conftest.py` (new) | Shared auth helpers |
| 3e | `pytest.ini` | Add `load` marker |

---

## Issue 4: Knowledge Map — Real Algorithms

### Problem
Knowledge map is pure LLM extraction → DB → D3 visualization. 1500+ lines of graph algorithms (cognitive.py, sophisticated_pipeline.py) exist but are dead code, tied to incompatible data models.

### Design
Add a lightweight learning path computation using networkx (already a dependency):
- Build DiGraph from prerequisite edges with quality gates (weight≥0.6, lesson_count≥2, same-subject)
- Topological sort with cycle detection and breaking
- Compute proficiency score per concept (`min(1.0, lesson_count/5)`)
- Return `learning_path` array in existing `/users/me/knowledge-graph` response

**Quality gates prevent noisy LLM edges from producing bad recommendations.**

### Changes

| Step | File | Description |
|------|------|-------------|
| 4a | `backend/core/knowledge/extractor.py` | Add `_compute_proficiency()`, `_compute_learning_path()` |
| 4b | `backend/core/knowledge/extractor.py` | Modify `get_user_graph()` to include proficiency per node + `learning_path` in response |
| 4c | `web/app/knowledge-graph/page.tsx` | Render learning path sequence, color nodes by proficiency |

---

## Issue 5: Search — API Endpoint + Tests

### Problem
`search_lessons()` exists in `database/storage.py` with zero: API endpoint, test coverage, or frontend integration. Frontend CommandPalette fetches all lessons and filters client-side.

### Design
Add optional `?search=` param to `GET /lessons`. When present, delegate to `storage.search_lessons()`. Wire frontend CommandPalette to use server-side search.

### Changes

| Step | File | Description |
|------|------|-------------|
| 5a | `backend/server.py` | Add `?search=` to `GET /lessons` route |
| 5b | `tests/unit/test_search.py` (new) | Unit tests for `search_lessons()`: topic, partial, case, lang filter, empty, no results, SQL injection, Unicode/CJK |
| 5c | `tests/integration/test_search_api.py` (new) | API-level integration tests |
| 5d | `web/app/components/CommandPalette.tsx` | Replace client-side filter with server-side search call |

---

## Execution Order

| Phase | Issues | Rationale |
|-------|--------|-----------|
| Phase 1 | #1 Board resume + #2 Library migration | User-facing bugs, most impactful |
| Phase 2 | #5 Search + #4 Knowledge map | Missing features with existing plumbing |
| Phase 3 | #3 Load testing | Infrastructure, runs independently |
