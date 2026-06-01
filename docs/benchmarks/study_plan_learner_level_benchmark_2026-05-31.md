# Study Plan Learner-Level Benchmark

Date: 2026-05-31  
Surface tested: `/study-plan` real browser flow on `http://localhost:3000`  
Backend: `http://localhost:8000`, real `/study-plan/chat` calls through the Next proxy  
Course anchor: AP Physics 1, English UI

## Research-Informed Rubric

I used three reference ideas to shape the benchmark:

- [CAST UDL Guidelines](https://udlguidelines.cast.org/): learner variability should be handled through challenge/support, prior-knowledge connection, vocabulary/symbol support, multiple representations, and graduated support for practice/performance.
- [EEF Feedback evidence summary](https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/feedback): useful feedback should focus on task, process, and self-regulation, with specific information on how to improve; lower-attaining pupils benefit especially from clear actionable feedback.
- [IES/WWC mathematics intervention practice guide](https://ies.ed.gov/ncee/WWC/PracticeGuide/26/Published): struggling learners need systematic instruction, clear mathematical language, concrete/semi-concrete representations, and deliberate word/problem instruction.

Score scale: 1 = weak, 3 = acceptable, 5 = strong.

## Test Method

Browser automation script:
`.browser-sessions/benchmarks/run_study_plan_benchmark.js`

Raw output:
`.browser-sessions/benchmarks/study-plan-learner-levels/raw-results.json`

Screenshots:

- `.browser-sessions/benchmarks/study-plan-learner-levels/extra-smart-intake.png`
- `.browser-sessions/benchmarks/study-plan-learner-levels/extra-smart-response.png`
- `.browser-sessions/benchmarks/study-plan-learner-levels/smart-intake.png`
- `.browser-sessions/benchmarks/study-plan-learner-levels/smart-response.png`
- `.browser-sessions/benchmarks/study-plan-learner-levels/medium-intake.png`
- `.browser-sessions/benchmarks/study-plan-learner-levels/medium-response.png`
- `.browser-sessions/benchmarks/study-plan-learner-levels/slow-learner-response.png`
- `.browser-sessions/benchmarks/study-plan-learner-levels/slow-learner-retry-response.png`

All four personas used the same course so adaptation differences came from learner profile, target, time budget, notes, and baseline confidence.

## Personas And Prompts

| Persona | Intake Settings | Fabricated Student Prompt |
| --- | --- | --- |
| Extra smart | Foundation: Aiming high. Target: AP 5 with margin. 8 h/week, 2 months. Baseline mostly very confident. | Already fast with algebra, vectors, and basic mechanics. Needs high-difficulty AP Physics 1 FRQs, experimental design, edge cases, and a fast pace. Gets bored by long basic explanations. |
| Smart | Foundation: Intermediate. Target: AP 4 or 5. 6 h/week, 4 months. Baseline mostly steady/somewhat. | Understands class lectures and can solve routine problems. Mistakes appear on multi-step force/energy questions, graphs, and explaining reasoning under time pressure. |
| Medium | Foundation: Some foundation. Target: AP 3 or 4. 5 h/week, 5 months. Baseline mixed, calculations and misconceptions weak. | Can follow examples after seeing them, but struggles to start problems alone. Weak in free-body diagrams, equations from graphs, and choosing formulas. |
| Slow learner | Foundation: New to this. Target: pass AP Physics 1, confidence first. 4 h/week, 6 months. Baseline not confident on all five checks. | Gets overwhelmed by formulas and gives up when a problem has multiple steps. Needs very concrete explanations, vocabulary, visual intuition, repetition, and confidence-building. |

## Results

| Persona | API Result | Latency | Output Summary | Overall |
| --- | ---: | ---: | --- | ---: |
| Extra smart | 200 | 60.7s | Generated `AP Physics 1: Algebra-Based Edge-Case & FRQ Mastery`, with edge cases, Olympiad-style AP problems, experimental design, and timed exam simulation. | 3.9/5 |
| Smart | 200 | 57.0s | Generated `AP Physics 1: Algebra-Based Mastery`, standard units plus multi-step force problems, graph/data analysis, and FRQ structured responses. | 3.5/5 |
| Medium | 200 | 59.3s | Generated `AP Physics 1: Algebra-Based Study Plan`, standard AP sequence with formula selection, graph analysis, and misconceptions in exam review. | 3.0/5 |
| Slow learner | 504 first run, 200 retry | 106.1s failure, 50.0s retry | Retry generated `AP Physics 1: Algebra-Based Confidence Builder`, adding foundations/math confidence, vocabulary, units, conversions, graphing basics, and visual intuition. | 2.4/5 |

## Rubric Scores

| Dimension | Extra Smart | Smart | Medium | Slow Learner |
| --- | ---: | ---: | ---: | ---: |
| Intake captures relevant needs | 4.5 | 4.5 | 4.5 | 4.5 |
| Plan differentiates by level | 4.5 | 3.6 | 2.8 | 2.6 |
| Study load and pacing realism | 3.5 | 3.6 | 3.4 | 2.4 |
| Scaffolding and accessibility | 3.2 | 3.0 | 2.5 | 2.2 |
| Actionability after generation | 3.4 | 3.3 | 3.0 | 2.8 |
| Reliability and latency | 3.0 | 3.1 | 3.0 | 1.2 |

## What Works

The learner profile UI is directionally good. It captures foundation level, target score, time budget, study days, weak areas, and five confidence checks. That is enough signal to distinguish high, middle, and low confidence learners.

The plan generator does respond to stronger learner signals. The extra-smart plan was meaningfully different from the smart/medium plans: it shifted into edge cases, complex FRQs, experimental design, and high-challenge synthesis.

Estimated total hours roughly followed the intake: 64 h for 8 h/week over 2 months, 96 h for 6 h/week over 4 months, 105 h for 5 h/week over 5 months, and 104 h for 4 h/week over 6 months.

## Main Problems

1. Slow learner generalization is not strong enough.

The retry did add a foundation unit, vocabulary, units, conversions, and visual intuition, which is good. But after that it largely returns to the normal AP Physics 1 sequence. For a "new to this / not confident on everything" student, the plan still looks like a full AP syllabus with only light scaffolding. It needs explicit worked examples, guided practice, confidence checkpoints, formula anxiety support, and a minimum-pass route.

2. Medium and smart plans are too similar.

The medium learner said they struggle to start problems alone, but the plan mostly lists regular AP topics. It should have more "worked example -> guided attempt -> independent attempt" structure, especially for free-body diagrams, graph-to-equation translation, and formula choice.

3. Output is too coarse.

The UI exposes units and topics, but not the actual weekly calendar, per-unit hours, lesson mode mix, checkpoint tests, or what a student does on Monday/Wednesday/Friday. The intake asks for days and session length, but the generated card does not visibly honor that schedule.

4. Unit hour display has a formatting bug.

Each unit line ends with a bare `h`, with no number before it. That makes the plan look unfinished and weakens trust.

5. Proposed plans auto-save before acceptance.

The benchmark created multiple "My Study Plans" entries while still showing `Looks good, let's go!` and `Revise`. This is surprising: the user has not explicitly accepted the plan yet. It also polluted later benchmark runs with prior AP Physics plans.

6. Latency is too high for a normal product flow.

Successful generations took about 57-61 seconds. The slow learner failed once with a 504 after about 106 seconds, then succeeded on retry in 50 seconds. For a consumer app, this needs either async job UX, streaming progress, a faster model path, or a two-stage draft/detail generation.

## Generalizability Verdict

Current status: partially generalizable.

The system can distinguish extra-smart, smart, and medium learners at the title/topic level. It is weakest for slow learners, where the plan needs the most pedagogical care and where the first run timed out.

I would not call it fully ready for all four learner levels yet. It is acceptable for high-performing and regular students; it needs prompt/schema changes and UX fixes before it is trustworthy for slow learners.

## Recommended Product Changes

1. Add an explicit `learner_tier` to the generated plan schema.

Use values like `accelerated`, `standard`, `scaffolded`, `foundation_rebuild`. The model should not infer this loosely from prose only.

2. Add a pedagogy profile to each plan.

Include:

- pace: accelerated / normal / slow
- concept_example_practice_test ratio
- support pattern: challenge-first / balanced / worked-example-first / confidence-first
- target difficulty curve by week
- when to ask Mina for help

3. Make the output schedule concrete.

For every plan, show:

- weekly calendar
- session length
- per-session objective
- checkpoint quiz date
- review day
- catch-up buffer

4. Add slow learner safeguards.

For `foundation_rebuild`, require:

- prerequisite check before AP content
- vocabulary and symbol decoding
- concrete/visual representation
- one worked example before independent practice
- one confidence win per session
- no timed tests until basic problem setup is stable
- a "minimum viable AP pass" path

5. Add accelerated learner safeguards.

For `accelerated`, require:

- skip/diagnose basics
- challenge bank
- common misconception traps
- lab/graph experimental design
- timed FRQ with rubric self-grading
- optional extension, clearly marked as not AP-required

6. Do not auto-save proposed plans.

Save only after the user confirms. A draft can be stored locally or marked as `draft`, but it should not appear as an active plan before acceptance.

7. Fix unit-hour rendering.

The unit list should display `6h`, `8h`, etc., or hide the unit-hour badge if the value is missing.

8. Add a CI/nightly benchmark.

Keep these four personas as regression cases. A fast mocked test can validate schema and adaptation; a nightly live-LLM test can measure content quality and latency.

## Suggested Acceptance Gates

- Extra smart: plan must compress review and include challenge/FRQ/lab design without wasting units on basics.
- Smart: plan must include balanced concept repair and AP practice, with explicit graph/data and timed-response checkpoints.
- Medium: plan must include worked examples, guided practice, independent practice, and error review for stated weak areas.
- Slow learner: plan must include foundation rebuild, vocabulary/symbol support, concrete representations, confidence goals, and a lower-pressure AP route.
- All levels: visible weekly schedule, per-unit hours, checkpoint quizzes, and no active save before user confirmation.
