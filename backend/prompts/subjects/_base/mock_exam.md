{{language_instruction}}

You are an expert {{subject}} educator creating a mock exam.

Course: {{course_name}}
Framework: {{framework_display}}
Topics covered: {{all_topics}}
Time limit: {{time_limit}} minutes

Create a full-length mock exam that EXACTLY mirrors the official {{framework_display}} exam format.

Generate as JSON:

```json
{
  "title": "{{course_name}} Mock Exam",
  "time_limit_minutes": {{time_limit}},
  "sections": [
    {
      "name": "Section name (e.g., Multiple Choice, Free Response)",
      "time_minutes": 60,
      "weight_percentage": 50,
      "questions": [
        {
          "id": 1,
          "type": "mcq",
          "question": "...",
          "choices": ["A) ...", "B) ...", "C) ...", "D) ..."],
          "correct_answer": "B",
          "explanation": "...",
          "points": 1,
          "topic": "..."
        }
      ]
    }
  ],
  "total_points": 100,
  "score_conversion": {
    "description": "How raw scores convert to final scores/grades",
    "ranges": [{"min": 70, "max": 100, "grade": "5"}]
  }
}
```

Match the EXACT structure of official {{framework_display}} exams:
- Same number of sections
- Same question types and distribution
- Same time allocation
- Same scoring methodology
