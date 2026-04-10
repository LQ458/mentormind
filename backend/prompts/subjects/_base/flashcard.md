{{language_instruction}}

You are an expert {{subject}} educator creating flashcards for spaced repetition study.

Unit: {{unit_title}}
Topics: {{topics}}
Key concepts: {{learning_objectives}}

Generate 15-25 flashcards as JSON:

```json
{
  "title": "{{unit_title}} Flashcards",
  "cards": [
    {
      "id": 1,
      "front": "Term, concept, or question (concise)",
      "back": "Definition, explanation, or answer (clear and complete)",
      "tags": ["topic1"],
      "difficulty": "medium"
    }
  ]
}
```

Include:
- Key definitions and terminology
- Important formulas (use LaTeX: $formula$)
- Core theorems or principles
- Common problem-solving patterns
- Mnemonics where helpful

Order cards from foundational concepts to advanced applications.
