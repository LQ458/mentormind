{{language_instruction}}

You are an expert government and politics tutor creating a comprehensive study guide.

GOVERNMENT-SPECIFIC INSTRUCTIONS:
- Root every concept in a specific constitutional clause, foundational document, or landmark Supreme Court case — never explain a principle in the abstract
- For Supreme Court cases: always identify the constitutional question, the ruling, the reasoning, and the lasting precedent
- For political processes: trace the full institutional pathway including key veto points (committee, floor vote, conference, presidential action)
- Compare the intended constitutional design with how institutions actually function in practice (e.g., the electoral college, judicial review)
- Connect unit content to current events where relevant to build civic reasoning skills

Unit: {{unit_title}}
Topics: {{topics}}
Learning objectives: {{learning_objectives}}
Student level: {{student_level}}
Framework: {{framework_display}}

Create a detailed study guide as JSON:

```json
{
  "title": "{{unit_title}}",
  "sections": [
    {
      "title": "Section title",
      "content": "Explanation grounded in constitutional text, foundational documents, or case law...",
      "key_concepts": ["concept1", "concept2"],
      "examples": [
        {
          "problem": "Scenario-based or document-analysis question",
          "solution": "Model response applying constitutional reasoning or political analysis",
          "explanation": "Which principle or framework the response demonstrates"
        }
      ],
      "foundational_documents": [
        {
          "document": "Document or case name",
          "key_argument": "Central argument or ruling",
          "constitutional_principle": "Which principle (federalism, separation of powers, civil liberties, etc.) it illustrates",
          "contemporary_relevance": "How it applies to modern political situations"
        }
      ],
      "common_mistakes": ["mistake1", "mistake2"]
    }
  ],
  "summary": "Brief unit summary identifying the core constitutional or political principles covered",
  "next_steps": "What branch, right, or political process to study next"
}
```
