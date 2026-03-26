# MentorMind Platform

## The "Poor Video Quality" Problem

Generating engaging, high-quality programmatic videos (using Manim + AI) is computationally and creatively difficult. Currently, the videos lack polish due to the following pipeline limitations:

### A. Visual Monotony (Layout Stagnation)

- **Symptom:** The AI heavily favors the `callout_card` or `two_column` layouts, essentially treating the video like a PowerPoint presentation rather than a dynamic chalkboard.
- **Root Cause:** The `storyboard_builder` prompt does not force the AI to utilize dynamic `<transform>` or `<draw_shape>` actions frequently enough. It defaults to safe static text.

### B. Math Rendering Failures (The "Red Error" Screens)

- **Symptom:** Scenes involving complex math fail to render internally, or output broken characters, causing the video pipeline to drop the scene entirely.
- **Root Cause:** The LLM occasionally generates raw LaTeX (like `\begin{align}`) which Manim's default `MathTex` environment struggles with unless explicitly formatted.

### C. Pacing vs Information Density

- **Symptom:** A screen might have 200 words of narration but only 5 words on screen, making the video feel visually "stuck."
- **Root Cause:** The duration mapping logic is purely mathematical (`total_words / 2.1`) and doesn't account for visual cognitive load. Texts drop onto the screen cumulatively rather than animating progressively (e.g., bullet-by-bullet).

### D. Color Theory and Aesthetics

- **Symptom:** Default Manim uses stark black backgrounds with plain white/blue text, looking very raw and unpolished compared to the surrounding web UI.
- **Root Cause:** We have no thematic design system injected into the `ManimService`.

### Video Polish & Aesthetics

1. **Thematic Upgrade:** Overhaul `ManimService` to use a beautiful, unified color palette (e.g., Catppuccin Macchiato `#1E1E2E`) and custom modern fonts.
2. **Generative Pacing:** Update the engine to automatically chain animations (e.g., `Write` -> `Wait` -> `FadeIn`) to make text feel alive as the voiceover talks.
3. **LaTeX Sanitizer Guardrail:** Build a robust regex-based sanitizer to gently strip unsupported environments from the LLM outputs before they hit the Manim compiler.

### Smart User Onboarding

- **The Issue:** The current generic multiple-choice onboarding survey limits the AI's ability to accurately gauge a student's level.
- **The Solution (Conversational Diagnostic):** Transform the onboarding into an interactive 3-turn diagnostic where the AI Mentor asks the student to solve a real, short problem. The AI then extracts their true baseline knowledge based on their actual performance, rather than just their self-reported answers.

### Growth & Analytics

- **The Issue:** Lesson Analytics and Pricing are currently completely unachieved.
- **The Solution:** Track platform value by monitoring video engagement (watch percentage) and quiz completion rates. Integrate Stripe for a tokenized or tiered subscription model to offset high compute inference costs.
