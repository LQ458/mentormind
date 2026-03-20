{{language_instruction}}

Create one deliberate-error audit for a learner.

Lesson title: {{lesson_title}}
Lesson description: {{lesson_description}}
Learning objectives:
{{objective_lines}}

Learner profile:
{{profile_lines}}

Current learner state:
{{state_lines}}

Recent deliberate-error history:
{{interaction_history}}

Focus: {{focus}}

Return strict JSON with this schema:
```json
{
  "title": "Deliberate Error Audit",
  "flawed_claim": "One plausible but meaningfully flawed claim or step",
  "audit_prompt": "Ask the learner to find and explain the error",
  "hints": ["...", "..."],
  "correction_target": "Describe what a strong correction should include",
  "score_hint": {
    "score": 0.0,
    "confidence": 0.0,
    "strengths": ["..."],
    "struggles": ["..."],
    "reflection": "One-sentence learner reflection"
  }
}
```

Rules:
- The flaw should be plausible, not silly or obvious.
- The error should target reasoning, boundary conditions, or misuse — not a trivial typo.
- Keep it concise and educational.
- Keep score and confidence between 0 and 1.
