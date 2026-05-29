# MentorMind Codebase Reorganization Report

**Date:** 2026-04-09  
**Branch:** master

---

## Executive Summary

A full structural reorganization of the MentorMind monorepo was completed successfully. All 315 tests continue to be collected without errors. No imports were broken. The codebase now has clear separation of concerns across backend, frontend, celery-worker, tests, and documentation layers.

---

## What Was Done

### 1. Backend — Removed Clutter from Root

| File | Action | Destination |
|------|--------|-------------|
| `backend/diagnostic_confidence_v2.py` | Moved | `backend/core/diagnostic_confidence.py` |
| `backend/test_video_generation.py` | Moved | `tests/integration/test_video_generation.py` |
| `backend/FINAL_IMPLEMENTATION_REPORT.md` | Moved | `docs/FINAL_IMPLEMENTATION_REPORT.md` |
| `backend/video_generation_problems_analysis.md` | Moved | `docs/video_generation_problems_analysis.md` |
| `backend/phase1_test_report_20260407_123055.json` | **Deleted** | Generated artifact |
| `backend/video_generation_test_report_0a83e481.json` | **Deleted** | Generated artifact |
| `backend/video_generation_test_report_f4aeaa81.json` | **Deleted** | Generated artifact |

`backend/server.py` import updated:
```python
# Before
from diagnostic_confidence_v2 import calculate_rigorous_confidence
# After
from core.diagnostic_confidence import calculate_rigorous_confidence
```

### 2. Frontend — Removed Logs, Backups, Dev Pages

| File | Action | Reason |
|------|--------|--------|
| `web/backend.log` | **Deleted** | Log file committed to repo |
| `web/web.log` | **Deleted** | Log file committed to repo |
| `web/app/create/page.tsx.backup` | **Deleted** | Stale backup (932-line file) |
| `web/tsconfig.tsbuildinfo` | **Deleted** | TypeScript build artifact |
| `web/app/test/page.tsx` | **Deleted** | Dev throwaway ("If you can see this, Next.js is working!") |
| `backend.log` (root) | **Deleted** | Log file at repo root |

### 3. Documentation — Consolidated Under `docs/`

| File | Action | Destination |
|------|--------|-------------|
| `issue.md` (root) | Moved | `docs/issues/issue.md` |
| `issue_zh.md` (root) | Moved | `docs/issues/issue_zh.md` |
| `next_phase_plan_zh.md` (root) | Moved | `docs/planning/next_phase_plan_zh.md` |

### 4. Tests — Organized into Unit / Integration / Scripts

**Before:** All tests at flat level in `tests/`

**After:**
```
tests/
├── conftest.py              ← shared fixtures, sys.path setup (unchanged)
├── unit/
│   ├── __init__.py
│   ├── test_api_client.py
│   ├── test_manim_renderer.py
│   └── test_pipeline_unit.py
├── integration/
│   ├── __init__.py
│   ├── test_script_generator.py
│   ├── test_video_generation.py  (moved from backend/)
│   └── test_video_quality.py
└── scripts/
    ├── __init__.py
    └── repro_manim_correction.py  (reproduction script, not a test)
```

`pytest.ini` `collect_ignore` updated from `tests/repro_manim_correction.py` → `tests/scripts/repro_manim_correction.py`.

---

## Final Directory Structure

```
mentormind/
├── backend/
│   ├── config/                    ← app configuration
│   ├── core/
│   │   ├── diagnostic_confidence.py  ← ✅ moved here
│   │   ├── asr.py, summarize.py
│   │   ├── cache/
│   │   ├── modules/               ← AI pipeline modules
│   │   ├── rendering/             ← Manim rendering
│   │   └── templates/
│   ├── database/                  ← SQLAlchemy models & storage
│   ├── prompts/                   ← Prompt templates (md + loader)
│   ├── services/                  ← External API integrations
│   ├── server.py                  ← FastAPI main app
│   ├── celery_app.py              ← Celery task definitions
│   ├── auth.py                    ← JWT authentication
│   ├── monitoring.py              ← Performance tracking
│   ├── migrate_db.py              ← Database migrations
│   ├── funasr_server.py           ← FunASR speech recognition service
│   ├── paddleocr_server.py        ← PaddleOCR service
│   ├── Dockerfile
│   └── requirements.txt
├── web/                           ← Next.js 14 frontend
│   ├── app/
│   │   ├── api/backend/           ← Next.js API proxy routes
│   │   ├── auth/                  ← Login/register pages
│   │   ├── components/            ← Shared React components
│   │   ├── lib/                   ← Utilities (translations)
│   │   ├── dashboard/, lessons/, create/, analytics/
│   │   ├── admin/, settings/, principles/
│   │   └── layout.tsx, page.tsx, globals.css
│   ├── public/
│   ├── remotion/                  ← Remotion video templates
│   └── [Next.js config files]
├── tests/
│   ├── conftest.py
│   ├── unit/                      ← Fast, offline unit tests
│   ├── integration/               ← Tests requiring services or I/O
│   └── scripts/                   ← Reproduction/debug scripts
├── docs/
│   ├── architecture.md
│   ├── tasks.md
│   ├── COMPLETE_SYSTEM_INDEX.md
│   ├── deployment_plans.md
│   ├── assessment_framework.md
│   ├── video_generation_improvement_roadmap.md
│   ├── video_generation_problems_analysis.md  ← moved from backend/
│   ├── FINAL_IMPLEMENTATION_REPORT.md         ← moved from backend/
│   ├── issues/
│   │   ├── issue.md
│   │   └── issue_zh.md
│   └── planning/
│       └── next_phase_plan_zh.md
├── scripts/
│   ├── local-setup.sh
│   ├── setup-postgres.sh
│   └── start.sh
├── docker-compose.yml             ← postgres, redis, backend, celery, frontend
├── pytest.ini
├── CLAUDE.md
├── README.md
└── .env / .env.example
```

---

## Docker / Service Architecture (Unchanged, Validated)

| Service | Description |
|---------|-------------|
| `postgres` | PostgreSQL 15, user/lesson/analytics storage |
| `redis` | Message broker for Celery |
| `backend` | FastAPI server on port 8000 |
| `celery-orchestration` | Celery worker consuming `heavy_ml` queue |
| `frontend` | Next.js app on port 3000 |
| `funasr` / `paddleocr` | Commented out (optional ML services) |

All `docker-compose.yml` volume paths (`./backend`, `./backend/data`) remain valid — no changes were made to the backend root directory path.

---

## Validation Results

| Check | Result |
|-------|--------|
| pytest collection | ✅ 315 tests collected, 0 errors |
| Stale `diagnostic_confidence_v2` imports | ✅ None found |
| `conftest.py` sys.path for subdirs | ✅ Valid — `BACKEND_DIR` relative to `tests/` still resolves correctly |
| docker-compose references | ✅ All `./backend` paths unchanged |
| `pytest.ini` collect_ignore | ✅ Updated to new path |
| Root-level clutter | ✅ Clean — only CLAUDE.md, README.md, pytest.ini, .env remain |

---

## Remaining Observations (Not Changed)

- **`web/app/dev-form/page.tsx`** and **`web/app/simple/page.tsx`**: Dev-only pages left in place — they may still be useful during development. Remove when no longer needed.
- **`venv/` at repo root**: Python virtualenv present on disk. It is listed in `.gitignore` (line 141). Safe to delete locally if `backend/.venv` is the primary env.
- **`web/remotion/`**: Remotion video template setup (`remotion.config.ts`, `remotion/Root.tsx`) — legitimate but currently minimal. Should be expanded or removed depending on roadmap.
- **`backend/__pycache__/ai_content_evaluator.*.pyc`**: Compiled cache for a source file that no longer exists. Will be cleaned automatically by Python on next import cycle.

---

## Summary

**Deleted:** 9 files (3 generated JSON reports, 2 log files, 1 backup, 1 build artifact, 1 dev test page, 1 root log)  
**Moved:** 13 files to correct locations  
**Updated:** 2 files (`server.py` import, `pytest.ini` collect_ignore)  
**Created:** 5 directories (`tests/unit/`, `tests/integration/`, `tests/scripts/`, `docs/issues/`, `docs/planning/`)
