# MentorMind Web App

Next.js 14 App Router frontend for MentorMind.

## Current Product Surfaces

- `/`: minimal home and learning entry.
- `/ask`: quick question flow with image/PDF/audio/text context, math rendering, problem/discussion answer modes, learner next-step actions, and moment-level feedback.
- `/study-plan`: course framework/subject selection, learner profile, Mina planning chat, review, and save.
- `/study-plan/[id]`: plan detail, unit generation, board lesson entry, and unit AI ask sidebar.
- `/seminar`: multiplayer and AI-assisted seminar/debate rooms.
- `/board/[sessionId]`: interactive board lesson session.
- `/admin/feedback`: feedback/survey review dashboard.

## Quick Start

```bash
cd web
pnpm install
pnpm dev
```

The app defaults to `http://localhost:3000`.

## Project Structure

```text
web/
├── app/
│   ├── api/backend/           # Next.js proxy routes to FastAPI
│   ├── ask/                   # Quick-question flow
│   ├── study-plan/            # Study-plan creation/detail flows
│   ├── seminar/               # Seminar room UI
│   ├── board/                 # Board lesson UI
│   ├── components/            # App shell, feedback, auth, math, board, shared UI
│   ├── hooks/                 # Upload, WebSocket, shortcuts, fullscreen, local drafts
│   └── lib/                   # Telemetry, subjects, frameworks, translations
├── public/
└── package.json
```

## Backend Integration

Browser calls should go through `app/api/backend/*` unless a specific route needs a direct public backend URL. The proxy keeps local and production paths similar:

- Local frontend: `http://localhost:3000`
- Local backend: `http://localhost:8000`
- Production frontend/backend: same origin behind nginx, with `/api/backend/*` and `/ws/*` routed to FastAPI.

Useful environment variables:

```env
BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_API_BASE=
NEXT_PUBLIC_BACKEND_WS_URL=
NEXT_PUBLIC_AUDIO_INGEST_POLL_MINUTES=30
NEXT_PUBLIC_SHOW_TWEAKS=false
```

Leave `NEXT_PUBLIC_BACKEND_WS_URL` blank in same-origin production so WebSockets use nginx `/ws/`.

## Feedback and Error Collection

The frontend has three first-party feedback/report entry points:

- `ReportIssueButton`: visible fixed `Report / 报告问题` button on every page, plus local buttons on important flows such as board lessons and study-plan generation/review.
- `FeedbackHub`: the shared modal opened by the fixed button, topbar icon, and local report buttons. It captures bug, function, feeling, and general feedback.
- `FeedbackMoment`: compact inline marker for exact answer moments, currently on `/ask`.

All paths send `feedback_moment` telemetry events through `app/lib/telemetry.ts` to `POST /api/backend/telemetry/event`, including a bounded context snapshot: route, viewport, browser, user note, expected behavior, recent breadcrumbs, recent failed network calls, WebSocket errors, and surface-specific app state.

`ErrorBoundary` also records React render crashes as `error_console` telemetry and shows a local report button with the error context.

When adding a new major surface, add a local `ReportIssueButton` or `FeedbackMoment` to the exact user-visible card/turn/error banner instead of relying only on the global fixed button.

## Upload UX

Upload handling lives in `app/hooks/useIngestUpload.ts`.

- Images/PDFs route to `/api/backend/ingest/image`.
- Audio routes to `/api/backend/ingest/audio`.
- The hook maps backend failures into user-facing categories such as auth/session, file too large, unsupported file, worker unavailable, timeout, and backend error.

Production nginx must allow large request bodies and long audio timeouts; see the root README and `docs/deployment_plans.md`.

## Development Checks

```bash
cd web
pnpm exec tsc --noEmit
```

For UI changes, use Playwright/browser automation against `http://localhost:3000` and check desktop, iPad, and iPhone-sized viewports.

## Notes for Coding Agents

- Do not reintroduce simulated backend behavior in the main app routes; use the existing proxy routes.
- Keep math content rendered through the existing math renderer components.
- Feedback-related UI should send structured telemetry, not only console logs or toast messages.
- If you add a new route that can fail visibly for users, add a user-report entry point and include enough app state for later triage.
