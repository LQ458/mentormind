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
│   ├── video_director_base.md       ← Base system prompt for the Video Director AI (Manim)
│   ├── video_director_math.md       ← Math/physics style extension (3Blue1Brown style)
│   └── video_director_general.md   ← General explainer style extension (Kurzgesagt-inspired)
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
system_prompt = load_prompt("video/video_director_base")

# Render with template variables (replaces {{variable}} placeholders)
user_prompt = render_prompt("learning/seminar", language="en", lesson_title="Calculus", ...)
```

## Adding a New Prompt

1. Create a `.md` file in the appropriate subfolder.
2. Use `{{variable_name}}` for dynamic values.
3. Load it with `render_prompt("folder/filename", variable_name=value)`.
4. Keep system prompts and user prompts in the same file separated by a `---` divider if needed.
