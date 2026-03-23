# MentorMind: Robust Syllabus and Render-Plan Specification

## Overview

MentorMind no longer treats video generation as a single freeform LLM prompt.
The system now follows a staged educational pipeline:

1. `Syllabus`
2. `Storyboard`
3. `Render Plan`
4. `Validation`
5. `Review`
6. `Render`

This design exists for three reasons:

- better pedagogy
- safer rendering
- easier debugging

---

## 1. Syllabus Stage

The syllabus is the teaching contract for the rest of the pipeline.
It must answer: what is the learner supposed to understand, where will they get confused, and what visual moments are essential?

### Required Syllabus Fields

- `title`
- `big_idea`
- `target_level`
- `visual_flavor`
- `teaching_arc`
- `chapters[]`
- `quality_checks[]`

### Chapter Rules

Each chapter must include:

- `id`
- `title`
- `learning_goal`
- `common_misconception`
- `visual_intent`
- `must_show`
- `key_terms`

### Pedagogical Constraints

- 4 to 6 chapters only
- one main teaching move per chapter
- include at least one worked example
- include at least one misconception-focused chapter
- include retrieval or recap near the end
- adapt explanation density to `student_level`

---

## 2. Storyboard Stage

The storyboard translates the syllabus into teachable scenes.
This stage decides what happens on screen, what is spoken, and why the learner should care.

### Required Storyboard Fields

- `title`
- `story_goal`
- `scenes[]`

Each scene must include:

- `id`
- `chapter_id`
- `scene_goal`
- `teaching_move`
- `narration`
- `on_screen_text`
- `visual_layout`
- `primary_visual`
- `graph_config`
- `estimated_seconds`
- `check_for_understanding`

### Allowed Layouts

- `title_card`
- `equation_focus`
- `graph_focus`
- `two_column`
- `callout_card`
- `recap_card`

### Storyboard Constraints

- 5 to 8 scenes only
- short on-screen text
- one core idea per scene
- avoid mixing multiple examples in one scene
- end with retrieval, recap, or both

---

## 3. Render Plan Stage

The render plan is the strict runtime contract for Manim.
It must be safe, compact, and deterministic enough that the renderer does not have to guess.

### Required Render Plan Fields

- `title`
- `scenes[]`

Each scene must include:

- `id`
- `duration`
- `narration`
- `action`
- `param`
- `visual_type`
- `canvas_config`

### Allowed Actions

- `show_title`
- `show_text`
- `write_tex`
- `plot`
- `transform`
- `draw_shape`

### Required `canvas_config`

- `layout`
- `position`
- `font_size`
- `max_chars`
- `safe_scale`
- `graph.x_range`
- `graph.y_range`

### Render Safety Rules

- `visual_type` must always be `manim`
- `duration` must stay between 4 and 16 seconds
- `write_tex` must be pure LaTeX only
- `plot` must be a safe expression in `x`
- all text must fit within the mobile-safe frame
- if a scene is too dense, simplify it rather than packing more content

---

## 4. Validation Stage

Validation is deterministic, not optional.
The validator must repair or reject common failure modes before TTS and rendering begin.

### Validation Checks

- unsupported action names
- empty narration
- unsafe or invalid plot expressions
- non-ASCII content inside `write_tex`
- text longer than the screen budget
- invalid graph ranges
- too few scenes
- impossible or missing durations

### Repair Strategy

- remap unknown actions to `show_text`
- clamp durations into a safe range
- fallback from invalid LaTeX to text-safe display
- add default graph ranges when missing
- trim text to a maximum visible length
- append recap-safe fallback scenes if the plan is too short

---

## 5. Review Stage

After validation, a second review pass checks whether the lesson still makes sense for a learner.
This stage may propose scene-level patches, but only within the current renderer’s safe action set.

### Review Criteria

- clear hook
- coherent concept progression
- at least one worked example
- at least one misconception or pitfall
- recap or retrieval near the end
- no visually overloaded scenes
- beginner-friendly density for the target level

---

## 6. Render Stage

The renderer should consume only the validated render plan.
It should not invent layout or pacing decisions that belong upstream.

### Renderer Responsibilities

- honor `canvas_config`
- use configured graph ranges
- keep objects within the safe visual zone
- add audio per scene
- retry with code-fix prompt only when the Python render code fails

### Renderer Non-Responsibilities

- rewriting pedagogy
- inventing missing lesson structure
- guessing learner level
- compensating for scene overload by itself

---

## 7. Audio and Timing Contract

Audio timing must no longer be treated as an afterthought.
Narration and animation should be planned to fit together rather than stitched together loosely.

### Timing Principles

- narration should be compact enough for scene duration
- TTS duration should overwrite estimated duration only after validation
- every scene with narration must produce a real audio file
- final media should be checked for an audio stream

### Required QA

- audio file exists
- audio duration is positive
- rendered video exists
- rendered video contains an audio stream

---

## 8. Debugging Surfaces

Every stage should be inspectable without running a full Celery job.

### Required Debug Routes

- `POST /debug/generation/pipeline`
  Returns syllabus, storyboard, render plan, validation, review, and prompt versions.

- `POST /debug/generation/video-script`
  Returns the final validated `VideoScript` payload that will be sent to Manim.

### Required Saved Artifacts

- prompt version hashes
- stage outputs
- validation warnings
- review patches
- scene audio metadata
- final media probe result

---

## 9. Instructional Design Principles

MentorMind should follow these educational defaults unless the user explicitly requests otherwise:

- teach one idea at a time
- prefer worked examples over abstract exposition
- surface common misconceptions explicitly
- use retrieval before recap when possible
- optimize for comprehension, not just “content coverage”
- keep the learner active, not passive

---

## 10. Implementation Contract

The codebase should reflect this flow:

- `robust_video_generation.py` owns syllabus -> storyboard -> render plan -> validation -> review
- `video_scripting.py` converts the final render plan into the renderer payload
- `output.py` owns TTS, artifact checks, and final video validation
- `manim_renderer.py` consumes `canvas_config` instead of guessing layout
- `server.py` exposes debug routes for stage inspection

This is the standard MentorMind generation architecture going forward.
