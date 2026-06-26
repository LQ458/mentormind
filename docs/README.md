# MentorMind Docs Index

This folder contains both current product/deployment docs and historical research reports. When an AI or coding agent needs the current system map, read the "Current source of truth" section first.

## Current Source of Truth

- `../README.md`: high-level product, architecture, feedback loop, local/dev/deploy commands, and active roadmap.
- `architecture.md`: backend endpoints, frontend routes, data models, and current system architecture.
- `deployment_plans.md`: VPS/Docker/nginx deployment notes, including WebSocket and long upload/audio requirements.
- `vps_scaling_safety_growth_plan.md`: single-VPS safety, queue, rate-limit, and scaling notes.
- `ai-testing-feedback-architecture.md`: feedback/error collection architecture and future agent triage workflow.
- `qa/robustness-2026-06-05.md`: production robustness runs, success rates, fixtures, audio-upload bug evidence, and post-fix verification.
- `product-requests-2026-06-02.md`: organized product requests from the June 2 feedback/images/audio notes, with implementation status and remaining follow-ups.
- `USING_GUIDE_AND_GAPS.md`: product usage guide plus known gaps.
- `功能说明.md`: Chinese feature overview.

## Current Benchmarks

- `benchmarks/study_plan_learner_level_benchmark_2026-05-31.md`: original four-learner study-plan benchmark.
- `benchmarks/study_plan_learner_level_benchmark_after_supports_2026-05-31.md`: benchmark after lower-friction study-plan support.

## Historical / Reference Docs

These documents preserve earlier analysis and implementation thinking. They are useful context, but should not override the current architecture or roadmap above.

- `COMPLETE_SYSTEM_INDEX.md`
- `FINAL_IMPLEMENTATION_REPORT.md`
- `REORGANIZATION_REPORT.md`
- `tasks.md`
- `video_generation_problems_analysis.md`
- `video_generation_improvement_roadmap.md`
- `syllabus.md`
- `planning/*`
- `issues/*`
- `superpowers/*`

## Agent Handoff Rules

1. For deployment problems, start with `deployment_plans.md`, `vps_scaling_safety_growth_plan.md`, root `README.md`, then inspect `docker-compose.prod.yml` and `nginx/*.conf`.
2. For user-reported UI/AI quality problems, start with `ai-testing-feedback-architecture.md`, `product-requests-2026-06-02.md`, root `README.md`, then inspect the relevant `web/app/*` route.
3. For feedback/error data, query `telemetry_events` for `feedback_moment`, `error_console`, `error_network`, `ws_close`, `long_task`, and related `interaction` rows.
4. Treat old video-generation reports as historical unless the task is specifically about video generation.
5. When a doc and code disagree, inspect the code, update the doc, and note the remaining gap explicitly.
