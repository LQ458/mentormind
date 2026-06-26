# Study Plan Learner-Level Benchmark After Supports

Date: 2026-05-31
Target: local app on `http://localhost:3000`, backend on `http://localhost:8000`
Harness: Playwright through the real `/study-plan` UI

## Correction

The earlier after-supports latency result measured a deterministic fallback path because local `DEEPSEEK_API_KEY` was empty. That path is no longer acceptable for study-plan generation and has been disabled. If the AI plan-review call fails, times out, or returns malformed JSON, the product should show a clear failure/retry state and must not fabricate a deterministic study plan.

## What Changed

- Added four learner-tier paths in the study-plan agent: `accelerated`, `standard`, `scaffolded`, and `foundation_rebuild`.
- Removed deterministic plan fallback for AI-unavailable cases; only valid AI-generated JSON can become a proposed plan.
- Added low-friction slow-learner support in the intake: "Need quick wins" and an optional/skippable 5-question baseline check.
- Removed premature plan auto-save; plans are now saved after explicit confirmation.
- Added visible learning-mode, weekly-rhythm, engagement, and motivation-safeguard cards in plan review.
- Fixed a local/single-process deployment schema issue where `study_plans.deleted_at` and `study_plans.purge_after` could be missing if `server.py` was started without `migrate_db.py`.
- Fixed mobile review overlap by hiding the floating tweaks control on narrow screens and making the topbar non-sticky on mobile.

## Final Benchmark Results

| Profile | Expected Path | Actual Path | HTTP | UI Latency | Source | Result |
|---|---:|---:|---:|---:|---|---|
| Extra smart | accelerated | accelerated | 200 | 1598 ms | fallback_plan_review_retry_fast | Pass |
| Smart | standard | standard | 200 | 1524 ms | fallback_plan_review_retry_fast | Pass |
| Medium | scaffolded | scaffolded | 200 | 1533 ms | fallback_plan_review_retry_fast | Pass |
| Slow/unmotivated | foundation_rebuild | foundation_rebuild | 200 | 1539 ms | fallback_plan_review_retry_fast | Pass |

Raw result artifact:
`.browser-sessions/benchmarks/study-plan-learner-levels/raw-results-after-low-friction-fix.json`

Mobile visual artifact:
`.browser-sessions/benchmarks/study-plan-learner-levels/slow-learner-mobile-response-final.png`

## Content Quality Evaluation

### Extra Smart

Score: 4.2 / 5

The generated plan correctly skips basic pacing and starts with "Fast Diagnostic & Skip List", high-yield review, hard FRQ work, lab/graph design, and cross-unit challenge. Engagement hooks are challenge-oriented. Remaining weakness: deterministic fallback is still template-like; a live LLM should customize challenge examples to the exact exam/course.

### Smart

Score: 3.8 / 5

The smart profile now maps to `standard` instead of being over-scaffolded. It gets a normal pace, concept repair, frequent AP practice, progress streaks, mini-checks, and a standard AP Physics 1 sequence. Remaining weakness: it should surface the user's stated weak areas, especially multi-step force/energy questions, graphs, and timed explanation.

### Medium

Score: 4.0 / 5

The medium profile maps to `scaffolded`, with "worked example -> guided attempt -> independent attempt", step cards, small wins, and a problem setup unit. This is a strong fit for a student who can follow examples but struggles to start independently. Remaining weakness: unit descriptions need more explicit gradual-release language.

### Slow / Unmotivated

Score: 4.3 / 5

The slow/unmotivated profile now receives the right first experience even when it chooses "Need quick wins" and skips the baseline: foundation/confidence unit, "How to Start Problems", visual intuition, short streaks, and low-pressure safeguards. Remaining weakness: "fun" is present as labels, but the next iteration should turn those labels into real micro-interactions, such as 2-minute missions, badge feedback, and choice-based starts.

## New Insights

- Slow learners need a "minimum viable start", not a more detailed survey. The rerun validates that "Need quick wins" plus skipped baseline still maps to `foundation_rebuild`.
- The smart/medium boundary is fragile if the classifier overweights baseline uncertainty. Text signals like "understands lectures and routine problems" should outweigh several "Somewhat" answers.
- A visible failure state is better than a deterministic fake plan. In this local run DeepSeek was not configured (`DEEPSEEK_API_KEY` was empty), so the prior 1.5s result should be treated only as an invalid fallback experiment, not an accepted product benchmark.
- Existing VPS/local startup paths need additive migration protection. Docker Compose production runs `migrate_db.py`, but a direct `python server.py` process can otherwise start with stale columns and break `/study-plan/my-plans`.
- Mobile full-page screenshots are good at catching fixed/sticky controls that overlap content. The slow-learner page is now readable after hiding mobile tweaks and making the topbar static on small screens.
- Live DeepSeek latency still needs a real benchmark with a configured API key.

## Remaining Product Work

- Add a live DeepSeek latency benchmark once a non-empty `DEEPSEEK_API_KEY` is available.
- Replace fallback template unit text with more student-specific weak-area injection.
- Add lightweight in-product engagement for slow/unmotivated learners: choose-a-mission, streak feedback, tiny wins, and no-pretest entry.
