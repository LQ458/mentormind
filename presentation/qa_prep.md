# MentorMind Q&A Preparation

## Technical Questions

### Q1: "Why DeepSeek models instead of GPT-4 or Claude?"
**Answer (40s):**
DeepSeek offers the best cost-to-performance ratio for our use case — $0.001 per thousand tokens versus GPT-4's $0.03. At our scale with multi-turn manager-critic loops, that's a 30x cost difference. DeepSeek V3 is also particularly strong at Chinese language tasks and structured content generation, which is critical for our target market. We access it through SiliconFlow's API, which adds a layer of reliability and gives us access to GLM-5.1 as a fallback model.

**Key evidence:** $160/month budget target, multi-provider fallback in api_client.py

**Follow-up:** "What if SiliconFlow has downtime?"
→ We have a circuit breaker with direct DeepSeek API fallback built into our client architecture.

**If you don't know a detail:** "The specific benchmark comparison is in our architecture docs — I can share those after the presentation."

---

### Q2: "How do you handle FunASR transcription errors, especially with Chinese dialects?"
**Answer (35s):**
FunASR uses Alibaba's Paraformer model which is pre-trained on thousands of hours of Mandarin across multiple accents. For our target audience — students speaking standard Mandarin — accuracy is very high. For dialect-heavy speech, we have a fallback path through Whisper for broader language coverage. We also don't treat the transcript as final — it feeds into the LLM concept extractor which can correct minor transcription errors contextually.

**Key evidence:** FunASR port 10095, Whisper fallback, LLM-based concept extraction

**Follow-up:** "What about background noise?"
→ The ingestion module applies audio preprocessing before ASR. For very noisy environments we guide users to use image upload via PaddleOCR instead.

---

### Q3: "What's the quality threshold for the manager-critic loop, and how did you determine it?"
**Answer (35s):**
We set the threshold at 0.8 (80%) based on empirical testing. Below 0.8, the critic identifies significant issues — missing prerequisites, illogical sequencing, or vague objectives. At 0.8+, the plan is structurally sound enough to deliver, and the student's own learning interactions will further personalize it. We cap regeneration at 3 cycles to prevent infinite loops and control cost. The five evaluation dimensions — clarity, accuracy, pedagogical effectiveness, engagement, and difficulty appropriateness — map to established pedagogical quality frameworks.

**Key evidence:** agentic.py LessonPlanner + QualityCritic, max 2 regeneration cycles

**Follow-up:** "Could the critic be wrong?"
→ Yes, which is why we limit retries and always deliver the last plan. The critic is a probabilistic model, not a perfect evaluator. Student usage data will help us tune the threshold over time.

---

### Q4: "How does the adaptive difficulty system actually work?"
**Answer (30s):**
We track a sliding window of the student's last three quiz scores. If the average is above 85%, difficulty increases from beginner to intermediate, or intermediate to advanced. Below 60%, it decreases. Between 60-85%, difficulty stays the same. This prevents over-correcting from a single bad quiz — it takes sustained performance to trigger a change. The difficulty level affects the complexity of generated content: quiz questions, study guide depth, and which learning modes are recommended.

**Key evidence:** 3-score sliding window in submit-score endpoint, _adjust_difficulty()

**Follow-up:** "Is three scores enough?"
→ It's a trade-off between responsiveness and stability. Three scores is enough to smooth out noise while still adapting within a week of regular study.

---

### Q5: "How did you solve CJK font rendering in Manim animations?"
**Answer (30s):**
We partially solved it. We installed texlive-lang-chinese for LaTeX support and configured system fonts for Chinese characters. Simple math formulas with Chinese labels work reliably. However, complex animations with mixed CJK and mathematical notation were inconsistent — that was one of the drivers for our pivot to study plans. The Manim pipeline code is intact, and fixing CJK rendering is our top priority for future video restoration.

**Key evidence:** texlive-lang-chinese in Dockerfile, 6-stage pipeline intact

**Follow-up:** "Why not use a different animation engine?"
→ Manim is purpose-built for math education and produces the highest quality output when it works. The alternatives (Remotion, Motion Canvas) require more manual work per video.

---

## Business/Market Questions

### Q6: "Walk me through the $160/month operating cost. What are the main drivers?"
**Answer (40s):**
The breakdown is roughly: $100/month for AI API calls via SiliconFlow at $0.001/K tokens — this covers all LLM usage including diagnostics, plan generation, manager-critic loops, unit content, and on-demand Q&A. About $30/month for TTS synthesis — our board lessons stream audio via Volcengine's BV700 voice model. The remaining $30 covers cloud hosting — an Alibaba Cloud ECS instance in Hong Kong running Docker Compose with PostgreSQL, Redis, and Celery workers. The key insight is that DeepSeek's pricing is 30x cheaper than GPT-4, making AI-native education economically viable.

**Key evidence:** SILICONFLOW_API_KEY config, VOLC_TTS_APPID, deployment_plans.md

**Follow-up:** "How does that scale with users?"
→ Costs scale linearly with usage. A single student doing daily study uses about 50K tokens/day. At $0.001/K tokens that's $0.05/day or $1.50/month per active student.

---

### Q7: "Who is your target customer and how do you monetize?"
**Answer (35s):**
Primary: Chinese middle and high school students preparing for Gaokao and international exams. Secondary: parents who currently pay $2,000–$15,000/year for private tutoring. We have Stripe billing integrated for subscription tiers — a free tier with limited plans per month, and a premium tier with unlimited plans, board lessons, and Gaokao prep. The pricing model targets under $10/month to be 10-20x cheaper than tutoring.

**Key evidence:** Stripe checkout endpoint, subscription_tier in users table

**Follow-up:** "How do you acquire users?"
→ Initial channel is organic search and education forums targeting Gaokao and AP exam communities. We're exploring partnerships with Chinese international schools.

---

### Q8: "If $160/month is your cost, what's your break-even on a $10/month subscription?"
**Answer (25s):**
At $10/month per user, we need about 16 subscribers to break even on direct costs. The real scaling challenge isn't cost — it's infrastructure. One Alibaba Cloud ECS instance handles about 50 concurrent users before we need to scale horizontally. The Docker Compose setup makes horizontal scaling straightforward — we can add worker nodes as needed.

**Key evidence:** docker-compose.yml with 7 services, deployment_plans.md

**Follow-up:** "What about customer support costs?"
→ Most support is handled by the AI mentor chat itself. For billing issues we have structured Stripe flows. We'd need a part-time support person at around 500 users.

---

### Q9: "What existing solutions did you compare against?"
**Answer (30s):**
Khan Academy and Coursera provide great content but no personalization. Chinese competitors like Yuanfudao and Zuoyebang offer live tutoring, which is personalized but costs $15-50/hour and doesn't scale. Duolingo has excellent gamification but doesn't cover STEM subjects. MentorMind sits at the intersection: AI-driven personalization at content-library prices, with the depth of a real tutor. Our process-first approach — seminar, simulation, oral defense — goes beyond what any current product offers.

**Follow-up:** "Couldn't a student just use ChatGPT?"
→ ChatGPT can explain concepts but doesn't build a persistent knowledge graph, track spaced repetition, or generate adaptive study plans. Our value is the structured, longitudinal learning experience.

---

## Methodology Questions

### Q10: "How did you validate the pedagogical quality of AI-generated plans?"
**Answer (35s):**
We used a multi-layer approach. First, the manager-critic loop provides automated quality scoring on every plan. Second, we built a content validator that checks for completeness and truncation before delivery. Third, we implemented a feedback survey system with PMF and NPS metrics that students fill out after completing plans. We haven't yet done formal A/B testing with control groups — that's planned for the next phase. But the auto-validation infrastructure gives us real-time quality signals.

**Key evidence:** content_validator.py, survey_responses table, feedback endpoints

**Follow-up:** "Have any teachers reviewed the plans?"
→ Not yet systematically. Teacher review is part of our LMS integration roadmap. The current quality metrics rely on the AI critic and student feedback.

---

### Q11: "Tell me more about the pivot from video generation to study plans."
**Answer (40s):**
We initially built a full 6-stage AI video generation pipeline — syllabus planning, storyboard creation, render plan generation, content validation, quality review, and Manim rendering. By week 4, two things became clear. First, CJK font rendering in Manim was inconsistent for complex math animations. Second, user research showed students wanted personalized guidance more than polished videos. The pivot was surgical: we hid the video frontend from user navigation but kept the entire pipeline intact. All `/create` components and `create_classes.py` logic remain in the codebase, ready to restore once we solve the font issue. The study plan system reused the same AI infrastructure — same models, same API, same database — just applied to a different output format.

**Key evidence:** `/create` hidden per CLAUDE.md, create-flow-hidden.md, full pipeline in robust_video_generation.py

**Follow-up:** "Was this a failure or a strategic adjustment?"
→ Strategic adjustment. The video pipeline worked — it just didn't produce consistent enough output for production. The pivot let us deliver a working product in 6 weeks instead of spending months on font rendering edge cases.

---

### Q12: "How do you handle data privacy, especially with Chinese student data?"
**Answer (25s):**
All user data stays on our own cloud infrastructure — no third-party data processors beyond the AI API calls, which are stateless and don't retain data. Student lesson data, knowledge graphs, and performance records are stored in our PostgreSQL instance with row-level user isolation. Authentication goes through Clerk with JWKS verification — we never store passwords. For China-specific deployment, we'd need to comply with PIPL, which our single-tenant architecture supports.

**Follow-up:** "What about the AI API calls?"
→ We send only the text needed for generation — no personally identifiable information. The SiliconFlow API doesn't retain prompts or completions.

---

## Future Work Questions

### Q13: "What's your plan for the mobile app?"
**Answer (25s):**
We'd build it with React Native to share the TypeScript types and API client logic from our Next.js frontend. Key features: offline access to downloaded study plans and flashcards, push notifications for spaced repetition reminders, and camera-based OCR for textbook photos. The board lesson would be audio-only on mobile since the visual board requires more screen space. Timeline: Q4 prototype.

**Follow-up:** "Why not just make the web app responsive?"
→ The web app is already responsive, but offline access, push notifications, and camera integration are native mobile features that a PWA can't fully replicate.

---

### Q14: "How would LMS integration work?"
**Answer (25s):**
We'd implement LTI 1.3 (Learning Tools Interoperability) to integrate with Canvas, Moodle, and Chinese platforms like Chaoxing. Teachers would assign MentorMind plans as homework, and student progress and quiz scores would sync back to the LMS gradebook. Our proficiency rollup data — which already aggregates per-subject, per-student — maps naturally to LMS grade categories. This is Q1 next year priority.

**Follow-up:** "What's the hardest part of LMS integration?"
→ SSO and data sync. Each LMS has different authentication flows and grade APIs. We'd start with Canvas since it has the cleanest LTI implementation.

---

### Q15: "What subject areas will you expand to beyond STEM?"
**Answer (25s):**
Our subject detection system already identifies frameworks — AP, A-Level, Gaokao, IB — across any topic. For humanities expansion, we'd add history (chronological knowledge graphs) and literature (character/theme relationship graphs). The core pipeline — diagnostic, knowledge graph, study plan — is subject-agnostic. The main work is building subject-specific prompt templates and content generators. Timeline: Q2 next year.

**Key evidence:** subject_detector.py, framework field in study_plans table

**Follow-up:** "What about language learning?"
→ Language learning is a different paradigm — it requires spaced repetition for vocabulary and grammar exercises, which our system already handles well. But pronunciation practice would need the ASR pipeline extended for language learning feedback.

---

## Quick Reference: Key Numbers

| Metric | Value |
|--------|-------|
| DeepSeek cost | $0.001/K (V3), $0.002/K (R1) |
| Monthly budget | $160 |
| Quality threshold | 0.8 (80%) |
| Max critic retries | 3 |
| Diagnostic turns (study plan) | Max 6 |
| Quiz score window | Last 3 scores |
| Difficulty levels | beginner / intermediate / advanced |
| Spaced review start | 48 hours |
| Telemetry retention | 90 days |
| Supported languages | zh, en, ja, ko |
| API version | 2.0.0 |
| Endpoints | ~100 |
| Celery queues | 3 (orchestration, rendering, heavy_ml) |

---

## Tricky Questions — Graceful Responses

**"This seems like it could be a ChatGPT wrapper."**
> "ChatGPT doesn't build a persistent knowledge graph, track spaced repetition, or run a manager-critic quality loop. Our value is the structured learning infrastructure — the graph, the scheduler, the diagnostic system — not the raw AI output."

**"How do you know students actually learn from this?"**
> "We track engagement metrics — quiz scores, spaced repetition completion, time spent in learning modes — and aggregate them into proficiency rollups. Formal learning outcome studies with pre/post tests are planned for our validation phase."

**"What happens if your AI generates wrong content?"**
> "The manager-critic loop catches structural and completeness issues, but factual accuracy of generated STEM content is a real challenge. We mitigate it with content validation, subject-specific prompt engineering, and we clearly communicate to users that the AI is a study aid, not an authoritative source. For Gaokao content, we use verified exam frameworks as grounding."

**"Why not just partner with an existing education platform?"**
> "Integration complexity — most platforms don't have APIs for personalized plan delivery or real-time AI interaction. Building standalone first lets us prove the model works, then we can pursue partnerships from a position of strength."
