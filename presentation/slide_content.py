"""
MentorMind Presentation — Slide Content (10 min edition)
Tight, visual-first slides. ~45-60s speaker notes per slide.
"""

SLIDES = [
    {
        "id": "title",
        "title": "MentorMind",
        "subtitle": "AI-Powered Personalized Study Plans",
        "tagline": "Senior Project  •  Leo Qin",
        "speaker_notes": (
            "Hi everyone, I'm Leo. MentorMind is an AI platform that builds "
            "personalized study plans for Chinese students. In 10 minutes I'll show you "
            "how we diagnose knowledge gaps, map them in a graph, and generate adaptive "
            "learning paths — plus a quick live demo."
        ),
        "time_seconds": 30,
    },
    {
        "id": "problem",
        "title": "46 million students. One-size-fits-all teaching.",
        "bullets": [
            "Private tutoring costs Chinese families $2,000–$15,000/year",
            "Teachers can't personalize for 50+ students per class",
            "Students waste time on what they already know",
        ],
        "speaker_notes": (
            "China has 46 million exam-track students. Private tutoring is expensive "
            "but still generic — a teacher with 50 students can't deeply diagnose each "
            "one. Students re-study mastered topics while real gaps go unaddressed. "
            "MentorMind solves this with AI that finds what each student actually needs."
        ),
        "time_seconds": 45,
    },
    {
        "id": "solution",
        "title": "How MentorMind works",
        "bullets": [
            "Conversational diagnostic uncovers real knowledge gaps",
            "Knowledge graph maps concept dependencies per student",
            "Manager-critic AI loop generates & quality-checks study plans",
            "5 interactive learning modes replace passive reading",
        ],
        "speaker_notes": (
            "Three-step flow. First, an AI chats with the student to diagnose what they "
            "know — not a survey, it adapts questions based on answers. Second, we build "
            "a personal knowledge graph showing how concepts connect. Third, a "
            "manager-critic AI pair generates study plans and evaluates them before "
            "delivery. Then the student engages through five active learning modes — "
            "not just reading, but debating, solving, and defending."
        ),
        "time_seconds": 55,
    },
    {
        "id": "architecture",
        "title": "System Architecture",
        "bullets": [
            "Next.js 14 frontend  ·  FastAPI v2 backend",
            "3 isolated Celery queues for orchestration, rendering, ML",
            "PostgreSQL + Redis  ·  SiliconFlow API for DeepSeek models",
            "FunASR (speech) + PaddleOCR (text) for multimodal input",
        ],
        "speaker_notes": (
            "Next.js frontend with Clerk auth. FastAPI backend with ~100 endpoints. "
            "Three Celery queues so a video render never blocks a study plan. "
            "PostgreSQL stores everything including the knowledge graph. Redis for "
            "caching and job orchestration. All AI through SiliconFlow at $0.001–$0.002 "
            "per thousand tokens. FunASR and PaddleOCR handle Chinese speech and images."
        ),
        "time_seconds": 50,
    },
    {
        "id": "kg",
        "title": "Knowledge Graph: Every student gets their own",
        "bullets": [
            "Audio/Image upload → FunASR/PaddleOCR → extracted text",
            "LLM extracts concepts → stored in per-user PostgreSQL graph",
            "D3.js force-directed visualization with mastery colors",
        ],
        "speaker_notes": (
            "Students upload audio or images. FunASR transcribes Chinese speech, "
            "PaddleOCR extracts text from textbook photos. An LLM pulls out concepts "
            "and their relationships — prerequisite, contains, related to — and stores "
            "them in a per-user knowledge graph. The frontend renders it with D3.js: "
            "green nodes are mastered, yellow in progress, red need work. Red nodes "
            "become the study plan's priority."
        ),
        "time_seconds": 50,
    },
    {
        "id": "critic",
        "title": "Manager-Critic: AI that checks its own work",
        "bullets": [
            "DeepSeek R1 (Manager) generates the draft study plan",
            "DeepSeek V3 (Critic) scores on 5 quality dimensions",
            "Score < 0.8 → feedback loop, up to 3 regenerations",
        ],
        "speaker_notes": (
            "This is the intelligence core. R1 acts as manager — generates a study plan "
            "with units, objectives, and hours. V3 acts as critic — evaluates on clarity, "
            "accuracy, pedagogy, engagement, and difficulty. If below 0.8, the critic "
            "sends specific feedback and R1 regenerates — up to three times. Only plans "
            "that pass the threshold reach the student. Plus four subagents — writer, "
            "coder, researcher, and a second critic — produce the actual unit content."
        ),
        "time_seconds": 55,
    },
    {
        "id": "process",
        "title": "Process-First: Learning by doing, not reading",
        "bullets": [
            "Multi-Agent Seminar — 3 AI roles debate, you judge",
            "Applied Simulation — decision scenarios using real concepts",
            "Oral Defense — expert panel quizzes your reasoning",
            "Memory Challenge + Error Audit for active retrieval",
        ],
        "speaker_notes": (
            "What makes MentorMind different. Seminar: three AI personas debate a topic "
            "from different angles, the student evaluates their arguments. Simulation: "
            "a real decision scenario where students apply what they learned. Oral "
            "Defense: three expert agents fire questions at the student. Memory "
            "Challenge: a timed retrieval sprint. Error Audit: find the flaws in a "
            "wrong answer. Backed by a forgetting-curve spaced repetition scheduler "
            "with proactive review notifications."
        ),
        "time_seconds": 55,
    },
    {
        "id": "pivot",
        "title": "The Pivot: Videos → Study Plans",
        "bullets": [
            "Week 1–3: Built a full 6-stage AI video pipeline with Manim",
            "Week 4: CJK font rendering inconsistent — pivoted to study plans",
            "Video pipeline preserved. Pivot unlocked the real user need.",
        ],
        "speaker_notes": (
            "Honest story. We built a full video generation pipeline — 3Blue1Brown-style "
            "math animations with Manim. Worked, but CJK font rendering was too "
            "inconsistent. User research showed students wanted personalization more "
            "than polished videos. Week 4 pivot: hid the video UI, redirected to study "
            "plans. The pipeline code is intact for future restoration. The pivot also "
            "taught us API resilience — circuit breaker with multi-provider fallback."
        ),
        "time_seconds": 45,
    },
    {
        "id": "results",
        "title": "Results",
        "bullets": [
            "API v2 — ~100 endpoints, 4 languages (zh/en/ja/ko)",
            "$0.001–$0.002/K tokens → ~$160/month operating cost",
            "Adaptive difficulty, spaced repetition, 90-day telemetry",
            "Bonus: Gaokao exam prep system built for target market",
        ],
        "speaker_notes": (
            "What we shipped. API v2 with ~100 endpoints across lessons, study plans, "
            "knowledge graphs, Gaokao prep, board lessons, billing, analytics. Four "
            "languages. Operating cost ~$160/month. Adaptive difficulty adjusts from "
            "three-score sliding window. Spaced repetition starts reviews at 48 hours. "
            "Full telemetry with 90-day retention. And a Gaokao prep system — directly "
            "relevant to our Chinese target market."
        ),
        "time_seconds": 45,
    },
    {
        "id": "future",
        "title": "Next Steps",
        "bullets": [
            "Restore video generation with fixed CJK Manim pipeline",
            "Mobile app with offline study plans",
            "LMS integration for school deployment",
        ],
        "speaker_notes": (
            "Three priorities: restore video generation once CJK fonts are solved, build "
            "a React Native mobile app for offline access, and integrate with school "
            "learning management systems. Thank you — let me show you a quick demo, "
            "then I'm happy to take questions."
        ),
        "time_seconds": 30,
    },
]
