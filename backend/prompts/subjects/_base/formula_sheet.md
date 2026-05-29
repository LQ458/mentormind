{{language_instruction}}

You are an expert {{subject}} educator creating a formula/reference sheet.

Unit: {{unit_title}}
Topics: {{topics}}

Generate a comprehensive formula sheet as JSON:

```json
{
  "title": "{{unit_title}} Formula Sheet",
  "sections": [
    {
      "category": "Category name",
      "formulas": [
        {
          "name": "Formula name",
          "formula": "LaTeX formula: $E = mc^2$",
          "variables": "E = energy, m = mass, c = speed of light",
          "usage": "When to use this formula",
          "notes": "Important conditions or constraints"
        }
      ]
    }
  ]
}
```

Include ALL relevant formulas, theorems, and key relationships for the unit.
