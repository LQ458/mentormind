# AI Testing and Feedback Architecture

MentorMind needs feedback capture that is lighter than a survey and more useful than a screenshot in chat. The target workflow is:

1. A tester marks the exact moment that felt wrong.
2. The app stores route, device, recent actions, errors, latency, prompt/response metadata, and a short human note.
3. A script exports an agent-ready issue packet.
4. A coding agent can reproduce, patch, run checks, and summarize the fix.

This is designed for a solo developer: minimal manual triage, no heavyweight QA process, and no product-manager translation layer.

## Current Foundation

Already present:

- Frontend telemetry in `web/app/lib/telemetry.ts`.
- Backend telemetry endpoint at `POST /telemetry/event`.
- Error, latency, page view, WebSocket close, and interaction events.
- Exit survey and admin feedback pages.
- Unit/integration/load tests under `backend/tests`, `tests/unit`, `tests/integration`, and `tests/load`.

Current gap:

- Moment-level feedback is implemented on `/ask`, and global quick feedback is implemented from the topbar. The remaining product gap is coverage: the same moment-report component still needs to be placed on study-plan chat turns, seminar turns, upload error banners, and board lesson cards.
- Telemetry, feedback, and survey rows are correlated by `session_id`, but there is no generated issue-packet export command yet.
- E2E testing is not organized around product journeys like quick question, study plan, upload, seminar, and board lesson.

## Interaction Feedback Primitive

Add an inline "mark this moment" affordance to answer cards, plan chat turns, seminar turns, upload failures, and board lesson events.

Current implemented path:

- `FeedbackMoment` renders a compact "mark this moment" button on `/ask` answer cards.
- `FeedbackHub` renders a global quick-feedback modal from the topbar message icon.
- The global modal accepts bug reports, function feedback, feeling feedback, and general feedback.
- Clicking it sends a `feedback_moment` telemetry event.
- The event is stored in the `telemetry_events` table through `POST /telemetry/event`.
- The browser automatically attaches a bounded context snapshot: route, URL, viewport, browser language/user agent, recent telemetry breadcrumbs, recent console/network/WebSocket errors, and a surface-specific app snapshot.
- Failed `fetch` requests are automatically captured as `error_network` events, excluding the telemetry endpoint itself.

Capture this payload:

```json
{
  "schema": "mentormind.feedback_moment.v1",
  "session_id": "browser-session",
  "route": "/ask",
  "surface": "quick_question",
  "interaction_id": "client-generated-id",
  "severity": "confusing | blocked | wrong | slow | visual",
  "user_note": "Mina gave an outline but did not let me answer.",
  "expected_behavior": "Mina should ask me to respond and then verify my reasoning.",
  "recent_events": [
    {"event_type": "page_view", "at": "2026-06-05T00:20:00+08:00"},
    {"event_type": "interaction", "payload": {"area": "ask_discussion_reply"}}
  ],
  "app_snapshot": {
    "language": "zh",
    "viewport": {"w": 2048, "h": 1264},
    "answer_mode": "discussion",
    "upload_types": ["audio"],
    "latency_ms": 4200
  },
  "safe_content_refs": {
    "prompt_hash": "sha256...",
    "response_hash": "sha256...",
    "redacted_excerpt": "optional short excerpt"
  }
}
```

Global feedback uses the same storage path with:

```json
{
  "schema": "mentormind.feedback_hub.v1",
  "source": "global_feedback_button",
  "feedback_kind": "bug | function | feeling | general",
  "surface": "global",
  "severity": "blocked | wrong | confusing | slow | visual | idea",
  "user_note": "This felt too much like reading a presentation.",
  "expected_behavior": "Mina should ask me first, then probe my answer.",
  "context": {
    "route": "/ask",
    "viewport": {"width": 390, "height": 844},
    "recent_errors": [],
    "recent_events": []
  }
}
```

Do not automatically store full student content in telemetry. Store full text only when the tester explicitly submits it as part of feedback.

## Agent Issue Packet

Each marked moment should export as Markdown plus JSON:

```text
docs/issues/feedback-YYYYMMDD-HHMM-<shortid>/
  packet.md
  packet.json
  screenshot.png
  console.json
  network.json
  replay.spec.ts
```

`packet.md` should be optimized for coding agents:

- Problem statement: one sentence.
- Route and device.
- Steps to reproduce.
- Expected behavior.
- Actual behavior.
- Relevant payloads and logs.
- Suspected files.
- Checks to run.

## One-Command Triage

Future command shape:

```bash
pnpm feedback:packet --session <session_id> --since 2h
pnpm feedback:replay docs/issues/feedback-.../packet.json
```

The first command should query admin feedback plus telemetry and write an issue packet. The second command should launch Playwright against local or staging and replay the captured journey.

## Test Matrix

Keep five always-on journeys:

- Quick question, problem mode: upload image/PDF, answer renders math, next step creates a practice question, learner can submit an answer for verification.
- Quick question, discussion mode: upload audio/text, Mina summarizes, learner replies, Mina probes/counters/drafts instead of only presenting.
- Study plan: low-motivation learner can skip long survey, generate plan, retry failure shows actionable error.
- Seminar: room create, WebSocket connect, audio turn timeout/error is visible, transcript appears, AI facilitator responds.
- Board lesson: lesson opens, WebSocket reconnects, ask-AI interaction works on desktop and mobile.

Viewport set:

- iPhone: 390 x 844.
- iPad: 768 x 1024.
- Mac laptop: 1440 x 900.
- Wide desktop: 1920 x 1080.

## Human Effort Required

Prompt and pedagogy work:

- Define 8 to 12 high-quality Mina interaction contracts for discussion, math, reading, exam prep, and seminar.
- Create gold examples for strong/weak Mina behavior.
- Decide what "fun engagement" means for slow or unmotivated learners by subject and age group.

Curriculum work:

- Build subject-specific rubrics for AP, IB, A Level, Gaokao, and general courses.
- Provide example prompts, misconception libraries, and grading standards.

Engineering work that agents can handle:

- Extend `FeedbackMoment` to study-plan chat, seminar turns, upload error banners, and board lesson cards.
- Build packet export script.
- Add Playwright specs for the five journeys.
- Add screenshot diff checks for the four viewports.
- Add CI or local `pnpm test:journeys` command.

## Recommended Next Build Order

1. Add `FeedbackMoment` on upload error banners, study-plan chat turns, seminar turns, and board lesson cards.
2. Export feedback packets from telemetry plus survey rows.
3. Add Playwright quick-question problem/discussion specs.
4. Add Playwright feedback-hub specs for bug/function/feeling/general categories.
5. Let coding agents consume packet folders as their standard bug-fix input.
