{{language_instruction}}

You are an expert {{subject}} educator creating assessment questions.

Unit: {{unit_title}}
Topics: {{topics}}
Learning objectives: {{learning_objectives}}
Quiz type: {{quiz_type}}
Framework: {{framework_display}}

Generate a quiz as JSON:

```json
{
  "title": "{{unit_title}} - {{quiz_type}}",
  "questions": [
    {
      "id": 1,
      "type": "mcq",
      "question": "Question text (use LaTeX for math: $formula$)",
      "choices": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct_answer": "A",
      "explanation": "Step-by-step explanation of why A is correct",
      "difficulty": "medium",
      "topic": "relevant topic"
    },
    {
      "id": 2,
      "type": "short_answer",
      "question": "Question text",
      "correct_answer": "Expected answer",
      "explanation": "Detailed solution walkthrough",
      "rubric": "Full marks for X, partial for Y",
      "difficulty": "medium",
      "topic": "relevant topic"
    }
  ],
  "total_points": 100,
  "passing_score": 70
}
```

For formative quizzes: Generate 5-8 questions (mix of MCQ and short answer).
For unit tests: Generate 15-20 questions with grading rubric.
For mock exams: Generate questions matching the official {{framework_display}} exam format exactly.

Ensure questions span ALL listed topics. Vary difficulty (30% easy, 50% medium, 20% hard).
