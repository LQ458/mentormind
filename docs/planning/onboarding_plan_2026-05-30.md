# MentorMind Onboarding Plan

## Product Shape

MentorMind should split the first user decision into two clear paths:

1. Build a study plan for an exam/course.
2. Ask one question without creating a plan.

The study-plan path should start structured, then become conversational. Many
students cannot describe their needs well in an empty chat box, so the app
should first collect the minimum fields that materially change a plan:

- curriculum framework
- subject and course
- current foundation
- exam timeline
- target score
- weekly time budget
- total preparation window
- preferred study days and hours per session
- weak areas or uploaded context
- optional baseline check confidence

The chat should remain available after this intake, but it should refine the
structured context instead of being the only entry point.

## Debate And Decisions

### Questionnaire Before Chat

Decision: start with structured choices, then seed the chat with a summary.

Reasoning: progressive disclosure and multi-step forms reduce perceived effort
when the alternative is a long, blank or chaotic form. For MentorMind, each
question affects the generated plan, so the intake earns its place.

### Baseline Test Scope

Decision: implement a lightweight 5-question confidence check now; leave fully
graded, generated diagnostics for a later backend feature.

Reasoning: a real 5-10 question diagnostic requires answer generation,
grading, item calibration, and subject-specific rubrics. The current pass can
still give the agent useful signal by asking course-aware confidence prompts
and including the result in the plan prompt.

### Quick Question Path

Decision: keep quick help outside the plan flow and route it to the existing
lesson/question creation surface.

Reasoning: a student asking one problem should not be forced through exam
planning. This keeps the main plan funnel clean and protects quick intent.

### Chat Name

Decision: rename the assistant in the plan chat to "Mina".

Reasoning: "AI" is generic and cold. A name makes the conversation feel more
like a study companion without pretending to be human.

### Seminar Mode MVP

Decision: implement text-turn rooms first, with realtime voice as the next
transport layer rather than the core product dependency.

Reasoning: the key hypothesis is not "can we stream audio"; it is whether
students enjoy and learn from structured social disagreement. A polling room
with transcript, roles, AI challenge, and scoring can validate that quickly.
FunASR can later write low-latency transcripts into the same turn stream.

Competitive research suggests three durable primitives:

- argument structure and measurable progress, visible in tools like Symbai
- debate rooms with roles, timers, judging, and practice partners
- collaborative AI that supports group regulation without dominating humans

MentorMind should avoid becoming a formal debate tournament tool in this MVP.
The mode should feel like a study-room challenge attached to a plan: 3-4
students, one question, 15 minutes, Mina asks sharper questions, Kai creates
friction, and the review converts discussion quality into a learning graph.

## Implementation Scope

- Simplify the homepage to brand, language, and one start action.
- Preserve sign-in/register, but reveal it only when needed.
- Add a plan-vs-question entry choice to the study-plan page.
- Add structured intake after framework/subject selection.
- Seed the existing `/study-plan/chat` endpoint with intake context.
- Keep upload controls in the plan chat and expose their purpose in context.
- Add a seminar-mode MVP: small rooms, shared study-plan topics, human turns,
  Mina as AI facilitator, Kai as AI participant, and post-round scoring.
- Patch deployment/runtime issues that break production behavior on a VPS.

## Not In This Pass

- Fully graded generated diagnostic exams.
- Calendar notification delivery.
- New database schema for study schedules.
- True realtime voice rooms. FunASR transcripts can feed the same turn stream
  once the low-latency audio capture layer is ready.
