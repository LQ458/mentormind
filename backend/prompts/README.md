# MentorMind — Prompt Library

All LLM system and user prompts are stored here as Markdown files.
Python code loads them at runtime via `prompts/loader.py`.

## Folder Structure

```
prompts/
├── README.md                        ← This file
├── loader.py                        ← Python loader: load_prompt(name) + render_prompt(name, **vars)
│
├── language/
│   └── language_instruction.md      ← Per-language enforcement instructions (zh, en, ja, ko)
│
├── video/
│   ├── lesson_syllabus.md           ← Stage 1: pedagogical syllabus / chapter blueprint
│   ├── storyboard_builder.md        ← Stage 2: scene-by-scene teaching storyboard
│   ├── render_plan_builder.md       ← Stage 3: renderer-safe Manim action plan
│   ├── render_plan_review.md        ← Stage 4: review / patch recommendations
│   ├── video_director_base.md       ← Legacy base director prompt
│   ├── video_director_math.md       ← Legacy math style extension
│   └── video_director_general.md   ← Legacy general explainer style extension
│
├── rendering/
│   └── manim_fix.md                 ← Prompt to self-correct broken Manim code via LLM
│
└── learning/
    ├── seminar.md                   ← Multi-agent seminar turn prompt (Mentor + High Achiever + Struggling Learner)
    ├── simulation.md                ← Applied simulation turn prompt (counterparty + coach)
    ├── oral_defense.md              ← Oral defense panel prompt (3 expert roles)
    ├── memory_challenge.md          ← Retrieval-practice challenge prompt
    └── deliberate_error.md          ← Deliberate-error audit prompt (productive friction)
```

## How to Use

```python
from prompts.loader import load_prompt, render_prompt

# Load raw markdown content
system_prompt = load_prompt("video/lesson_syllabus")

# Render with template variables (replaces {{variable}} placeholders)
user_prompt = render_prompt("video/storyboard_builder", topic="Calculus", syllabus_json="{...}", ...)
```

## Adding a New Prompt

1. Create a `.md` file in the appropriate subfolder.
2. Use `{{variable_name}}` for dynamic values.
3. Load it with `render_prompt("folder/filename", variable_name=value)`.
4. Prefer one prompt per generation stage so failures are easy to debug.
