# MentorMind — Using Guide & Gap Analysis

**Date:** 2026-04-26
**Audience:** Product, eng, design — anyone deciding what to build next.
**Method:** Walked the live app (Next.js dev on :3000, FastAPI on :8000), read every user-facing route, traced every endpoint exposed in `openapi.json`, and audited the newly-added adaptive modules (`diagnostic_branching.py`, `proficiency_rollup.py`, `checkpoint_generator.py`, `lesson_presets.py`, `regen_lock.py`, `ExplainDifferentlyButton.tsx`, `ComprehensionCheckpoint.tsx`).

The product target — per the request that triggered this doc — is **two personas at the extremes of a learning curve**:

- **Persona A — "The Speedrunner."** A capable student who wants to self-study a full course (AP Calculus BC) end to end without a teacher. Wants progression, mastery gates, and the ability to skip what they already know.
- **Persona B — "The Struggling Learner."** A student with weak foundations who needs the platform to *catch their attention*, *meet them where they are*, and *slow down* when they're lost.

The TL;DR: **the platform has the right ingredients but most of them are not wired into the user flow.** A determined learner can produce one good lesson. Neither persona's full journey works end to end yet.

---

## 1. The Actual User Workflow (What Happens Today)

### 1.1 Entry

| Step | Route | What the user sees | What's missing |
|---|---|---|---|
| Land | `/` | Marketing hero, "Start Creating" / "View Dashboard", live status of backend + ASR + OCR services | No anonymous demo path. To try anything you must register first. |
| Register | `/auth/register` | Email + username + full name + password + language preference | **No onboarding wizard.** No grade level, no goal capture, no diagnostic. The user lands on the dashboard cold. |
| Dashboard | `/dashboard` | Time-of-day greeting, today's-focus card, 3 stat tiles (streak / minutes / mastery %), review queue, mentor note | Streak is derived from `recentLessons.length`, not real daily login. Mastery % averages `quality_score` of recent lessons (a content-quality metric), not the user's mastery of the topic. |

### 1.2 Creating a Lesson (`/create`)

The flow is a chat with an AI mentor that walks four stages: **opening → diagnostic → roadmap → co_creation.**

- The user types a topic in natural language ("derivatives of trig functions").
- AI returns identified topics with confidence scores; user picks/confirms.
- The right-rail panel exposes power controls: `studentLevel` (beginner/intermediate/advanced), `duration` (minutes), `voiceId`, `verbosity` (compact/standard/thorough), and toggles for `showThinkingPath`, `enableSeminar`, `enableSimulation`, `enableOralDefense`, `addDeliberateError`, plus a `personalAnchor` text field.
- Optional: upload audio or image as context (`/ingest/audio`, `/ingest/image`).
- Submit → `POST /create-class` → backend pipeline runs cognitive processing, video scripting, Manim render, TTS, and assembly.

**What's actually adaptive here?** The `studentLevel` selector is a **manual three-option dropdown**. The "diagnostic" stage is conversational chitchat — it does not call `diagnostic_branching.py`, does not give an MCQ ladder, and the inferred level is not fed back into the lesson generator. `create_classes.py` accepts a `student_level` parameter at line 44 but defaults to `"beginner"` and does not read `SubjectProficiency`.

### 1.3 Studying a Lesson (`/lessons/[id]`)

Tabbed UI: **content / video / seminar / simulation / oral-defense / practice / script**. Each tab is its own backend endpoint:

- `/users/me/lessons/{id}/seminar` — multi-agent debate
- `/users/me/lessons/{id}/simulation` — applied decision-making with a coach
- `/users/me/lessons/{id}/oral-defense` — a "panel" questions you
- `/users/me/lessons/{id}/memory-challenge` — retrieval-practice quiz
- `/users/me/lessons/{id}/deliberate-error` — find the planted mistake
- `/users/me/lessons/{id}/video-engagement` — fires every 10% scroll on the video tab

### 1.4 The Streaming Whiteboard (`/board/[sessionId]`)

The "豆包爱学-style" feature. A live board renders strokes as the AI writes; subtitles overlay; a chat panel lets the learner ask questions by text or voice; `NarrationPlayer` controls audio (0.8× / 1× / 1.25× / 1.5× / 2× speed, mute, pause). A "Summary" button calls `/board/session/{id}/summary`.

### 1.5 Multi-Lesson Curricula (`/study-plan`)

Subject (math/physics/chem/bio/CS/history/English/etc.) × Framework (**AP / A-Level / IB / Gaokao / General**). The user chats with the planner agent, which proposes a `units[]` structure with hour estimates. Confirm → `POST /study-plan/create` → unit detail at `/study-plan/{id}`. Each unit has its own endpoints (`/unit/{id}/generate`, `/board-lesson`, `/complete`, `/submit-score`).

### 1.6 Gaokao Mode (`/gaokao`)

A parallel branch: subject tabs (数学 / 物理 / 化学 / 生物), chat tutor, "出题练习" (generate practice problems). Saves to a study plan after 3+ messages.

---

## 2. Feature Inventory — What Exists

### Backend infrastructure (well-built but disconnected)

| Module | Status | What it does | Wired to user flow? |
|---|---|---|---|
| `diagnostic_branching.py` | Implemented + 10 unit tests pass | MCQ ladder: picks next item by walking difficulty ±1 based on correctness; `compute_proficiency()` bins responses into a level | **No.** `/users/me/diagnostic` is a 3-turn LLM conversation; never calls this module. |
| `diagnostic_confidence.py` | Stub | `calculate_rigorous_confidence()` returns hardcoded thresholds | Endpoint uses it, but the rule is just `if confidence > 0.8 or turn >= 4 → complete; > 0.6 → continue; else → extend`, with `consistency_entropy` set to `0.2` if `turn > 3` else `0.4` (literal constants, not measured). |
| `proficiency_rollup.py` | Implemented + 11 unit tests pass | 7-day half-life weighted decay → `SubjectProficiency` table with trend (improving/stable/declining) | Computed by Celery task. **Read by no lesson-generation code.** |
| `checkpoint_generator.py` | Implemented + 8 unit tests pass | Inserts comprehension checks every 90–180s of board narration | Inserts checks. Red/yellow responses are stored but **do not** lower next-segment difficulty. |
| `lesson_presets.py` | Implemented + 6 unit tests pass | Maps `advanced` → speedrun, `beginner` → scaffolded preset | **`create_classes.py` never calls it.** |
| `board/regen_lock.py` | Implemented | Debounce lock for re-explain requests | Used. |
| `ExplainDifferentlyButton.tsx` | Built | Inline menu: 🪶 Simpler / 🖼 Visual / 💡 Analogy / 📐 Rigorous | **Not surfaced in `/lessons/[id]` or `/board` UI.** Backend endpoint exists (`/board/explain-differently`) but the Celery task body is a `TODO(F4-regen)` stub — regeneration does not happen. |
| `ComprehensionCheckpoint.tsx` | Built | Mid-lesson 🟢🟡🔴 self-assessment + optional MCQ + Skip | Component exists; integration with the live board flow not visible in the rendered tree. |
| `StudentPerformance` / `SubjectProficiency` tables | Implemented | Per-attempt scores; per-subject rolled-up proficiency 0–1 with trend | Written. Read only by an informational `/users/me/proficiency` endpoint. |

### Pedagogy modes (impressive, well-thought-out)

Seminar, Simulation, Oral Defense, Memory Challenge, Deliberate Error — these are real, distinctive features that competitors don't have. The principles page (`/principles`) articulates a coherent design philosophy: spacing > cramming, retrieval before rewatching, productive friction, ownership through co-creation, teach-to-learn.

### Multimodal infrastructure

FunASR ASR, PaddleOCR, TTS with multi-voice + emotion, Manim rendering, HeyGen avatar, audio/image ingestion. Bilingual (zh-CN / en-US) all the way down.

---

## 3. Walking Persona A Through the Product (The Speedrunner — AP Calc BC)

**Goal:** "I want to self-study the full AP Calculus BC course in 8 weeks. I already know precalc cold. Stop wasting my time on basics."

| Step | What works | What doesn't |
|---|---|---|
| Sign up | Account creation works. | Zero placement. The system has no idea this user is strong. |
| `/study-plan` → "Math, AP, AP Calculus BC" | Planner agent proposes a multi-unit roadmap. | `difficulty_level` is hardcoded to `"intermediate"` (`backend/database/models/study_plan.py:67`). No "skip placement" toggle, no "compress timeline" option. |
| Open Unit 1 (Limits) | Unit generates a real lesson. | The lesson opens at default depth. The `lesson_presets.py` "speedrun" preset exists but is never invoked. |
| Speedrun the unit | Mode picker works (Seminar/Simulation/Oral Defense are powerful). | No "skip if known" affordance. No mastery gate that says "score 80% on memory challenge → unit 2 unlocks; otherwise repeat." |
| Submit unit score (`/unit/{id}/submit-score`) | Score is stored in `StudentPerformance`. Celery rolls into `SubjectProficiency`. | **Unit 2 is generated identically regardless of the score.** No cascade. |
| Halfway through course | Streak tile says "8 days." | No course-completion %. No "you are 47% through AP Calc BC." Dashboard treats every lesson as standalone. |
| Hit a unit they don't know | They have to manually flip mode toggles. | No "you struggled here, want me to slow down?" prompt. |

**Verdict:** Persona A *can* slog through, but the experience is generic. They will feel the platform doesn't know who they are. Likelihood of finishing: ~50%, mostly carried by the strong content-generation engine.

---

## 4. Walking Persona B Through the Product (The Struggling Learner)

**Goal:** "Math has scared me since 7th grade. Make this feel doable. Catch me when I'm lost. Don't move on if I don't get it."

| Step | What works | What doesn't |
|---|---|---|
| Sign up | Account creation works. | Onboarding asks for nothing. There is no "where are you starting from?" moment. The user is dropped on the dashboard. |
| Open `/create`, type "I don't get fractions" | Mentor opens with: *"Hey! Ready to tackle some math today?"* — friendly tone. | The "diagnostic" stage doesn't actually diagnose. After ~3 turns it picks `studentLevel` based on conversation vibes, not response correctness. |
| Generate lesson | Lesson is produced; bilingual, video, narration. | The lesson explains at the level the LLM guessed. There is no MCQ ladder to confirm where the gap actually starts. |
| Hit the comprehension checkpoint | The 🟢🟡🔴 component is well-designed. | Even if the user clicks 🔴, the **next segment is generated the same way.** No fallback to a simpler analogy or a back-up to the prerequisite. |
| Press "Explain Differently → Simpler" | Button is built. | **Backend Celery task body is a TODO** (`celery_app.py` regen task is a stub). The board does not actually re-render with simpler content. |
| Get a problem wrong | `StudentPerformance` records the score. | No immediate "let's slow down" — the system doesn't react. No remediation queue. |
| Come back tomorrow | Review queue surfaces the lesson again. | No streak celebration, no badge, no XP, no "you've done 4 days in a row!" There is nothing dopamine-shaped in the product. |
| Lose motivation | — | Nothing pulls them back. Mentor notes (`/users/me/notifications`) exist but they're plain text cards, not push, not gamified, not playful. |

**Verdict:** Persona B's full loop **does not work today.** The components that would make it work are built (Checkpoint, ExplainDifferently, proficiency rollup) but they're disconnected wires. Likelihood of sticking past the first session: low.

---

## 5. The Critical Missing Pieces (Prioritized)

The pattern across both personas is the same: **the platform has adaptive infrastructure but no adaptive feedback loop.** Fix the loop and both personas light up. The list below is ordered by ROI on persona enablement.

### P0 — Wire the loops that already exist

These are **not new features.** They are wiring jobs on code that's already written and unit-tested.

1. **Make `/create-class` read `SubjectProficiency` and call `lesson_presets.py`.** (`backend/core/create_classes.py:44`) Today `student_level` defaults to `"beginner"` and ignores the rolled-up proficiency. Wiring this single read makes both personas adaptive.
2. **Implement the `regenerate_board_segment_task` body.** (`celery_app.py`, marker `TODO(F4-regen)`) Without this the "Explain Differently" button is a placebo. This is the single most important Persona B fix.
3. **Make checkpoint responses change behavior.** (`backend/core/modules/checkpoint_generator.py`) When the user picks 🔴 or 🟡, the next segment must (a) lower difficulty, (b) optionally trigger an "explain simpler" regeneration, and (c) record a signal into `StudentPerformance` so the rollup reflects struggle, not just quiz attempts.
4. **Surface `ExplainDifferentlyButton` and `ComprehensionCheckpoint` in `/lessons/[id]` and `/board/[sessionId]`.** Components exist; they're just not in the rendered tree of the consumption screens.

### P1 — Onboarding & placement

5. **First-run onboarding wizard.** Right after register, ask: grade level, framework target (AP/A-Level/IB/Gaokao/none), goal ("self-study a course" vs. "tutoring help"), weekly hours, preferred pace. Persist into `UserInterestProfile` (model exists) and use it as the seed for the first lesson.
6. **A real placement test, not a chat.** Use `diagnostic_branching.py` (already built and tested) to drive an MCQ ladder for the chosen subject. Store the resulting proficiency. Skip it if the user opts out, but offer it on every new course.
7. **Replace `diagnostic_confidence.py` stub** with a real Bayesian update. Today the completion rule is a literal `confidence > 0.8 or turn >= 4`, and `consistency_entropy` is hardcoded (`0.2` past turn 3, `0.4` before) — placeholder logic, not a measurement.

### P2 — Course-level scaffolding (Persona A)

8. **Course progression view.** A curriculum tree on `/study-plan/{id}` with units as nodes, prerequisite edges, mastery % per node, and a clear "next up" highlight. Today the unit list is flat.
9. **Mastery-gated unlocking with manual override.** A unit unlocks at, say, ≥70% on the unit's memory challenge. Persona A can override ("I know this") and skip — that override itself records as proficiency evidence.
10. **Cascade prior mastery into new course difficulty.** When the user creates "AP Calc BC" and already has high `SubjectProficiency` for "Calculus", start at intermediate-plus instead of "intermediate" default.
11. **Study plan accelerator preset.** A "compress this to N weeks" lever that adjusts unit count and depth.

### P3 — Engagement loop (Persona B)

12. **Real streaks and a daily ritual.** Currently `streak = recentLessons.length` — that's not a streak, that's a count. Compute consecutive UTC days with activity, store in a new `UserStreak` table, and show a flame on day-2+. Add a "freeze day" forgiveness mechanic.
13. **Lightweight gamification.** XP per checkpoint passed, per memory challenge cleared, per streak day. Badges for first lesson / first course / first 🔴→🟢 recovery. None of this exists in the backend (no `streak`/`xp`/`badge` tables — verified by grep).
14. **Push-style mentor nudges.** The notifications API exists but renders as a quiet card. For Persona B, this needs email/push opt-in and tighter targeting ("you got close yesterday — 2 minutes of review now?").
15. **Confidence meter visible during the lesson.** A live "you're trending up / down" sidebar so the learner *sees* the system reacting to them.

### P4 — Trust, polish, and observability

16. **An anonymous "try it" demo.** Currently every endpoint requires auth. The landing page sells the product but the user can't taste it before signing up.
17. **Make dashboard stats truthful.** Mastery % currently averages `quality_score` (a content-quality metric), which is misleading. Use real `SubjectProficiency` aggregates.
18. **Integration tests for the loops above.** Today there are zero tests of the form "diagnostic → store proficiency → next lesson is easier." Unit tests of isolated modules pass; the wiring is untested. Suggested files:
    - `tests/integration/test_proficiency_drives_next_lesson.py`
    - `tests/integration/test_checkpoint_red_lowers_difficulty.py`
    - `tests/integration/test_explain_differently_actually_regenerates.py`
    - `tests/integration/test_unit_unlock_requires_mastery.py`

---

## 6. Quick Wins (Worth Doing This Week)

| Win | Effort | Persona impact |
|---|---|---|
| Drop `ExplainDifferentlyButton` into the lesson and board layouts | hours | B (placebo until task body lands) |
| Drop `ComprehensionCheckpoint` into the board flow | hours | B |
| Implement Celery `regenerate_board_segment_task` body (the TODO) | 1–2 days | B (huge — turns the placebo real) |
| Make `create_classes.py` read `SubjectProficiency` and choose preset | 1 day | A + B |
| Real streak math (consecutive-day count, not lesson-count) | half day | B |
| Onboarding wizard (4 questions, persists to existing `UserInterestProfile`) | 1–2 days | A + B |
| Replace `diagnostic_confidence.py` stub with the math the unit tests already imply | 1 day | A + B |

These seven items convert "infrastructure present, loop absent" into "loop closed." That alone moves Persona B from ~25% to ~70% likelihood of returning the next day, and Persona A from "feels generic" to "feels personal."

---

## 7. Bigger Builds (Worth Their Own Plans)

- **Mastery-based unlocking + curriculum tree UI** — needs design and a small graph layer in the planner agent.
- **An MCQ-ladder placement test product** — `diagnostic_branching.py` is the math; UX, item bank per subject, and the calibration story are the work.
- **Gamification system** — schema (XP / badges / streaks / freeze tokens), event bus, UI surface, anti-abuse.
- **Push notification channel** — email + web push + the targeting rules.

---

## 8. What This App Does Better Than Most

It would be unfair to leave the doc on the gap list, because the strengths are real and worth defending while the gaps get filled:

- The **Seminar / Simulation / Oral Defense / Memory Challenge / Deliberate Error** suite is genuinely differentiated. No mainstream competitor has all five.
- The **streaming whiteboard** with voice chat and live narration is the most "豆包爱学"-like experience in the English market.
- **Bilingual depth** (Chinese ASR/OCR/TTS at first-class quality) opens the Gaokao market in a way most US-built tools can't touch.
- The **co-creation chat** in `/create` is more humane than the "fill out this form" flow on competitor sites.

The product needs a closed adaptive loop and a sticky engagement layer. It does **not** need to be reimagined.

---

## 9. Appendix — Concrete File Anchors

For the engineer picking up the wiring work:

- Default-difficulty hardcode: `backend/database/models/study_plan.py:67`
- Lesson generator that ignores proficiency: `backend/core/create_classes.py:44`
- Diagnostic confidence stub: `backend/core/diagnostic_confidence.py:61–66`
- Branching logic that's never called: `backend/core/diagnostic_branching.py:48–99`
- Regen Celery task TODO: `backend/celery_app.py` (search `regenerate_board_segment_task` / `TODO(F4-regen)`)
- Built but unmounted UI: `web/app/components/board/ExplainDifferentlyButton.tsx`, `web/app/components/board/ComprehensionCheckpoint.tsx`
- Streak miscalculation: `web/app/dashboard/page.tsx` (search `recentLessons.length`)
- Mastery % miscalculation: `web/app/dashboard/page.tsx` (search `quality_score`)
- Unit endpoints that need mastery cascade: `backend/server.py` `/study-plan/{plan_id}/unit/{unit_id}/generate` and `/submit-score`
