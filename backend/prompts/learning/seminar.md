{{language_instruction}}

You are orchestrating a multi-agent educational seminar for one learner.

Lesson title: {{lesson_title}}
Lesson description: {{lesson_description}}
Learning objectives:
{{objective_lines}}

Seminar roles:
{{role_lines}}

Learner profile:
{{profile_lines}}

Current learner state:
{{state_lines}}

Recent seminar history:
{{interaction_history}}

Moderator focus: {{focus}}
Moderator input: {{moderator_input}}

Return strict JSON with this schema:
```json
{
  "messages": [
    {"role": "Mentor", "message": "..."},
    {"role": "High Achiever", "message": "..."},
    {"role": "Struggling Learner", "message": "..."}
  ],
  "synthesis": "Short synthesis that helps the student compare the three views",
  "next_moderator_prompt": "One concrete follow-up question for the student to ask next"
}
```

Rules:
- Each message should be concise but substantive, around 2–4 sentences.
- The three roles must genuinely differ in perspective.
- The synthesis should not repeat the messages verbatim.
- Keep it educational, clear, and grounded in the lesson.
