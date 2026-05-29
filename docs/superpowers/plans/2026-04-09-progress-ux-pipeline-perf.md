# Progress UX & Pipeline Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix aiohttp timeout, add real Celery progress milestones, parallelize pipeline stages, fix Manim text truncation, and replace the fake frontend progress bar with real SSE-driven stage tracking.

**Architecture:** Celery task emits `update_state(PROGRESS)` at 5 pipeline milestones; FastAPI SSE relay forwards them; frontend subscribes and renders a 5-node stage pipeline with elapsed timer. Manim rendering is parallelized per-scene via `asyncio.gather` + ffmpeg concat. Text truncation is fixed in 4 places in the renderer.

**Tech Stack:** Python/FastAPI/Celery/aiohttp, TypeScript/Next.js/React, asyncio, ffmpeg

---

## Task 1: Fix aiohttp ClientTimeout

**Files:**
- Modify: `backend/services/api_client.py:228`

- [ ] **Step 1: Make the change**

In `backend/services/api_client.py` at line 228, change:
```python
timeout=aiohttp.ClientTimeout(total=120) # Reduced to 2 mins for faster failure detection
```
to:
```python
timeout=aiohttp.ClientTimeout(
    total=None,    # no global cap — sock_read controls it
    connect=10,    # fail fast if server unreachable
    sock_read=300  # 5 min to read large LLM completions (storyboard ~120s)
)
```

- [ ] **Step 2: Verify no other places use total=120**

Run:
```bash
grep -n "ClientTimeout" backend/services/api_client.py
```
Expected: only one `ClientTimeout` call, now using `total=None, connect=10, sock_read=300`.

- [ ] **Step 3: Commit**

```bash
git add backend/services/api_client.py
git commit -m "fix: extend aiohttp sock_read to 300s; remove 2-min total cap that killed large LLM responses"
```

---

## Task 2: Fix Manim Text Truncation (4 bugs)

**Files:**
- Modify: `backend/core/rendering/manim_renderer.py`

### Bug 1: Inline bullet detection in `_extract_bullets`

- [ ] **Step 1: Fix `_extract_bullets` to handle inline ` - ` bullets**

Find `_extract_bullets` (around line 414). After the existing `if len(bullets) >= 2: return bullets` check fails, add inline split fallback. The full method should be:

```python
def _extract_bullets(self, text: str, max_chars: int) -> List[str]:
    """
    Parse a bullet-list string into individual items.
    Recognises lines starting with -, •, *, or numbered (1.).
    Also handles inline ' - ' separated bullets.
    Returns the list only if there are 2+ bullets; otherwise returns [text].
    """
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    bullets = []
    bullet_re = re.compile(r'^[-•*]\s+|^\d+[.)]\s+')
    for line in lines:
        if bullet_re.match(line):
            cleaned = bullet_re.sub("", line).strip()
            if len(cleaned) > max_chars:
                truncated = cleaned[:max_chars].rsplit(' ', 1)[0]
                cleaned = truncated + '...'
            bullets.append(cleaned)
    if len(bullets) >= 2:
        return bullets
    # Fallback: try inline ' - ' separator
    inline = re.split(r'\s+-\s+', text.strip().lstrip('- '))
    if len(inline) >= 2:
        result = []
        for b in inline:
            b = b.strip()
            if not b:
                continue
            if len(b) > max_chars:
                b = b[:max_chars].rsplit(' ', 1)[0] + '...'
            result.append(b)
        if len(result) >= 2:
            return result
    return [self._compact_for_code(text, max_chars)]
```

### Bug 2: Hard char-truncation in `_compact_for_code`

- [ ] **Step 2: Fix `_compact_for_code` to use word-boundary truncation at 150 chars**

Find `_compact_for_code` (around line 434). Replace with:

```python
def _compact_for_code(self, text: str, max_chars: int = 150) -> str:
    """Compact text and escape triple-quote issues for safe embedding in code."""
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(clean) > max_chars:
        truncated = clean[:max_chars].rsplit(' ', 1)[0]
        clean = truncated + '...'
    # Escape triple quotes that would break the generated f-string
    clean = clean.replace('"""', "'\"\"")
    return clean
```

Also find every call site that passes `max_chars=72` and update to `max_chars=150`:
```bash
grep -n "max_chars" backend/core/rendering/manim_renderer.py
```
For any call to `_compact_for_code(text, 72)` or `_extract_bullets(text, 72)`, change `72` → `150`.

### Bug 3: Character-splitting `wrap_text` in generated code

- [ ] **Step 3: Fix the `wrap_text` method embedded in generated Manim code (line ~212)**

Find line 212 in `manim_renderer.py` inside the `_generate_header` or header lines list:
```python
"    def wrap_text(self, text, width=40):",
"        return '\\n'.join([text[i:i+width] for i in range(0, len(text), width)])",
```

Replace those two lines with:
```python
"    def wrap_text(self, text, width=40):",
"        import textwrap",
"        return textwrap.fill(str(text), width=width)",
```

### Bug 4: Text not explicitly centered

- [ ] **Step 4: Add `.move_to(ORIGIN)` after Text creation in `show_text` generated code**

Search for where `show_text` action builds the `Text(...)` mobject in the generated code. Find the block that appends something like:
```python
code.append(f'        text = Text("{param}", ...')
```

Add one line immediately after:
```python
code.append(f'        text.move_to(ORIGIN)')
```

Run:
```bash
grep -n "move_to\|show_text\|Text(" backend/core/rendering/manim_renderer.py | head -40
```
to find the exact location, then insert the line.

- [ ] **Step 5: Run existing manim renderer tests**

```bash
cd backend && python -m pytest tests/unit/ -k "manim" -v 2>&1 | head -60
```
Expected: any existing tests pass (or no tests found is also acceptable here).

- [ ] **Step 6: Commit**

```bash
git add backend/core/rendering/manim_renderer.py
git commit -m "fix: Manim text truncation — inline bullets, word-wrap at 150, textwrap.fill, center text"
```

---

## Task 3: Add Celery Progress Milestones

**Files:**
- Modify: `backend/core/create_classes.py` (add progress_callback parameter)
- Modify: `backend/celery_app.py` (pass callback, call update_state)

### Step A: Add progress_callback to ClassCreator

- [ ] **Step 1: Find the create_class_english and create_class_chinese signatures**

```bash
grep -n "async def create_class_english\|async def create_class_chinese\|def create_class" backend/core/create_classes.py | head -10
```

- [ ] **Step 2: Add progress_callback parameter to both methods**

Add `progress_callback=None` to both method signatures. Example for `create_class_english`:
```python
async def create_class_english(self, request: ClassCreationRequest, progress_callback=None) -> ClassCreationResult:
```

Then, at these milestone points inside the method body, add callback calls:

After syllabus/outline generation completes:
```python
if progress_callback:
    progress_callback('syllabus_complete', 20, 'Syllabus ready')
```

After render_plan/script generation completes:
```python
if progress_callback:
    progress_callback('script_complete', 45, 'Script ready')
```

After TTS/audio generation completes:
```python
if progress_callback:
    progress_callback('audio_complete', 60, 'Audio ready')
```

After Manim rendering completes:
```python
if progress_callback:
    progress_callback('render_complete', 90, 'Rendering complete')
```

Apply the same pattern to `create_class_chinese`.

To find the right insertion points, run:
```bash
grep -n "syllabus\|render_plan\|audio\|tts\|manim\|render" backend/core/create_classes.py | grep -i "await\|result\|complete\|done" | head -30
```

- [ ] **Step 3: Wire progress_callback in celery_app.py**

In `backend/celery_app.py` inside `create_class_video_task`, update `_run_pipeline()` to pass the callback:

```python
async def _run_pipeline():
    creator = ClassCreator()
    
    def _progress(stage: str, percent: int, label: str):
        # Called from async context — update_state is thread-safe
        self.update_state(state='PROGRESS', meta={
            'stage': stage,
            'percent': percent,
            'label': label,
        })
        print(f"[{job_id}] PROGRESS {percent}% — {stage}: {label}")
    
    language = request_data.get("language", "zh")
    class_request = ClassCreationRequest(
        # ... existing fields unchanged ...
        topic=request_data.get("topic", ""),
        language=Language(language) if language in ["en", "zh", "ja", "ko"] else Language.CHINESE,
        student_level=request_data.get("student_level", "beginner"),
        duration_minutes=request_data.get("duration_minutes", 30),
        include_video=request_data.get("include_video", True),
        include_exercises=request_data.get("include_exercises", True),
        include_assessment=request_data.get("include_assessment", True),
        custom_requirements=request_data.get("custom_requirements"),
        target_audience=request_data.get("target_audience", "students"),
        difficulty_level=request_data.get("difficulty_level", "intermediate"),
        voice_id=request_data.get("voice_id", "anna"),
        user_id=request_data.get("user_id"),
        syllabus=request_data.get("syllabus"),
    )
    
    if language == "en":
        result = await creator.create_class_english(class_request, progress_callback=_progress)
    else:
        result = await creator.create_class_chinese(class_request, progress_callback=_progress)
        
    return result
```

- [ ] **Step 4: Verify update_state import is available**

`self.update_state` is available on any `bind=True` Celery task — no import needed. Verify the decorator:
```bash
grep -n "bind=True\|@celery_app.task" backend/celery_app.py | head -5
```
Expected: `@celery_app.task(bind=True, name="mentormind.create_class_video")`

- [ ] **Step 5: Commit**

```bash
git add backend/core/create_classes.py backend/celery_app.py
git commit -m "feat: emit Celery PROGRESS milestones at syllabus/script/audio/render stages"
```

---

## Task 4: Relay PROGRESS State in SSE Stream

**Files:**
- Modify: `backend/server.py` (stream_job_status, ~line 2072)

- [ ] **Step 1: Add PROGRESS relay to stream_job_status**

In `backend/server.py`, find the `stream_job_status` function (line 2048). Find the block:
```python
if status != last_status:
    data = {"status": status, "job_id": job_id}
    if status == "failure":
```

Add handling for `"progress"` status **before** the `if status != last_status` block, after reading `task_result`:

```python
task_result = AsyncResult(job_id, app=celery_app)
status = task_result.status.lower()

# Relay PROGRESS milestones immediately (even if same overall status)
if status == "progress":
    meta = task_result.info or {}
    data = {
        "status": "progress",
        "job_id": job_id,
        "stage": meta.get("stage", ""),
        "percent": meta.get("percent", 0),
        "label": meta.get("label", ""),
    }
    yield f"data: {json.dumps(data)}\n\n"
    await asyncio.sleep(2)
    continue
```

The full updated loop body should look like:

```python
while True:
    # First check if result is already in Redis
    result_json = _redis_client.get(f"job_result:{job_id}")
    if result_json:
        try:
            result_payload = json.loads(result_json)
        except Exception:
            result_payload = {"raw_result": result_json}
        yield ": keepalive\n\n"
        await asyncio.sleep(0.05)
        yield f"data: {json.dumps({'status': 'completed', 'job_id': job_id, 'result': result_payload})}\n\n"
        break
        
    task_result = AsyncResult(job_id, app=celery_app)
    status = task_result.status.lower()
    
    # Relay PROGRESS milestones immediately
    if status == "progress":
        meta = task_result.info or {}
        data = {
            "status": "progress",
            "job_id": job_id,
            "stage": meta.get("stage", ""),
            "percent": meta.get("percent", 0),
            "label": meta.get("label", ""),
        }
        yield f"data: {json.dumps(data)}\n\n"
        await asyncio.sleep(2)
        continue
    
    if status != last_status:
        data = {"status": status, "job_id": job_id}
        if status == "failure":
            data["error"] = str(task_result.result)
            # Include stage from meta if available
            meta = task_result.info or {}
            if isinstance(meta, dict) and meta.get("stage"):
                data["stage"] = meta["stage"]
            yield f"data: {json.dumps(data)}\n\n"
            break
        if status == "success":
            data["status"] = "completed"
            data["result"] = task_result.result
            yield f"data: {json.dumps(data)}\n\n"
            break
        yield f"data: {json.dumps(data)}\n\n"
        last_status = status
    else:
        keepalive_tick += 1
        if keepalive_tick >= 3:
            yield ": keepalive\n\n"
            keepalive_tick = 0
        
    if status in ["failure", "revoked"]:
        break
        
    await asyncio.sleep(2)
```

- [ ] **Step 2: Commit**

```bash
git add backend/server.py
git commit -m "feat: relay Celery PROGRESS state in SSE stream with stage/percent/label"
```

---

## Task 5: Parallelize _review_render_plan + TTS

**Files:**
- Modify: `backend/core/modules/robust_video_generation.py`

- [ ] **Step 1: Find where _review_render_plan is called**

```bash
grep -n "_review_render_plan\|_generate_audio\|generate_audio\|tts\|synthesize" backend/core/modules/robust_video_generation.py | head -20
```

- [ ] **Step 2: Find the actual audio generation method name**

```bash
grep -n "async def _generate\|async def generate\|async def synthesize\|async def _tts\|tts" backend/core/modules/robust_video_generation.py | head -20
```

- [ ] **Step 3: Parallelize the two calls**

Find the sequential calls that look like:
```python
review = await self._review_render_plan(topic, style, repaired_render_plan)
# ... then later ...
audio_result = await self._generate_audio(...)  # or whatever the method is
```

Replace with `asyncio.gather`:
```python
import asyncio  # already imported at top of file

review, audio_result = await asyncio.gather(
    self._review_render_plan(topic, style, repaired_render_plan),
    self._generate_audio(script)   # use actual method name found in step 2
)
```

If the audio method takes different args, preserve the exact signature. The key is that `_review_render_plan` result is used for quality metadata only — it does not gate TTS.

- [ ] **Step 4: Verify no data dependency**

Confirm that the `review` dict is only used for logging/metadata, not to modify the script before TTS. Check:
```bash
grep -n "review\[" backend/core/modules/robust_video_generation.py | head -20
```
If `review` patches the render_plan before TTS, the parallelization cannot be applied here. In that case, skip this task and add a comment: `# NOTE: review gates script; parallelization deferred`.

- [ ] **Step 5: Commit**

```bash
git add backend/core/modules/robust_video_generation.py
git commit -m "perf: run _review_render_plan concurrently with TTS via asyncio.gather"
```

---

## Task 6: Per-Scene Parallel Manim Rendering + ffmpeg Concat

**Files:**
- Modify: `backend/core/rendering/manim_renderer.py`

This task restructures `render_script` to split the monolithic script into per-scene files, render concurrently, and concatenate with ffmpeg.

- [ ] **Step 1: Add asyncio and semaphore imports at top of file**

Check existing imports:
```bash
head -20 backend/core/rendering/manim_renderer.py
```
Ensure `asyncio` is imported. Add if missing:
```python
import asyncio
```

- [ ] **Step 2: Add `_write_scene_file` method to ManimService**

Add after `__init__`:

```python
def _write_scene_file(self, scene_code: str, index: int, timestamp: str) -> str:
    """Write a single scene's Manim code to a temp file. Returns file path."""
    scene_path = os.path.join(self.output_dir, f"scene_{timestamp}_{index}.py")
    with open(scene_path, 'w') as f:
        f.write(scene_code)
    return scene_path
```

- [ ] **Step 3: Add `_render_single_scene` method**

```python
_render_semaphore = asyncio.Semaphore(4)  # class-level; cap concurrent Manim subprocesses

async def _render_single_scene(self, script_path: str, index: int) -> Optional[str]:
    """Render one scene file. Returns video path or None on failure."""
    uv_manim = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "../../.venv/bin/manim"
    )
    if not os.path.exists(uv_manim):
        uv_manim = "manim"
    
    scene_name = f"LessonScene{index}"
    cmd = [
        uv_manim,
        f"-q{self.render_quality}",
        "--media_dir", self.output_dir,
        script_path,
        scene_name,
    ]
    
    for attempt in range(1, 4):
        async with self._render_semaphore:
            try:
                result = await asyncio.to_thread(
                    subprocess.run,
                    cmd,
                    check=True,
                    capture_output=True,
                    text=True,
                    env={**os.environ, "PATH": os.environ["PATH"]},
                    timeout=self.render_timeout_seconds,
                )
                # Find output video
                stem = Path(script_path).stem
                video_root = Path(self.output_dir) / "videos" / stem
                matches = sorted(video_root.rglob(f"{scene_name}.mp4"))
                if matches:
                    return str(matches[0])
                logger.warning(f"Scene {index} rendered but no mp4 found")
                return None
            except subprocess.CalledProcessError as e:
                logger.warning(f"Scene {index} attempt {attempt} failed: {e.stderr[:200]}")
                if attempt == 3:
                    logger.error(f"Scene {index} failed after 3 attempts — skipping")
                    return None
            except Exception as e:
                logger.error(f"Scene {index} unexpected error: {e}")
                return None
    return None
```

- [ ] **Step 4: Add `_concat_videos` method**

```python
async def _concat_videos(self, video_paths: list, title: str) -> str:
    """Concatenate scene videos with ffmpeg. Returns output path."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    concat_list_path = os.path.join(self.output_dir, f"concat_{timestamp}.txt")
    output_path = os.path.join(self.output_dir, f"lesson_{timestamp}.mp4")
    
    valid_paths = [p for p in video_paths if p and os.path.exists(p)]
    if not valid_paths:
        raise RuntimeError("No valid scene videos to concatenate")
    
    with open(concat_list_path, 'w') as f:
        for path in valid_paths:
            f.write(f"file '{path}'\n")
    
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_list_path,
        "-c", "copy",
        output_path,
    ]
    
    await asyncio.to_thread(
        subprocess.run,
        cmd,
        check=True,
        capture_output=True,
        text=True,
    )
    
    # Cleanup concat list
    try:
        os.remove(concat_list_path)
    except Exception:
        pass
    
    return output_path
```

- [ ] **Step 5: Restructure `render_script` to use parallel rendering**

The current `render_script` generates one monolithic Manim script and renders it as `LessonScene`. For per-scene rendering, we need to split scene generation. 

Check the current `_generate_manim_code` to understand if it generates per-scene sections:
```bash
grep -n "_generate_manim_code\|def _generate_scene\|scenes" backend/core/rendering/manim_renderer.py | head -20
```

If scenes are separate sections in the generated code, split them. If they're all one `LessonScene` class, add a per-scene mode.

The safe approach that preserves existing behavior while adding parallelism:

```python
async def render_script(self, script: Any) -> str:
    """
    Render a full video script using Manim with per-scene parallelism.
    Returns the path to the final concatenated video file.
    """
    import time
    start_time = time.time()
    logger.info(f"📐 [Manim] Starting parallel render for: '{script.title}' ({len(script.scenes)} scenes)")
    
    # Check if script has multiple scenes we can split
    if not hasattr(script, 'scenes') or len(script.scenes) <= 1:
        # Fall back to single-file render for single-scene scripts
        return await self._render_script_single(script)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Generate per-scene code files
    scene_paths = []
    for i, scene in enumerate(script.scenes):
        scene_code = self._generate_single_scene_code(scene, i, script)
        scene_code = self._sanitize_generated_code(scene_code)
        path = self._write_scene_file(scene_code, i, timestamp)
        scene_paths.append(path)
    
    # Render all scenes concurrently (semaphore limits to 4 at once)
    video_paths = await asyncio.gather(*[
        self._render_single_scene(path, i)
        for i, path in enumerate(scene_paths)
    ])
    
    valid_count = sum(1 for p in video_paths if p)
    logger.info(f"[Manim] {valid_count}/{len(scene_paths)} scenes rendered successfully")
    
    if valid_count == 0:
        raise RuntimeError("All scene renders failed")
    
    # Concatenate with ffmpeg
    output_path = await self._concat_videos(list(video_paths), script.title)
    
    duration = time.time() - start_time
    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    logger.info(f"✅ [Manim] Parallel render complete in {duration:.2f}s | Size: {file_size_mb:.2f}MB")
    return output_path
```

Rename the existing `render_script` body to `_render_script_single` for backward-compat fallback.

Add `_generate_single_scene_code(scene, index, script)` that wraps existing scene generation for a single scene object.

- [ ] **Step 6: Verify ffmpeg is available**

```bash
which ffmpeg || echo "NOT FOUND"
```

If not available in Docker, note it in a comment — the existing Docker image should have ffmpeg.

- [ ] **Step 7: Run tests**

```bash
cd backend && python -m pytest tests/unit/ -k "manim or render" -v 2>&1 | head -60
```

- [ ] **Step 8: Commit**

```bash
git add backend/core/rendering/manim_renderer.py
git commit -m "perf: per-scene parallel Manim rendering with asyncio.Semaphore(4) + ffmpeg concat"
```

---

## Task 7: Frontend SSE-Driven Progress UI

**Files:**
- Modify: `web/app/create/page.tsx`

- [ ] **Step 1: Read the current progress simulation code**

```bash
sed -n '620,690p' web/app/create/page.tsx
```

Identify: the `useEffect` that drives `progressValue` with `progressValue += (99 - progressValue) * 0.02`.

- [ ] **Step 2: Add stage state types near the top of the component**

Find the existing state declarations (around line 50-100). Add after them:

```typescript
// Pipeline stage tracking
type StageStatus = 'pending' | 'active' | 'done' | 'failed';
interface PipelineStage {
  key: string;
  label: string;
  status: StageStatus;
}

const STAGE_DURATIONS: Record<string, number> = {
  syllabus: 30,
  script: 150,
  audio: 5,
  render: 30,
  total: 215,
};

const INITIAL_STAGES: PipelineStage[] = [
  { key: 'syllabus', label: 'Syllabus', status: 'pending' },
  { key: 'script',   label: 'Script',   status: 'pending' },
  { key: 'audio',    label: 'Audio',    status: 'pending' },
  { key: 'render',   label: 'Render',   status: 'pending' },
  { key: 'done',     label: 'Done',     status: 'pending' },
];
```

- [ ] **Step 3: Add new state variables**

Inside the component, find the existing `const [progressValue, setProgressValue] = useState(0)` and add nearby:

```typescript
const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>(INITIAL_STAGES);
const [realPercent, setRealPercent] = useState(0);
const [currentStageLabel, setCurrentStageLabel] = useState('Starting...');
const [failedStage, setFailedStage] = useState<string | null>(null);
const [jobStartTime, setJobStartTime] = useState<number | null>(null);
const [elapsedSeconds, setElapsedSeconds] = useState(0);
```

- [ ] **Step 4: Replace the simulated progress useEffect with SSE-driven logic**

Find lines 631-672 (the fake progress simulation `useEffect`). Replace the entire block with:

```typescript
// SSE-driven real progress tracking
useEffect(() => {
  if (!isGenerating || !jobId) return;

  // Start elapsed timer
  const startTime = Date.now();
  setJobStartTime(startTime);
  const timerInterval = setInterval(() => {
    setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
  }, 1000);

  // Subscribe to SSE
  const eventSource = new EventSource(`/api/backend/job-stream/${jobId}`);

  const STAGE_ORDER = ['syllabus', 'script', 'audio', 'render', 'done'];
  const STAGE_KEYS: Record<string, string> = {
    syllabus_complete: 'syllabus',
    script_complete:   'script',
    audio_complete:    'audio',
    render_complete:   'render',
    done:              'done',
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.status === 'progress') {
        const completedKey = STAGE_KEYS[data.stage] ?? null;
        setRealPercent(data.percent ?? 0);
        setCurrentStageLabel(data.label ?? '');
        setProgressValue(data.percent ?? 0);

        if (completedKey) {
          setPipelineStages(prev => prev.map(s => {
            const sIdx = STAGE_ORDER.indexOf(s.key);
            const cIdx = STAGE_ORDER.indexOf(completedKey);
            if (sIdx < cIdx) return { ...s, status: 'done' };
            if (s.key === completedKey) return { ...s, status: 'done' };
            if (sIdx === cIdx + 1) return { ...s, status: 'active' };
            return s;
          }));
        }
      } else if (data.status === 'completed') {
        setPipelineStages(prev => prev.map(s => ({ ...s, status: 'done' })));
        setProgressValue(100);
        eventSource.close();
        clearInterval(timerInterval);
        // Existing redirect logic
        if (data.result) {
          handleJobComplete(data.result);
        }
      } else if (data.status === 'failed' || data.status === 'failure') {
        const stage = data.stage ?? null;
        setFailedStage(stage);
        if (stage) {
          const failKey = STAGE_KEYS[stage] ?? stage;
          setPipelineStages(prev => prev.map(s =>
            s.key === failKey ? { ...s, status: 'failed' } : s
          ));
        }
        setIsGenerating(false);
        eventSource.close();
        clearInterval(timerInterval);
      }
    } catch (e) {
      console.error('SSE parse error', e);
    }
  };

  eventSource.onerror = () => {
    // Fall back to polling on SSE disconnect
    eventSource.close();
  };

  return () => {
    eventSource.close();
    clearInterval(timerInterval);
  };
}, [isGenerating, jobId]);
```

Note: `handleJobComplete` is whatever the existing completion handler is called. Find it:
```bash
grep -n "handleJobComplete\|setVideoUrl\|router.push\|redirect\|completed" web/app/create/page.tsx | head -20
```
Replace `handleJobComplete(data.result)` with the actual completion logic used in the existing code.

- [ ] **Step 5: Update the progress UI JSX**

Find the `<div>` that renders the progress bar (search for `progressValue` in JSX). Add the elapsed timer display and stage pipeline. The section that currently renders just a bar:

```tsx
{/* Elapsed + stage info */}
<div className="text-center mb-4">
  <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">GENERATING YOUR LESSON</div>
  <div className="text-4xl font-bold text-blue-500">{Math.round(progressValue)}%</div>
  <div className="text-sm font-medium text-gray-700 mt-1">{currentStageLabel}</div>
</div>

{/* Progress bar */}
<div className="bg-gray-200 rounded-lg h-2.5 my-4 overflow-hidden">
  <div
    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-lg transition-all duration-500"
    style={{ width: `${progressValue}%` }}
  />
</div>

{/* Stage pipeline */}
<div className="flex justify-between items-start my-4 text-xs">
  {pipelineStages.map((stage, i) => (
    <React.Fragment key={stage.key}>
      <div className="flex flex-col items-center flex-1">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1
          ${stage.status === 'done'   ? 'bg-green-500 text-white' : ''}
          ${stage.status === 'active' ? 'bg-blue-500 text-white animate-pulse' : ''}
          ${stage.status === 'failed' ? 'bg-red-600 text-white' : ''}
          ${stage.status === 'pending'? 'bg-gray-200 text-gray-400' : ''}
        `}>
          {stage.status === 'done'    ? '✓' : ''}
          {stage.status === 'active'  ? '⟳' : ''}
          {stage.status === 'failed'  ? '✗' : ''}
          {stage.status === 'pending' ? String(i + 1) : ''}
        </div>
        <div className={`${stage.status === 'active' ? 'text-blue-500 font-semibold' : ''}
          ${stage.status === 'failed' ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
          {stage.label}
        </div>
      </div>
      {i < pipelineStages.length - 1 && (
        <div className="flex-1 flex items-center pb-5">
          <div className={`h-0.5 w-full
            ${pipelineStages[i].status === 'done' ? 'bg-green-500' : ''}
            ${pipelineStages[i].status === 'active' ? 'bg-blue-500 animate-pulse' : ''}
            ${pipelineStages[i].status === 'failed' ? 'bg-red-300' : ''}
            ${pipelineStages[i].status === 'pending' ? 'bg-gray-200' : ''}
          `} />
        </div>
      )}
    </React.Fragment>
  ))}
</div>

{/* Elapsed + ETA */}
<div className="flex justify-between text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
  <span>⏱ Running for <strong>{Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s</strong></span>
  <span>Est. remaining: <strong>~{Math.max(0, Math.round((STAGE_DURATIONS.total - elapsedSeconds) / 60))}m</strong></span>
</div>
```

- [ ] **Step 6: Check the page builds**

```bash
cd web && npx tsc --noEmit 2>&1 | head -40
```

Fix any TypeScript errors before committing.

- [ ] **Step 7: Commit**

```bash
git add web/app/create/page.tsx
git commit -m "feat: replace fake progress bar with SSE-driven stage pipeline UI + elapsed timer"
```

---

## Task 8: Frontend Error State with Retry Button

**Files:**
- Modify: `web/app/create/page.tsx`

- [ ] **Step 1: Find the existing error/failure render section**

```bash
grep -n "failed\|error\|retry\|Retry\|failedStage" web/app/create/page.tsx | head -30
```

- [ ] **Step 2: Add error state render**

Find the JSX section that renders when the job fails (or add one if it doesn't exist). In the generating state section, add a conditional:

```tsx
{failedStage ? (
  /* Error state */
  <div className="text-center">
    <div className="text-4xl mb-2">⚠️</div>
    <div className="text-lg font-semibold text-red-600 mb-2">Generation Failed</div>
    <div className="text-sm text-gray-500 mb-4 leading-relaxed">
      Something went wrong during <strong>{
        failedStage.replace('_complete', '').replace('_', ' ')
          .replace(/\b\w/g, c => c.toUpperCase())
      }</strong>. Please try again.
    </div>

    {/* User-friendly callout — no tech details */}
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-center text-red-900">
      This stage failed. Please try again.
    </div>

    {/* Stage pipeline showing where it stopped */}
    <div className="flex justify-between items-start my-4 text-xs">
      {pipelineStages.map((stage, i) => (
        <React.Fragment key={stage.key}>
          <div className="flex flex-col items-center flex-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1
              ${stage.status === 'done'   ? 'bg-green-500 text-white' : ''}
              ${stage.status === 'failed' ? 'bg-red-600 text-white' : ''}
              ${stage.status === 'pending'? 'bg-gray-200 text-gray-400' : ''}
            `}>
              {stage.status === 'done'   ? '✓' : ''}
              {stage.status === 'failed' ? '✗' : ''}
              {stage.status === 'pending'? String(i + 1) : ''}
            </div>
            <div className={`
              ${stage.status === 'failed' ? 'text-red-600 font-semibold' : 'text-gray-400'}
            `}>{stage.label}</div>
          </div>
          {i < pipelineStages.length - 1 && (
            <div className="flex-1 flex items-center pb-5">
              <div className={`h-0.5 w-full
                ${pipelineStages[i].status === 'done' ? 'bg-green-500' : 'bg-gray-200'}
              `} />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>

    <div className="flex gap-3 mt-5">
      <button
        className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors"
        onClick={() => {
          // Reset state and re-trigger generation with same topic
          setFailedStage(null);
          setPipelineStages(INITIAL_STAGES);
          setProgressValue(0);
          setElapsedSeconds(0);
          handleGenerate(currentTopic);  // use existing topic ref
        }}
      >
        🔄 Try Again
      </button>
      <button
        className="px-4 py-2.5 bg-white text-gray-500 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
        onClick={() => {
          setFailedStage(null);
          setIsGenerating(false);
          setPipelineStages(INITIAL_STAGES);
          setProgressValue(0);
        }}
      >
        Cancel
      </button>
    </div>
  </div>
) : (
  /* Normal progress state — the stage pipeline from Task 7 goes here */
  /* ... existing generating UI ... */
)}
```

Find `handleGenerate` and `currentTopic` — the actual function/variable names may differ. Check:
```bash
grep -n "handleGenerate\|handleSubmit\|onSubmit\|topic\b" web/app/create/page.tsx | head -20
```

Use the actual names from the codebase.

- [ ] **Step 3: TypeScript check**

```bash
cd web && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add web/app/create/page.tsx
git commit -m "feat: add user-friendly error state with stage indicator and Retry/Cancel buttons"
```

---

## Self-Review

Checking spec coverage:

| Spec Requirement | Task |
|-----------------|------|
| Fix aiohttp ClientTimeout | Task 1 ✓ |
| Celery PROGRESS milestones (syllabus/script/audio/render) | Task 3 ✓ |
| SSE relay for PROGRESS state | Task 4 ✓ |
| Manim inline bullet detection | Task 2 Bug 1 ✓ |
| Manim word-boundary truncation at 150 | Task 2 Bug 2 ✓ |
| Manim textwrap.fill | Task 2 Bug 3 ✓ |
| Manim `.move_to(ORIGIN)` | Task 2 Bug 4 ✓ |
| `_review_render_plan` concurrent with TTS | Task 5 ✓ |
| Per-scene parallel Manim + ffmpeg concat | Task 6 ✓ |
| Frontend SSE-driven stage UI + elapsed timer | Task 7 ✓ |
| Frontend error state (no tech details) + Retry | Task 8 ✓ |

No gaps found.
