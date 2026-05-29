# MentorMind — Task Tracker

_Last updated: 2026-04-09_

---

## Session Summary (2026-04-04 → 2026-04-09)

Seven sessions fixing backend stability, video generation performance, and deployment infrastructure.

---

## ✅ Completed

### Backend Bug Fixes
- **ContentCache TypeError** — `cache.get()` received duplicate `topic` kwarg because `variables` dict already contained it. Fixed by filtering `['topic', 'style']` before passing `**cache_vars`.
- **Diagnostic endpoint 500** — `calculate_rigorous_confidence()` returned a bare `float`; endpoint expected an object with `.bayesian_confidence`, `.confidence_interval`, etc. Fixed by adding `ConfidenceResult` dataclass.
- **JSON parsing errors in video generation** — Enhanced `_attempt_json_repair()` with regex for unquoted property names.
- **`ai_content_evaluator` import errors** — Module didn't exist. Replaced with mock responses in `celery_app.py` and `server.py`.
- **Infinite retry loop** — Videos under 6 min triggered endless retries. Fixed by reducing `preferred_duration_seconds` from 360 → 180.
- **API timeout too long** — Reduced from 600 s → 120 s in `services/api_client.py`.

### Database / Auth
- **UUID ↔ VARCHAR migration conflicts** — Reviewed existing migration direction before applying fixes.
- **Auth mismatch after schema change** — Secondary effect caught and corrected.

### Video Generation
- **Smart caching** — Added memory + disk cache layers (`core/cache/content_cache.py`).
- **Multi-provider fallback** — DeepSeek → SiliconFlow chain with circuit breaker.
- **High-quality templates** — `core/templates/video_templates.py` used when providers fail, replacing low-quality basic fallbacks.

### Infrastructure
- **`/health` endpoint** — Added to `server.py` for Docker healthcheck + load balancers.
- **Docker healthcheck** — Backend service now has healthcheck; frontend waits on `service_healthy`.
- **`.dockerignore` files** — Created `backend/.dockerignore` and `web/.dockerignore` to prevent `.env` / `node_modules` / `__pycache__` leaking into images.
- **`scripts/local-setup.sh`** — Validates prerequisites, checks env vars, builds images, starts services in correct order with health gates. Supports `--check`, `--down`, `--logs`.
- **Response integrity** — `ensure_complete_response()` utility added; `/job-status` endpoint now returns `_metadata` and `_response_integrity` fields.

### Config / Tooling
- **CLAUDE.md** — Added: Project Overview, Debugging, Database, Development Workflow, Testing sections (from `/insights` recommendations).
- **Auto-commit hook** — `Stop` hook in `.claude/settings.json` commits modified source files (excludes `.next/`, `.pack.gz`, cache) at end of each Claude session.
- **Plugins installed** — `superpowers`, `ralph-loop`, `planning-with-files`, `oh-my-claudecode`.

---

## 🔴 Open Issues (Blocking / High Priority)

### 1. Storyboard provider timeouts
**File:** `backend/core/modules/robust_video_generation.py`
**Symptom:** `All providers failed for storyboard, using fallback` — basic fallback produces low-quality placeholder content instead of a real storyboard.
**Root cause:** DeepSeek and SiliconFlow both time out or fail during the storyboard stage. Fallback storyboard has generic placeholder narrations.
**Fix needed:** Investigate why storyboard fails more than other stages. Possibly needs a higher `max_tokens` limit or a dedicated storyboard-optimised prompt.

### 2. Scene count mismatch between storyboard and render_plan
**File:** `backend/core/modules/content_validator.py`, `robust_video_generation.py`
**Symptom:** `Align scene counts between storyboard and render plan` warning in content validation.
**Fix needed:** Add reconciliation step that aligns scene IDs between storyboard and render_plan before passing to Manim renderer.

### 3. Admin metrics SQLAlchemy error
**File:** `backend/server.py` line ~2407
**Symptom:** `TypeError: Function.__init__() got an unexpected keyword argument 'else_'`
**Root cause:** SQLAlchemy 2.x changed `func.case()` syntax — old positional list form `[(condition, value)]` no longer accepted.
**Fix needed:**
```python
# Old (broken):
func.case([(UserLesson.is_completed == True, 1)], else_=0)
# New:
case((UserLesson.is_completed == True, 1), else_=0)
```

### 4. LaTeX `standalone.cls` missing in local dev
**File:** `backend/core/rendering/manim_renderer.py`
**Symptom:** `LaTeX 'standalone.cls' not found. Falling back to Text renderer.`
**Impact:** Math equations render as plain text instead of LaTeX-typeset formulas.
**Fix needed:** Install `texlive-latex-extra` locally, or document in CLAUDE.md that LaTeX rendering only works in Docker.

### 5. Embedded git repo in plugins
**Symptom:** `warning: adding embedded git repository: .claude/plugins/planning-with-files`
**Fix needed:** Add `.claude/plugins/` to `.gitignore`.

---

## 🟡 Open Issues (Non-blocking / Quality)

### 6. `web/.next/` build artifacts tracked in git
Several `.next/` files appear in `git status`. They should be gitignored but are currently tracked.
**Fix needed:** Add `web/.next/` to `.gitignore` and run `git rm -r --cached web/.next/`.

### 7. Dual OpenCV dependency
**File:** `backend/requirements.txt`
Both `opencv-python` and `opencv-python-headless` are listed — these conflict in Docker (headless is correct for server environments).
**Fix needed:** Remove `opencv-python`, keep only `opencv-python-headless`.

### 8. OMC HUD not configured
**Symptom:** `[OMC] HUD not configured (HUD script missing)` on session start.
**Fix needed:** Run `/hud setup` in Claude Code, then restart.

### 9. Video generation still ~5–6 minutes
Caching helps on repeated topics but first-run generation is still slow. Storyboard stage is the bottleneck.
**Improvement:** Profile each stage; consider streaming partial results to frontend while generation is in progress.

### 10. Docker build not end-to-end validated
`scripts/local-setup.sh --check` passes, but a full `docker compose up` build has not been verified clean since the recent changes (`.dockerignore`, healthcheck, `web/next.config.js` standalone output).
**Fix needed:** Run a full Docker build and smoke test.

---

## 🔵 Future / Nice-to-have

| Item | Notes |
|------|-------|
| CI/CD pipeline | No GitHub Actions configured. Add lint + test workflow. |
| Unpin base Docker images | Pin `node:20.17.0-alpine` and `python:3.12.0-slim` for reproducible builds. |
| Stripe integration | Keys present as placeholders; billing endpoints not wired up. |
| FunASR / PaddleOCR in Docker | Services commented out in `docker-compose.yml`. |
| Milvus / Nebula graph DB | Config vars present but services not deployed. |
| Frontend error messaging | Network errors and failed video jobs should surface readable messages to the user (not silent failures). |
| Test coverage | Existing tests in `tests/` but not run in CI. Validate with `pytest` as part of pre-commit or CI. |
