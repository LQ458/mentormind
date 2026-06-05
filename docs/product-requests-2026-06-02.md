# MentorMind Product Requests - 2026-06-02

## Immediate Engineering Fixes

Status: implemented in the current product pass.

- Hide the floating `Tweaks` design control in production unless `NEXT_PUBLIC_SHOW_TWEAKS=true`.
- Install Tesseract OCR in the backend Docker image so image/PDF quick-question uploads do not fail with missing OCR tooling.
- Convert low-level upload failures into user-facing reasons instead of raw server messages.
- Make failed study-plan generation explain whether the issue was timeout or unusable AI output, then offer concrete recovery chips.
- Increase production nginx upload/body and timeout settings for long audio upload/transcription flows.
- Require a running `heavy_ml` Celery worker before accepting async audio transcription jobs, so local/dev failures show a clear worker-missing error instead of silent timeout.
- Add `/ask` discussion mode so broad reading/audio questions are not treated like math problems.
- Add a learner response loop for `/ask` discussion answers: Mina summarizes briefly, then the learner can respond, get a probe, request a counterpoint, or draft a short answer.
- Add quick global feedback and moment-level feedback collection that stores user notes together with page/device/recent-error telemetry.

## Product Direction

The strongest theme is not "make another ChatGPT tutor." MentorMind should feel like a guided learning product with a distinctive class experience:

- Better lesson experience: stronger examples, clearer diagrams, smoother transitions, and richer pacing than generic chat/video tutors.
- Strong teaching personality: not copying a real creator, but defining a consistent teacher style such as "data-heavy direct explainer", "patient conceptual coach", or "exam-drill mentor".
- Flexible learning path: lessons should feel like a progression map with small challenges, checkpoints, and unlockable next steps, closer to a study game than a static syllabus.
- Course expansion: after AP/high-school exams, expand into vocational education and university courses.

## Human Prompt/Curriculum Work Required

These are high-leverage, but they need human taste, examples, and iteration.

- Teacher-style prompt library: define 3-5 original teaching archetypes, each with tone rules, pacing rules, example density, visual style, and forbidden behaviors.
- Subject-specific exemplar bank: collect excellent explanations, diagrams, worked examples, and transition patterns per subject. The AI needs references to imitate quality, not random style.
- Differentiation rubric: write what MentorMind does better than ChatGPT, Jim, and video tutors in observable terms: examples per concept, learner adaptation, visual grounding, recovery when confused, and practice feedback.
- Persona safety line: avoid "copy this named teacher/person" prompts. Build original composites with explicit attributes instead.
- Vocational/university scaffolds: define course catalogs, common assessment types, and outcome templates before exposing these as product categories.

## Next Engineering Projects

These should be built after the prompt/curriculum spec is pinned down.

- Lesson style selector: let learners choose a teaching mode, then pass the selected style into board lesson generation, diagrams, examples, and practice.
- Progression-map study plan: convert a saved plan into nodes, mini-boss checks, review loops, and visible unlock states.
- Example/visual retrieval layer: attach curated examples and diagram patterns to units so the AI can ground explanations.
- Async study-plan generation: stop blocking the chat request while Mina generates the plan; show a job state and recover cleanly from slow model calls.
- Async seminar/audio turn: same idea for voice seminar. ASR plus AI moderation should be queued or streamed, not forced through one synchronous request.
- Feedback packet exporter: convert `feedback_moment`, `error_network`, `error_console`, `ws_close`, and related telemetry rows into an agent-readable issue folder.
- Extend moment feedback controls from `/ask` to study-plan chat turns, seminar turns, upload errors, and board lessons.
