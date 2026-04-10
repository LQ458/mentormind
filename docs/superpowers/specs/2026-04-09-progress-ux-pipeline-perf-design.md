# Design: Progress UX & Pipeline Performance

**Date:** 2026-04-09  
**Status:** Approved  
**Scope:** Backend timeout fix, real progress tracking, parallel rendering, frontend UX

---

## Problem Summary

Two distinct issues identified from production logs:

1. **aiohttp read timeout** — `ClientTimeout(total=120)` kills large LLM responses (storyboard takes ~120s). Causes silent fallback to degraded storyboard, mismatched scene counts.
2. **Fake progress bar** — `progressValue += (99 - progressValue) * 0.02` asymptotes to 99% with zero connection to real backend state. User stuck at 98% for the final slow stages.

---

## Scope

Four coordinated changes:

1. **Fix aiohttp timeout** — split `total` into `connect` + `sock_read`
2. **Real progress tracking** — Celery emits milestones, SSE relays them, frontend renders real stages
3. **Parallel pipeline** — `_review_render_plan` concurrent with TTS; per-scene parallel Manim rendering
4. **Frontend error UX** — user-friendly failure state with stage name + Retry button

---

## 1. aiohttp Timeout Fix

**File:** `backend/services/api_client.py` line 228

**Change:**
```python
# Before
timeout=aiohttp.ClientTimeout(total=120)

# After
timeout=aiohttp.ClientTimeout(
    total=None,    # no global cap — let sock_read control it
    connect=10,    # fail fast if server unreachable
    sock_read=300  # 5 min to read large completions (storyboard can be slow)
)
```

**Why:** `total` covers the entire lifecycle including response body read. For large LLM completions, the server connects quickly but the body takes time to stream. Separating concerns lets us fail fast on connection issues while allowing slow responses to complete.

---

## 2. Real Progress Tracking

### 2a. Backend — Celery milestone events

**File:** `backend/celery_app.py` — inside `create_class_video` task

Add `self.update_state` calls at 5 pipeline milestones:

| Stage | Percent | Trigger point |
|-------|---------|---------------|
| `syllabus_complete` | 20% | After syllabus succeeds |
| `script_complete` | 45% | After render_plan generation finishes |
| `audio_complete` | 60% | After all TTS synthesis finishes |
| `render_complete` | 90% | After all Manim renders finish |
| `done` | 100% | Task success (existing) |

```python
self.update_state(state='PROGRESS', meta={
    'stage': 'syllabus_complete',
    'percent': 20,
    'label': 'Syllabus ready'
})
```

### 2b. Backend — SSE relay

**File:** `backend/server.py` — `stream_job_status` (`/job-stream/{job_id}`)

Currently only relays `pending → success/failure`. Add relay for `PROGRESS` state:

```python
if status == "progress":
    meta = task_result.info or {}
    data["stage"] = meta.get("stage", "")
    data["percent"] = meta.get("percent", 0)
    data["label"] = meta.get("label", "")
    yield f"data: {json.dumps(data)}\n\n"
```

### 2c. Frontend — real stage rendering

**File:** `web/app/create/page.tsx`

Replace the simulated `useEffect` (lines 631–672) with SSE-driven state:

- Subscribe to `/api/backend/job-stream/{jobId}` on start
- On each `PROGRESS` event: update `pipelineProgress` with real `stage`, `percent`, `label`
- Keep simulation as fallback for gaps between milestones
- Show elapsed timer (increment every second via `setInterval`)
- Show "Est. remaining" based on average known durations per stage
- On `failed` event: show error state (see §4)

**Stage pipeline UI** (5 nodes):
```
Syllabus → Script → Audio → Render → Done
```
Each node: pending (grey) → active (blue pulse) → done (green ✓) → failed (red ✗)

**Elapsed timer:** `⏱ Running for 3m 12s` — simple `Date.now()` diff from job start.

**Estimated remaining:** Pre-configured average durations per stage:
```ts
const STAGE_DURATIONS = {
  syllabus: 30,      // seconds
  script: 150,
  audio: 5,
  render: 30,
  total: 215
}
```

---

## 3. Parallel Pipeline

### 3a. `_review_render_plan` concurrent with TTS

**File:** `backend/core/modules/robust_video_generation.py`

Currently sequential:
```python
review = await self._review_render_plan(...)
# then TTS starts
```

Change to run concurrently:
```python
review, audio_result = await asyncio.gather(
    self._review_render_plan(topic, style, repaired_render_plan),
    self._generate_audio(script)  # actual method name in robust_video_generation.py
)
```

Review result is used for quality metadata only — it does not block TTS or rendering.

### 3b. Per-scene parallel Manim rendering

**File:** `backend/core/rendering/manim_renderer.py`

**Current:** One combined Manim script file with all scenes → one `subprocess.run` → one `.mp4`.

**New:** Split script into per-scene Manim files, render all concurrently, concatenate with ffmpeg.

```python
async def render_script(self, script) -> str:
    # Generate one Python file per scene
    scene_paths = [self._write_scene_file(scene, i) for i, scene in enumerate(script.scenes)]
    
    # Render all scenes concurrently
    video_paths = await asyncio.gather(*[
        self._render_single_scene(path, attempt=1) for path in scene_paths
    ])
    
    # Concatenate with ffmpeg
    return await self._concat_videos(video_paths, script.title)
```

**Concurrency limit:** Cap at 4 concurrent Manim subprocesses to avoid CPU saturation:
```python
semaphore = asyncio.Semaphore(4)
async def _render_single_scene(self, path, ...):
    async with semaphore:
        return await asyncio.to_thread(subprocess.run, ...)
```

**ffmpeg concatenation:**
```python
async def _concat_videos(self, paths: list[str], title: str) -> str:
    # Write ffmpeg concat list file
    # Run: ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4
    ...
```

**Fallback:** If any scene render fails after 3 retries, skip that scene and continue (log warning). Do not fail the entire job over one scene.

---

## 4. Frontend Error State

**File:** `web/app/create/page.tsx`

On `failed` SSE event (or polling timeout):

- Replace progress bar with error panel
- Show: stage name where failure occurred (from `meta.stage` if available, else generic)
- Message: "Something went wrong during **[Stage Name]**. This stage failed. Please try again."
- No technical details (no API names, no error messages, no job IDs)
- Two buttons: **Try Again** (re-submits same topic) + **Cancel** (back to form)

**Try Again behavior:** Re-calls `handleGenerate(topic)` with same topic. The backend already caches the `syllabus` in Redis so retries skip the first stage automatically.

---

## Data Flow Summary

```
User submits topic
    ↓
Celery task starts
    ↓
update_state(PROGRESS, syllabus_complete, 20%)  ──→  SSE event  ──→  Frontend stage 1 ✓
    ↓
update_state(PROGRESS, script_complete, 45%)    ──→  SSE event  ──→  Frontend stage 2 ✓
    ↓
[TTS + review_render_plan run in parallel]
update_state(PROGRESS, audio_complete, 60%)     ──→  SSE event  ──→  Frontend stage 3 ✓
    ↓
[18 Manim scenes render concurrently → ffmpeg concat]
update_state(PROGRESS, render_complete, 90%)    ──→  SSE event  ──→  Frontend stage 4 ✓
    ↓
Redis: job_result:{id} = payload
SSE: {status: completed}                        ──→  Frontend stage 5 ✓ → redirect
```

---

## Error Handling

| Failure point | Current behavior | New behavior |
|---------------|-----------------|--------------|
| storyboard timeout | Silent fallback to degraded storyboard | Timeout extended; if still fails, task raises exception with `stage='script'` in Celery meta before re-raising — SSE failure event includes `stage` field |
| Manim scene fails | Entire job fails | Skip scene, continue; log warning |
| SSE disconnects | Frontend hangs | Falls back to polling `/job-status/{id}` every 3s |
| Task failure | Generic "Job failed" | Stage-specific error from `meta.stage` |

---

## Files Changed

| File | Change |
|------|--------|
| `backend/services/api_client.py` | Fix `ClientTimeout` |
| `backend/celery_app.py` | Add 4 `update_state(PROGRESS)` calls |
| `backend/server.py` | Relay `PROGRESS` state in SSE stream |
| `backend/core/modules/robust_video_generation.py` | Parallelize review + TTS with `asyncio.gather` |
| `backend/core/rendering/manim_renderer.py` | Per-scene parallel render + ffmpeg concat |
| `web/app/create/page.tsx` | SSE-driven progress, stage pipeline UI, error state |
| `backend/core/rendering/manim_renderer.py` | Fix inline bullet detection, word-wrap, truncation, text centering |

---

---

## 5. Manim Text Truncation Fixes

**File:** `backend/core/rendering/manim_renderer.py`

Four bugs causing the `"- Builds on basic algebra - Uses function understanding -..."` truncation seen in video output:

### Bug 1 — Inline bullet detection
`_extract_bullets` only splits on `\n`. Content arriving as `"- item1 - item2 - item3"` (inline) falls through to hard truncation.

**Fix:** Add inline ` - ` split fallback in `_extract_bullets`:
```python
# After newline split fails, try inline separator
if len(bullets) < 2:
    inline = re.split(r'\s+-\s+', text.strip().lstrip('- '))
    if len(inline) >= 2:
        bullets = [b.strip() for b in inline if b.strip()]
```

### Bug 2 — Hard truncation at 72 chars
`_compact_for_code` and `_extract_bullets` both truncate at `max_chars=72`. Use word-boundary truncation at 150 chars instead:
```python
def _compact_for_code(self, text: str, max_chars: int = 150) -> str:
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(clean) > max_chars:
        # Truncate at word boundary
        truncated = clean[:max_chars].rsplit(' ', 1)[0]
        clean = truncated + '...'
    return clean.replace('"""', "'\"\"")
```
Also change `show_text` default from `max_chars=72` → `max_chars=150`.

### Bug 3 — Character-splitting `wrap_text`
Current: `text[i:i+width]` splits mid-word. Replace with Python's `textwrap`:
```python
"    def wrap_text(self, text, width=40):",
"        import textwrap",
"        return textwrap.fill(str(text), width=width)",
```

### Bug 4 — Text not explicitly centered
Add `.move_to(ORIGIN)` after `Text(...)` creation in `show_text` path:
```python
code.append(f"        text.move_to(ORIGIN)")
```

---

## Out of Scope

- Streaming LLM responses (deferred — needs prompt refactor)
- Per-chapter parallel LLM generation (deferred — chain dependency can't be broken yet)
- Manim render quality settings (no change)
- Auth or database changes
