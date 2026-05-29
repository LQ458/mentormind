# /create is hidden, not removed

**Date frozen:** 2026-05-03

The lesson-creation flow at `/create` (and its supporting components in `web/app/components/create/`, plus the backend pipeline rooted at `backend/core/create_classes.py` + `core/modules/robust_video_generation.py` + Celery `create_class_video_task`) has been **unlinked from the frontend** but **left intact in source**.

## Why
A redesign of the video-generation flow is pending and requires further investigation before we wire it back up. We don't want users hitting the current flow during that interim, but we don't want to lose the working code either.

## What was done
The following user-facing entry points were swapped from `/create` to `/study-plan` (or removed):

- `web/app/components/design/Sidebar.tsx` — sidebar nav entry removed
- `web/app/components/design/Topbar.tsx` — page-meta map entry removed
- `web/app/components/CommandPalette.tsx` — quick-nav entry removed
- `web/app/page.tsx` — hero & quick-link CTAs point to `/study-plan`
- `web/app/dashboard/page.tsx` — fallback CTAs point to `/study-plan`
- `web/app/lessons/page.tsx` — empty-state CTA points to `/study-plan`
- `web/app/principles/page.tsx` — landing & footer CTAs point to `/study-plan`
- `web/app/knowledge-graph/page.tsx` — empty-state CTA points to `/study-plan`

The `/create` route itself (`web/app/create/page.tsx` and child components) is reachable only by typing the URL directly. It has not been deleted.

## Backend
Backend code is untouched:
- `backend/server.py` lesson-creation endpoints
- `backend/core/create_classes.py`
- `backend/core/modules/robust_video_generation.py`
- Celery tasks in `backend/celery_app.py` (`create_class_video_task`, etc.)

These continue to function so the page works if reached directly, and so the post-redesign re-wiring is a UI-only change.

## How to restore
Once the redesign is ready:

1. Re-add the sidebar entry in `web/app/components/design/Sidebar.tsx` NAV array.
2. Re-add the page-meta entry in `web/app/components/design/Topbar.tsx` PAGE_META.
3. Re-add the CommandPalette entry in `web/app/components/CommandPalette.tsx` NAV array (and re-import `Plus` from `lucide-react`).
4. Swap any of the CTAs back to `/create` in the pages listed above as makes sense for the new design.

A repo-wide `grep "/study-plan"` will surface every CTA that was redirected, so the swap-back is mechanical.
