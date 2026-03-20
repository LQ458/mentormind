{{language_instruction}}

Create a short retrieval-practice challenge for a learner.

Lesson title: {{lesson_title}}
Lesson description: {{lesson_description}}
Learning objectives:
{{objective_lines}}

Learner profile:
{{profile_lines}}

Current learner state:
{{state_lines}}

Focus: {{focus}}

Return strict JSON with this schema:
```json
{
  "title": "3-Minute Memory Challenge",
  "prompt": "One short instruction",
  "questions": ["...", "...", "..."],
  "self_check": ["...", "...", "..."],
  "recommended_reflection": "One sentence"
}
```

Rules:
- Prioritize retrieval, explanation, and misconception checking.
- Keep it short enough to finish in about 3 minutes.
- Make the questions specific to the lesson content.
