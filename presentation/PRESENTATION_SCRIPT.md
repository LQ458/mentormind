# MentorMind — Presentation Script

Total: ~8 minutes speaking, ~2 minutes demo = 10 minutes

---

## Slide 1 — Title (30s)

Hi everyone, I'm Leo. This is MentorMind, an AI platform that builds personalized study plans for Chinese students. 

Here's the short version of what I built: a system that chats with a student to diagnose their real knowledge gaps, maps those gaps in a personal knowledge graph, and then uses two AI models working together to generate and quality-check study plans before delivering them. I'll walk you through how it works and then show you a quick live demo.

---

## Slide 2 — The Problem (45s)

To set the stage — China has 46 million students in exam-track education, from middle school through the Gaokao. Private tutoring is a massive industry, costing families thousands of dollars per year. But here is the thing: it is still one-size-fits-all. A teacher with 50 students cannot deeply diagnose what each individual student is missing.

What happens is students spend hours reviewing topics they have already mastered, while their real weaknesses go unaddressed. The fundamental problem MentorMind solves is this: how do you give every student the equivalent of a personal tutor who knows exactly what they need to work on?

---

## Slide 3 — How It Works (55s)

So how does it work. There are four steps.

First, a conversational diagnostic. The AI chats with the student, asks targeted questions, and adapts based on the answers. It is not a multiple choice survey — it actually tries to figure out what the student thinks they know versus what they actually know.

Second, the knowledge graph. We take those diagnostic results and build a personal map of every concept the student has encountered — including how those concepts relate to each other. Prerequisites, containment, related topics — all tracked per student, per language.

Third, the manager-critic loop. Two AI models work together. One generates a study plan, the other evaluates it across five quality dimensions. Only plans that pass the quality threshold get delivered to the student.

Fourth, active learning modes. The student does not just read a study plan. They participate in seminar debates, solve simulation scenarios, defend their reasoning to an expert panel, do timed memory challenges, and find errors in flawed solutions. Learning by doing, not reading.

---

## Slide 4 — Architecture (50s)

Here is what is under the hood. Next.js 14 on the frontend with Clerk for authentication. FastAPI on the backend, version 2, serving about 90 endpoints.

Three isolated Celery queues so that a heavy video render never blocks a study plan generation. PostgreSQL stores everything — user data, lessons, study plans, and the entire knowledge graph. Redis handles caching and job orchestration.

All AI calls go through SiliconFlow, which gives us access to DeepSeek R1 for planning and V3 for evaluation, at well under one cent per thousand tokens. For multimodal input, we run FunASR for Chinese speech to text and PaddleOCR for extracting text from images. The architecture diagram on the right shows how these pieces connect.

---

## Slide 5 — Knowledge Graph (50s)

Let me zoom in on the knowledge graph, because it is the backbone of personalization.

Students can upload audio recordings — say, a teacher's lecture — and FunASR transcribes it. They can upload photos of a textbook page and PaddleOCR pulls out the text. Both streams feed into an LLM that extracts concepts and their relationships.

That data goes into two PostgreSQL tables: one for concept nodes and one for relationship edges. The graph is per-user and per-language, so a student studying math in Chinese has a completely different graph from one studying the same material in English.

On the frontend, D3.js renders this as an interactive force-directed graph — like the one you see on screen. Green means mastered, yellow means in progress, red means this is where the student needs help. Those red nodes are what the study planner prioritizes.

---

## Slide 6 — Manager Critic Loop (55s)

This is the intelligence core of the system.

DeepSeek R1 acts as the manager. It takes the diagnostic data and the knowledge graph and generates a structured study plan with units, topics, learning objectives, and estimated study hours.

Before that plan reaches the student, DeepSeek V3 acts as the critic. It scores the plan from zero to one across five dimensions: clarity, accuracy, pedagogical effectiveness, engagement, and difficulty appropriateness.

The threshold is 0.8. If the plan scores below that, the critic sends specific feedback back to the manager, and the manager regenerates. We allow up to three regeneration cycles. If the plan hits 0.8 or above, it is saved and delivered.

We also have four specialized subagents — a writer, a coder, a researcher, and another critic — that produce the actual unit content like quizzes, flashcards, and formula sheets.

This code lives in our agentic module: a LessonPlanner class for the manager and a QualityCritic class for the evaluator, backed by the subagents. The diagram on the right shows the flow.

---

## Slide 7 — Learning by Doing (55s)

What makes MentorMind genuinely different is what happens after the plan is created. We do not hand the student a reading list and walk away.

We have five active learning modes. First, the multi-agent seminar: three AI personas debate a topic from different perspectives and the student evaluates their arguments. Second, applied simulation: the student gets a real decision scenario and has to apply what they learned. Third, oral defense: an expert panel fires questions at the student. Fourth, memory challenge: a timed retrieval sprint. Fifth, error audit: the student finds the flaws in a deliberately wrong answer.

All of this is backed by a forgetting-curve spaced repetition scheduler. Students get review prompts at increasing intervals based on how well they demonstrate mastery. And the system generates proactive notifications when a student is at risk of forgetting something.

---

## Slide 8 — The Pivot (45s)

I want to be honest about our journey. The original vision was AI-generated educational videos. We spent the first three weeks building a five-stage video pipeline with Manim — the same math animation engine that 3Blue1Brown uses. The pipeline worked end to end.

But by week four, two things became clear. First, CJK font rendering in Manim was inconsistent for production use. Second, when we talked to users, they told us they wanted personalized guidance more than they wanted polished videos.

So we pivoted. We hid the video UI from the frontend, kept the entire pipeline code intact for future restoration, and redirected all effort to the study plan system. The pivot also taught us something valuable about resilience — we built a circuit breaker with multi-provider API fallback so the system keeps working even if one provider goes down.

---

## Slide 9 — Results (45s)

Here is what we shipped in six weeks. API version 2 with about 90 endpoints covering lesson generation, study plans, knowledge graphs, Gaokao prep, board lessons, billing, analytics, and telemetry. Four languages: Chinese, English, Japanese, and Korean.

Operating cost is about 160 dollars per month. The adaptive difficulty system uses a sliding window of the last three quiz scores to auto-adjust the student's level. We have full telemetry with 90 day retention and daily proficiency rollups per subject per student.

And as a bonus, we built a complete Gaokao exam preparation system — chat-based tutoring with practice problem generation. That is directly relevant to our target market of Chinese exam-track students.

---

## Slide 10 — Close (30s)

Three priorities moving forward. One, restore the video generation pipeline once we solve the CJK font rendering issue. Two, build a mobile app with offline study plan access using React Native. Three, integrate with school learning management systems using the LTI standard so teachers can assign MentorMind plans as homework.

Thank you for your attention. Let me show you a quick demo, and then I am happy to take any questions.

---

## Demo transition (2 min)

Let me switch over to the live system. I have it running right now. 

[Follow demo_script.md — show study plan creation, knowledge graph, plan detail]

---

## Q&A readiness

Key numbers to remember if asked:
- 0.8 quality threshold, 3 max retries
- 5 critic dimensions: clarity, accuracy, pedagogy, engagement, difficulty
- $0.001 per K tokens for V3, $0.002 for R1
- 48 hour default review interval, 24h if mastery below 0.65
- 90 day telemetry, 3 Celery queues
- ~90 endpoints, 4 languages, 4 subagents
- 5 active learning modes, 5 stage video pipeline
