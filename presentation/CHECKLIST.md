# Presentation Final Assembly Checklist

## Files Generated

| File | Status | Path |
|------|--------|------|
| PPTX Presentation | DONE | `presentation/MentorMind_Presentation.pptx` |
| Architecture Diagram | DONE | `presentation/diagrams/architecture.md` (Mermaid) |
| Manager-Critic Loop | DONE | `presentation/diagrams/manager_critic_loop.md` (Mermaid) |
| Process Flow Diagram | DONE | `presentation/diagrams/process_flow.md` (Mermaid) |
| Knowledge Graph PNG | DONE | `presentation/diagrams/knowledge_graph.png` |
| Demo Script | DONE | `presentation/demo_script.md` |
| Q&A Prep (15 items) | DONE | `presentation/qa_prep.md` |
| Slide Content Source | DONE | `presentation/slide_content.py` |
| PPTX Generator Script | DONE | `presentation/generate_pptx.py` |

---

## Before Presenting

### Slide Content
- [ ] Open `MentorMind_Presentation.pptx` in PowerPoint/Keynote
- [ ] Verify all 10 slides render correctly
- [ ] Trim speaker notes during rehearsal — total time estimate is 11m30s, need ~9-10 min for content + 3 min demo
- [ ] Adjust fonts/colors if your presentation template requires it

### Diagrams
- [ ] Render Mermaid diagrams using [Mermaid Live Editor](https://mermaid.live):
  - Copy contents of `diagrams/architecture.md` → paste → export as PNG/SVG
  - Copy contents of `diagrams/manager_critic_loop.md` → paste → export as PNG/SVG
  - Copy contents of `diagrams/process_flow.md` → paste → export as PNG/SVG
- [ ] Insert all 4 diagrams into slides 4, 5, 6, 7
- [ ] `knowledge_graph.png` is ready at `presentation/diagrams/knowledge_graph.png`

### Demo
- [ ] Review `demo_script.md`
- [ ] Pre-open browser tabs (see checklist in demo script)
- [ ] Have backup demo video recorded if live servers are unstable
- [ ] Test the demo flow on actual server at least once

### Q&A
- [ ] Review `qa_prep.md` — 15 questions with answers, evidence, and follow-ups
- [ ] Memorize key numbers from the Quick Reference table

### Time Budget
| Segment | Target |
|---------|--------|
| Slides (10) | ~9-10 min |
| Live Demo | ~3 min |
| Q&A | Remainder |
| **Total** | **15-20 min** |

---

## Suggested Cuts to Hit 10 Minutes

The total slide speaker notes add up to ~11m30s. To cut to 9-10 min:

1. Slide 3 (Solution Overview): trim speaker notes by ~15s — merge opening description
2. Slide 7 (Process-First Engine): trim by ~20s — 5 modes can be listed faster
3. Slide 8 (Challenges & Pivot): trim by ~15s — CJK font detail is secondary
4. Slide 5 (Multimodal + KG): trim by ~15s — technical port numbers are in diagram

**Target after cuts: ~10 min slides + ~3 min demo**

---

## Grading Rubric Alignment

| Criteria | How Slides Address It |
|----------|-----------------------|
| **Organization & Clarity** | 10-slide narrative arc: problem → solution → architecture → deep dives → results → future |
| **Content & Depth** | Real technical architecture, actual code modules referenced, specific metrics from codebase |
| **Visual Aids** | 4 diagrams (architecture flowchart, sequence diagram, process flow, knowledge graph) |
| **Delivery Readiness** | Full speaker notes per slide, demo script with fallback plan |
| **Q&A Preparation** | 15 questions across 4 categories with evidence and graceful-failure responses |
