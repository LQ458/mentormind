# MentorMind: Syllabus-Driven Visual Logic Specification

## 1. The Hierarchical Course Blueprint

Before any code is written, the** **`agentic.py` module must generate a structured** ** **Course Syllabus (课程大纲)** . This blueprint acts as the mandatory roadmap for both the** **`VideoScriptGenerator` and the** **`ManimRenderer`.

### Syllabus Structure Requirements

* **Course Metadata:** Title, Target Audience Level, and "The One Big Idea" (the core takeaway).
* **Chapter Breakdown:** Each lesson must be divided into 3 to 5 logical chapters.
* **Scene Mapping:** Every chapter must contain specific scenes with a "Visual Intent" tag such as** **`DERIVATION`,** **`GEOMETRIC_INTUITION`, or** **`ANALOGY`.
* **Key Mathematical Anchors:** A list of LaTeX formulas that MUST appear on screen to ensure technical accuracy.

---

## 2. Visual Identity and Style Guide

To ensure consistency, the Manim code generation must be constrained by a global** ** **Style Configuration** . This prevents the AI from using mismatched colors or overlapping text.

### Brand Color Palette

The AI must strictly use the following hex codes for all Manim objects:

* **Primary Action (Blue):** `#58C4DD` (Main focus objects)
* **Theory/Logic (Yellow):** `#F9D71C` (Formulas and definitions)
* **Success/Growth (Green):** `#83C167` (Correct answers or completed steps)
* **Warning/Error (Red):** `#CF5044` (Counter-examples or pitfalls)
* **Background:** `#1A1A1A` (Strict dark mode for high contrast)

### Global Typography and Layout

* **Font Constraints:** Use** **`Text` for general descriptions and** **`MathTex` for all variables and formulas.
* **The Safe Zone:** All animations must be confined within a** **`0.8` scale of the camera frame to avoid UI clipping on mobile devices.
* **Animation Pacing:** Standard** **`run_time` for introductory movements should be** **`1.5` seconds while complex derivations should be slowed to** **`2.5` seconds.

---

## 3. Manim Generation Logic (The "Director" Prompt)

The** **`manim_renderer.py` must be updated to ingest the Syllabus before writing code. The system prompt for the LLM should be modified as follows.

### The "Director" Instruction

"You are a professional educational animator. You will receive a Course Syllabus. Your task is to translate this Syllabus into a single Manim** **`Scene` class. You must follow these rules:

* Initialize a** **`BrandConfig` class at the top of the file containing the MentorMind color palette.
* Use** **`ReplacementTransform` when moving from a theoretical formula to a geometric representation to maintain visual continuity.
* Every chapter transition must include a clear** **`Title` screen that matches the Syllabus chapter name.
* Include comments in the code that link each block of animation back to the specific Scene ID in the Syllabus."

---

## 4. Format-Specific "Flavor" Tags

The Syllabus should include a** **`VisualFlavor` parameter that tells Manim how to behave based on the subject.

* **The "Rigorous" Flavor (Math/CS):** Focuses on step-by-step LaTeX transformations and coordinate system graphing.
* **The "Conceptual" Flavor (Physics/Engineering):** Focuses on 3D vectors, force diagrams, and physical simulations.
* **The "Discovery" Flavor (General Science):** Uses more labels, arrows, and zooming into specific parts of an object to highlight details.

---

## 5. Implementation Action Items for the AI IDE

* **Step 1:** Update the** **`ClassCreationRequest` schema to include a** **`style_profile` (e.g., "Modern Dark", "Academic Classic").
* **Step 2:** Modify** **`core/modules/agentic.py` to produce the Syllabus JSON object as the first step of the pipeline.
* **Step 3:** Inject the** **`BrandConfig` constants into the prompt for** **`core/rendering/manim_renderer.py` so the LLM doesn't have to "guess" which colors to use.
* **Step 4:** Add a validation step that checks if the generated Manim code actually uses the colors and chapters defined in the Syllabus.
