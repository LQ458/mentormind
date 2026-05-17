# MentorMind Live Demo Script

## Pre-Demo Checklist (5 min before)

- [ ] Server running: `docker-compose up` or backend accessible at `localhost:8000`
- [ ] Frontend running: `npm run dev` in `web/` → `localhost:3000`
- [ ] Logged in via Clerk (create test account if needed)
- [ ] Browser tabs pre-opened:
  - Tab 1: `/study-plan` (fresh page)
  - Tab 2: `/knowledge-graph` (loaded in background)
  - Tab 3: `/analytics` (loaded in background)
- [ ] Have a screenshot image ready in downloads (e.g. "math_problem.png")
- [ ] Network tab open in DevTools to show API calls
- [ ] **Backup**: Pre-recorded demo video ready to play if live fails

---

## Demo Walkthrough (~3 minutes)

### Step 1: Study Plan Creation (60s)

**Page:** `/study-plan`

**Actions:**
1. Show the page — it loads with a chat interface
2. In the chat input, type: "I'm preparing for my Gaokao math exam. I struggle with quadratic functions and chemistry stoichiometry."
3. Press Enter / Send
4. **Expected:** The diagnostic agent responds with follow-up questions:
   - "What textbook are you using?"
   - "How many hours per week can you study?"
   - "Have you covered 因式分解 (factorization) yet?"
5. Answer 2-3 questions to complete the diagnostic phase
6. **Expected:** System shows "Generating your study plan..." with a spinner
7. After generation: a structured plan appears with units, topics, estimated hours

**Talking points while it loads:**
> "The diagnostic agent asks up to 6 targeted questions. Notice it's not a survey — it adapts based on previous answers, using Bayesian confidence analysis to decide when it has enough information to generate a plan."

**If generation is slow (>10s):**
> "In production, plan generation happens asynchronously via Celery. You can navigate away and come back — the plan will be ready."

---

### Step 2: Knowledge Graph (45s)

**Page:** `/knowledge-graph`

**Actions:**
1. Navigate to `/knowledge-graph`
2. **Expected:** D3.js force-directed graph loads with colored nodes
3. Point out:
   - Green nodes = mastered concepts
   - Yellow nodes = learning
   - Red nodes = struggling (these are the priority)
4. Hover over a node to show tooltip with concept details
5. Drag a node to show the graph is interactive

**Talking points:**
> "This is the student's personal knowledge graph, built incrementally from every lesson they complete. The AI extracts concepts and their relationships — prerequisites, containment, related topics — and stores them in PostgreSQL. Red nodes here are what the study planner prioritizes."

---

### Step 3: Study Plan Detail (45s)

**Page:** `/study-plan/[id]`

**Actions:**
1. Navigate to the plan detail page
2. Show the unit list with progress indicators
3. Click on a unit to expand its content:
   - Study guide (markdown with KaTeX math)
   - Quiz (multiple choice questions)
   - Flashcards (spaced repetition cards)
   - Formula sheet
4. Show the "Start Board Lesson" button

**Talking points:**
> "Each unit has five types of generated content. The quiz scores feed into our adaptive difficulty system — a sliding window of the last three scores auto-adjusts the next unit's difficulty. The content is generated asynchronously by Celery workers using the manager-critic loop we discussed."

---

### Step 4: Board Lesson (Demo or Screenshot) (30s)

**Page:** `/board/[sessionId]`

**If live WebSocket works:**
1. Click "Start Board Lesson" on a unit
2. Show the streaming board with TTS audio
3. Point out real-time tool calling (researcher, coder agents)

**If WebSocket is unavailable — show a screenshot:**
> "The board lesson uses WebSocket streaming with MCP-style tool calling. An AI lecturer writes on the board while speaking via TTS, and subagents — researcher, coder — provide on-demand explanations."

---

### If Anything Fails — Switch to Backup Plan

1. Open the pre-recorded demo video (2-3 min)
2. Narrate over it: "Let me show you a recorded walkthrough..."
3. The video should cover all 4 steps above

---

## Post-Demo: Analytics Dashboard (Bonus)

**Page:** `/analytics`

Quickly show:
- Telemetry events dashboard
- Proficiency rollups per subject
- Spaced repetition review queue
- Notifications panel

> "Everything the student does feeds into our analytics system. Daily proficiency rollups track improvement per subject, and the spaced repetition scheduler generates proactive notifications when review is due."

---

## Timing Summary

| Step | Time | Cumulative |
|------|------|------------|
| Plan creation | 60s | 1:00 |
| Knowledge graph | 45s | 1:45 |
| Plan detail | 45s | 2:30 |
| Board lesson | 30s | 3:00 |
| **Total demo** | **3:00** | — |
