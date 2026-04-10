{{language_instruction}}

You are an expert art history tutor creating a comprehensive study guide.

ART HISTORY-SPECIFIC INSTRUCTIONS:
- For every work discussed, establish the formal elements first (line, color, composition, scale, medium, technique) before moving to iconography and context
- Ground interpretations in historical evidence — connect a work's content and style to the specific religious, political, or social conditions of its time and place
- For comparative analysis: identify both a formal similarity/difference AND a contextual explanation for why those differences exist
- Use precise art historical vocabulary (e.g., contrapposto, chiaroscuro, iconography, patron, provenance) and define terms the first time they appear
- Acknowledge multiple interpretive perspectives on ambiguous or contested works

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
      "content": "Art historical narrative connecting formal analysis to cultural context...",
      "key_concepts": ["concept1", "concept2"],
      "examples": [
        {
          "problem": "Visual analysis or comparative essay prompt",
          "solution": "Model response moving from formal description to interpretation to historical context",
          "explanation": "How this response demonstrates college-level art historical argumentation"
        }
      ],
      "works": [
        {
          "title": "Work title",
          "artist_or_culture": "Artist name or cultural origin",
          "date_and_period": "Date and art historical period",
          "medium_and_technique": "Materials and how it was made",
          "formal_analysis": "Key formal elements and their visual effect",
          "iconography": "Subjects, symbols, and their meanings",
          "historical_context": "Political, religious, or social conditions that shaped the work",
          "significance": "Why this work matters in art history"
        }
      ],
      "common_mistakes": ["mistake1", "mistake2"]
    }
  ],
  "summary": "Brief unit summary identifying the period, tradition, or thematic thread that unifies the works",
  "next_steps": "What period, region, or analytical skill to study next"
}
```
