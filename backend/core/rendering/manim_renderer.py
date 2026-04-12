"""
Manim Renderer Service
Renders mathematical animations using the Manim engine.
Translates "Director JSON" scenes into executable Manim Python code.
"""

import os
import logging
import re
import shutil
import subprocess
from pathlib import Path
from typing import List, Dict, Optional, Any
from datetime import datetime
from config.config import config
# Removed circular import - Scene and VideoScript types handled as Any

logger = logging.getLogger(__name__)

# ─── Catppuccin Macchiato Design System ───────────────────────────────────────
# A unified dark palette that looks polished against the surrounding web UI.
THEME = {
    "BG":        "#1E1E2E",   # base — near-black canvas
    "SURFACE":   "#24273A",   # slightly lighter surface
    "ACCENT":    "#89B4FA",   # blue — primary highlights / graphs
    "TEXT":      "#CDD6F4",   # off-white — body text
    "HEADING":   "#F5C2E7",   # pink — titles / headings
    "GREEN":     "#A6E3A1",   # green — positive / checkmarks
    "PEACH":     "#FAB387",   # orange — warnings / callouts
    "YELLOW":    "#F9E2AF",   # yellow — worked examples / transforms
    "MAUVE":     "#CBA6F7",   # purple — equations / tex
    "RED":       "#F38BA8",   # red — errors / misconception scenes
}

# Safe font with CJK fallback — both are available in the Docker image
PREFERRED_FONT   = "Noto Sans"
HEADING_FONT     = "Noto Sans"
MONOSPACE_FONT   = "Noto Sans Mono"


class ManimService:
    """Service for rendering Manim animations"""

    def __init__(self):
        self.output_dir = os.path.join(config.DATA_DIR, "videos", "manim")
        self.render_quality = os.getenv("MANIM_RENDER_QUALITY", "l")
        self.render_timeout_seconds = int(os.getenv("MANIM_RENDER_TIMEOUT_SECONDS", "420"))
        os.makedirs(self.output_dir, exist_ok=True)
        # Cache LaTeX availability check (avoids 14+ subprocess calls per video)
        self._has_latex: Optional[bool] = None
        # Render statistics from the last render_script call
        self.last_render_stats: Dict[str, Any] = {}
        
    def _generate_single_scene_code(self, scene: Any, index: int) -> str:
        """Generate standalone Manim code for one scene with class LessonScene{index}."""
        class _Proxy:
            def __init__(self, s):
                self.scenes = [s]
                self.title = getattr(s, 'id', f'scene_{index}')
        code = self._generate_manim_code(_Proxy(scene))
        # Rename class so concurrent renders don't collide
        return code.replace('class LessonScene(Scene):', f'class LessonScene{index}(Scene):')

    async def _render_scene_parallel(
        self,
        scene_code: str,
        index: int,
        timestamp: str,
        semaphore: Any,
    ) -> Optional[str]:
        """Render one scene file. Returns video path or None on permanent failure."""
        import asyncio as _asyncio
        uv_manim = shutil.which("manim") or "manim"
        scene_name = f"LessonScene{index}"
        stem = f"scene_{timestamp}_{index}"
        script_path = os.path.join(self.output_dir, f"{stem}.py")

        with open(script_path, 'w') as f:
            f.write(scene_code)

        for attempt in range(1, 4):
            async with semaphore:
                try:
                    await _asyncio.to_thread(
                        subprocess.run,
                        [uv_manim, f"-q{self.render_quality}", "--media_dir", self.output_dir,
                         script_path, scene_name],
                        check=True,
                        capture_output=True,
                        text=True,
                        env={**os.environ, "PATH": os.environ["PATH"]},
                        timeout=self.render_timeout_seconds,
                    )
                    video_root = Path(self.output_dir) / "videos" / stem
                    matches = sorted(video_root.rglob(f"{scene_name}.mp4"))
                    if matches:
                        logger.info(f"✅ Scene {index} rendered: {matches[0]}")
                        return str(matches[0])
                    logger.warning(f"Scene {index}: render succeeded but no mp4 found")
                    return None
                except subprocess.CalledProcessError as e:
                    logger.warning(f"⚠️ Scene {index} attempt {attempt} failed: {e.stderr[:300]}")
                    if attempt == 3:
                        logger.error(f"❌ Scene {index} failed after 3 attempts — skipping")
                        return None
                except Exception as e:
                    logger.error(f"❌ Scene {index} unexpected error: {e}")
                    return None
        return None

    def _generate_srt(self, scenes: List[Any], video_paths: List[Optional[str]], timestamp: str) -> Optional[str]:
        """Generate an SRT subtitle file from scene narrations aligned to video durations.
        Returns the path to the .srt file, or None on failure."""
        import json as _json

        srt_path = os.path.join(self.output_dir, f"subs_{timestamp}.srt")
        entries: List[str] = []
        cursor = 0.0  # running time offset in seconds
        idx = 0

        for scene, vpath in zip(scenes, video_paths):
            if vpath is None:
                continue  # scene failed to render — skip

            duration = float(getattr(scene, "duration", 0) or 0)
            narration = (getattr(scene, "narration", "") or "").strip()
            if not narration or duration <= 0:
                cursor += duration
                continue

            # Split long narrations into ≤80-char subtitle chunks
            words = narration.split()
            chunks: List[str] = []
            current: List[str] = []
            for w in words:
                current.append(w)
                if len(" ".join(current)) > 80:
                    chunks.append(" ".join(current))
                    current = []
            if current:
                chunks.append(" ".join(current))
            if not chunks:
                cursor += duration
                continue

            chunk_dur = duration / len(chunks)
            for ci, chunk in enumerate(chunks):
                idx += 1
                start = cursor + ci * chunk_dur
                end = start + chunk_dur
                entries.append(
                    f"{idx}\n"
                    f"{self._srt_ts(start)} --> {self._srt_ts(end)}\n"
                    f"{chunk}\n"
                )
            cursor += duration

        if not entries:
            return None

        with open(srt_path, "w", encoding="utf-8") as f:
            f.write("\n".join(entries))
        logger.info(f"📝 [Manim] Generated subtitles: {srt_path} ({idx} cues)")
        return srt_path

    @staticmethod
    def _srt_ts(seconds: float) -> str:
        """Convert seconds to SRT timestamp format HH:MM:SS,mmm."""
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int((seconds - int(seconds)) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    async def _concat_videos(
        self,
        video_paths: List[str],
        timestamp: str,
        scenes: Optional[List[Any]] = None,
        all_video_slots: Optional[List[Optional[str]]] = None,
    ) -> str:
        """Concatenate scene videos with ffmpeg and burn in subtitles.
        Returns output path."""
        import asyncio as _asyncio
        import shutil

        concat_list = os.path.join(self.output_dir, f"concat_{timestamp}.txt")
        raw_output = os.path.join(self.output_dir, f"lesson_{timestamp}_raw.mp4")
        output_path = os.path.join(self.output_dir, f"lesson_{timestamp}.mp4")

        with open(concat_list, "w") as f:
            for p in video_paths:
                f.write(f"file '{p}'\n")

        ffmpeg = shutil.which("ffmpeg") or "ffmpeg"

        # Step 1: concat into raw file
        await _asyncio.to_thread(
            subprocess.run,
            [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", concat_list, "-c", "copy", raw_output],
            check=True,
            capture_output=True,
            text=True,
        )

        # Step 2: burn subtitles if scene data is available
        srt_path = None
        if scenes and all_video_slots:
            srt_path = self._generate_srt(scenes, all_video_slots, timestamp)

        if srt_path and os.path.isfile(srt_path):
            try:
                # Embed SRT as a soft-subtitle stream (works with any ffmpeg build,
                # no libass required). Players show captions when the user enables them.
                await _asyncio.to_thread(
                    subprocess.run,
                    [ffmpeg, "-y",
                     "-i", raw_output,
                     "-i", srt_path,
                     "-c:v", "copy", "-c:a", "copy",
                     "-c:s", "mov_text",        # MP4 subtitle codec
                     "-metadata:s:s:0", "language=eng",
                     output_path],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                logger.info(f"✅ [Manim] Subtitles embedded into {output_path}")
                for fp in (raw_output, srt_path):
                    try:
                        os.remove(fp)
                    except OSError:
                        pass
            except Exception as e:
                logger.warning(f"⚠️ [Manim] Subtitle embed failed ({e}), using raw concat")
                if os.path.isfile(raw_output):
                    os.rename(raw_output, output_path)
        else:
            os.rename(raw_output, output_path)

        try:
            os.remove(concat_list)
        except OSError:
            pass

        logger.info(f"✅ [Manim] Concat complete → {output_path}")
        return output_path

    async def render_script(self, script: Any) -> str:
        """
        Render a video script using Manim.
        Multi-scene scripts use per-scene parallel rendering + ffmpeg concat.
        Single-scene scripts fall back to the original single-file renderer.
        Returns the path to the final video file.
        """
        import asyncio as _asyncio
        import time

        scenes = getattr(script, 'scenes', [])
        if len(scenes) <= 1:
            return await self._render_script_single(script)

        start_time = time.time()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        logger.info(f"📐 [Manim] Parallel render: '{script.title}' ({len(scenes)} scenes)")

        semaphore = _asyncio.Semaphore(4)

        scene_codes = [
            self._sanitize_generated_code(self._generate_single_scene_code(scene, i))
            for i, scene in enumerate(scenes)
        ]

        video_paths = await _asyncio.gather(*[
            self._render_scene_parallel(code, i, timestamp, semaphore)
            for i, code in enumerate(scene_codes)
        ])

        valid_paths = [p for p in video_paths if p]
        total_scenes = len(scenes)
        rendered_count = len(valid_paths)
        failed_indices = [i for i, p in enumerate(video_paths) if p is None]
        logger.info(f"[Manim] {rendered_count}/{total_scenes} scenes rendered")

        self.last_render_stats = {
            "total_scenes": total_scenes,
            "rendered_scenes": rendered_count,
            "failed_scenes": len(failed_indices),
            "failed_indices": failed_indices,
            "render_success_rate": rendered_count / max(total_scenes, 1),
        }

        if not valid_paths:
            logger.warning("[Manim] All parallel scene renders failed; falling back to single render")
            return await self._render_script_single(script)

        if len(valid_paths) == 1:
            return valid_paths[0]

        output = await self._concat_videos(
            valid_paths, timestamp,
            scenes=scenes,
            all_video_slots=list(video_paths),
        )
        duration = time.time() - start_time
        self.last_render_stats["render_time_seconds"] = round(duration, 2)
        logger.info(f"✅ [Manim] Parallel render complete in {duration:.2f}s → {output}")
        return output

    async def _render_script_single(self, script: Any) -> str:
        """
        Original single-file Manim renderer with LLM self-correction.
        """

        import time
        import asyncio
        start_time = time.time()
        logger.info(f"📐 [Manim] Starting render for: '{script.title}'")
        
        # 1. Generate Python code for Manim
        manim_code = self._sanitize_generated_code(self._generate_manim_code(script))
        
        # 2. Retry Loop (Self-Correction)
        max_retries = 3
        attempt = 0
        
        while attempt < max_retries:
            attempt += 1
            # Save to temporary Python file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            script_path = os.path.join(self.output_dir, f"scene_{timestamp}_{attempt}.py")
            
            with open(script_path, 'w') as f:
                f.write(manim_code)
                
            # Execute Manim
            try:
                # Lower-quality rendering keeps async lesson generation responsive enough for web use.
                # Run in thread to avoid blocking asyncio loop
                # Use uv environment manim to avoid conda conflicts
                uv_manim = shutil.which("manim") or "manim"
                cmd = [
                    uv_manim, 
                    f"-q{self.render_quality}",
                    "--media_dir", self.output_dir,
                    script_path,
                    "LessonScene"
                ]
                
                logger.info(f"Executing (Attempt {attempt}/{max_retries}): {' '.join(cmd)}")
                
                # Use asyncio.to_thread for blocking subprocess
                result = await asyncio.to_thread(
                    subprocess.run,
                    cmd, 
                    check=True, 
                    capture_output=True, 
                    text=True,
                    env={**os.environ, "PATH": os.environ["PATH"]},
                    timeout=self.render_timeout_seconds
                )
                
                video_root = Path(self.output_dir) / "videos" / f"scene_{timestamp}_{attempt}"
                video_matches = sorted(video_root.rglob("LessonScene.mp4"))
                video_path = str(video_matches[0]) if video_matches else ""
                
                if video_path and os.path.exists(video_path):
                    duration = time.time() - start_time
                    file_size_mb = os.path.getsize(video_path) / (1024 * 1024)
                    logger.info(f"✅ [Manim] Render successful in {duration:.2f}s | Size: {file_size_mb:.2f}MB | Path: {video_path}")
                    return video_path
                else:
                    raise Exception(f"Output video not found at {video_path}")
                    
            except subprocess.CalledProcessError as e:
                logger.warning(f"⚠️ [Manim] Render failed (Attempt {attempt}): {e.stderr}")
                
                if attempt < max_retries:
                    logger.info(f"🔧 [Manim] Attempting self-correction with LLM...")
                    try:
                        new_code = await self._fix_code_with_llm(manim_code, e.stderr)
                        if new_code:
                            manim_code = self._sanitize_generated_code(new_code)
                            continue
                    except Exception as llm_error:
                        logger.error(f"❌ [Manim] Self-correction failed: {llm_error}")
                
                # If retries exhausted or LLM failed
                if attempt == max_retries:
                    raise Exception(f"Manim render failed after {max_retries} attempts. Last error: {e.stderr}")
            except Exception as e:
                logger.error(f"Render failed: {e}")
                raise

    async def _fix_code_with_llm(self, broken_code: str, error_log: str) -> Optional[str]:
        """Use LLM to fix the broken Manim code based on the error log"""
        from services.api_client import APIClient
        from prompts.loader import render_prompt
        client = APIClient()

        prompt = render_prompt("rendering/manim_fix", error_log=error_log, broken_code=broken_code)
        
        try:
            response = await client.deepseek.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1
            )
            
            if response.success:
                content = response.data["choices"][0]["message"]["content"]
                # Strip markdown if present
                if "```python" in content:
                    content = content.split("```python")[1].split("```")[0]
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0]
                return content.strip()
            else:
                return None
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            return None

    def _check_latex_availability(self) -> bool:
        """Check if LaTeX standalone class is available (cached per instance)."""
        if self._has_latex is not None:
            return self._has_latex
        try:
            subprocess.run(
                ["kpsewhich", "standalone.cls"],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self._has_latex = True
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.warning("LaTeX 'standalone.cls' not found. Falling back to Text renderer.")
            self._has_latex = False
        return self._has_latex

    def _generate_manim_code(self, script: Any) -> str:
        """Generate the Python code string for the Manim scene"""
        
        has_latex = self._check_latex_availability()
        
        # ── Themed colour constants injected into every rendered file ────────
        bg       = THEME["BG"]
        accent   = THEME["ACCENT"]
        text_col = THEME["TEXT"]
        heading  = THEME["HEADING"]
        green    = THEME["GREEN"]
        peach    = THEME["PEACH"]
        yellow   = THEME["YELLOW"]
        mauve    = THEME["MAUVE"]
        red_col  = THEME["RED"]
        pf       = PREFERRED_FONT
        hf       = HEADING_FONT

        code = [
            "from manim import *",
            "import numpy as np",
            "from math import *",
            "",
            "# ─── MentorMind Catppuccin Macchiato theme ───",
            f'BG_COLOR      = ManimColor("{bg}")',
            f'ACCENT_COLOR  = ManimColor("{accent}")',
            f'TEXT_COLOR    = ManimColor("{text_col}")',
            f'HEADING_COLOR = ManimColor("{heading}")',
            f'GREEN_COLOR   = ManimColor("{green}")',
            f'PEACH_COLOR   = ManimColor("{peach}")',
            f'YELLOW_COLOR  = ManimColor("{yellow}")',
            f'MAUVE_COLOR   = ManimColor("{mauve}")',
            f'RED_COLOR     = ManimColor("{red_col}")',
            "",
            "class LessonScene(Scene):",
            "    def wrap_text(self, text, width=40):",
            "        import textwrap",
            "        return textwrap.fill(str(text), width=width)",
            "",
            "    def compact_text(self, text, max_chars=120):",
            "        text = str(text).strip()",
            "        return text if len(text) <= max_chars else text[:max_chars - 1] + '...'",
            "",
            "    def animate_with_audio(self, mobject, total_duration, animation='fade'):",
            "        total_duration = max(float(total_duration), 1.0)",
            "        intro_duration = min(2.5, max(0.8, total_duration * 0.2))",
            "        if animation == 'write':",
            "            self.play(Write(mobject), run_time=intro_duration)",
            "        else:",
            "            self.play(FadeIn(mobject), run_time=min(1.2, intro_duration))",
            "        remaining = max(0.0, total_duration - intro_duration)",
            "        if remaining > 0:",
            "            self.wait(remaining)",
            "",
            "    def animate_bullets(self, bullet_texts, total_duration, font_size=28):",
            "        \"\"\"Animate a list of bullet strings sequentially (B: generative pacing).\"\"\"",
            "        if not bullet_texts:",
            "            return",
            "        per_bullet = max(1.5, total_duration / len(bullet_texts))",
            "        intro = min(0.6, per_bullet * 0.15)",
            "        wait_time = max(0.5, per_bullet - intro)",
            "        group = VGroup()",
            "        for txt in bullet_texts:",
            f'            mob = Text(txt, font_size=font_size, color=TEXT_COLOR, font="{pf}")',
            "            group.add(mob)",
            "        group.arrange(DOWN, aligned_edge=LEFT, buff=0.22)",
            "        group.scale_to_fit_width(min(group.width, config.frame_width * 0.88))",
            "        group.center()",
            "        for mob in group:",
            "            self.play(FadeIn(mob, shift=RIGHT*0.15), run_time=intro)",
            "            self.wait(wait_time)",
            "",
            "    def construct(self):",
            "        # ── Global theme ──────────────────────────────────────",
            f'        self.camera.background_color = ManimColor("{bg}")',
            f'        Text.set_default(font="{pf}", color=TEXT_COLOR)',
            "",
        ]
        
        for scene in script.scenes:
            # Note: We process ALL scenes if sent to Manim, regardless of visual_type tag
            # to ensure we don't produce empty videos.

            layout = scene.canvas_config or {}
            position = str(layout.get("position", "center")).lower()
            font_size = layout.get("font_size", 28)
            safe_scale = layout.get("safe_scale", 0.82)
            graph = layout.get("graph", {}) if isinstance(layout.get("graph"), dict) else {}
            x_range = graph.get("x_range", [-3, 3])
            y_range = graph.get("y_range", [-2, 2])

            code.append(f"        # Scene: {scene.id}")
            if scene.audio_path:
                # Use raw string for paths to handle backslashes on Windows if needed
                code.append(f"        self.add_sound(r'{scene.audio_path}')")
            
            # Determine accent colour per layout type for variety
            scene_layout = str(layout.get("layout", "callout_card")).lower()
            if scene_layout == "title_card":
                primary_col = "HEADING_COLOR"
            elif scene_layout == "equation_focus":
                primary_col = "MAUVE_COLOR"
            elif scene_layout == "graph_focus":
                primary_col = "ACCENT_COLOR"
            elif scene_layout == "recap_card":
                primary_col = "GREEN_COLOR"
            else:
                primary_col = "ACCENT_COLOR"

            # ── Action Mapping ────────────────────────────────────────────
            if scene.action == "plot":
                # Validate the expression is valid Python before embedding
                plot_expr = scene.param
                try:
                    compile(f"lambda x: {plot_expr}", "<plot>", "eval")
                except SyntaxError:
                    # LLM sometimes produces invalid expressions; fall back to y=x
                    logger.warning(f"Invalid plot expression '{plot_expr}', falling back to y=x")
                    plot_expr = "x"
                code.append(f"        ax = Axes(")
                code.append(f"            x_range={x_range},")
                code.append(f"            y_range={y_range},")
                code.append(f"            axis_config={{\"color\": ACCENT_COLOR}},")
                code.append(f"        )")
                code.append(f"        ax.set_color(ACCENT_COLOR)")
                # Wrap lambda in try/except to handle math domain errors (e.g. sqrt of negative)
                code.append(f"        def _safe_plot(x):")
                code.append(f"            try:")
                code.append(f"                return {plot_expr}")
                code.append(f"            except (ValueError, ZeroDivisionError, OverflowError):")
                code.append(f"                return 0.0")
                code.append(f"        curve = ax.plot(_safe_plot, color=YELLOW_COLOR)")
                code.append(f"        plot_intro = min(2.5, max(0.8, {scene.duration} * 0.2))")
                code.append(f"        self.play(Create(ax), run_time=plot_intro * 0.4)")
                code.append(f"        self.play(Create(curve), run_time=plot_intro * 0.6)")
                code.append(f"        plot_remaining = max(0.0, {scene.duration} - plot_intro)")
                code.append(f"        if plot_remaining > 0:")
                code.append(f"            self.wait(plot_remaining)")
                code.append(f"        self.play(FadeOut(ax), FadeOut(curve), run_time=0.5)")
                
            elif scene.action == "write_tex":
                has_non_ascii = any(ord(c) > 127 for c in scene.param)
                
                if has_latex and not has_non_ascii:
                    code.append(f"        eq = MathTex(r'{scene.param}', color={primary_col})")
                else:
                    clean_text = self._latex_to_plain_text(scene.param)
                    code.append(f'        eq = Text(r"""{clean_text}""", font_size={font_size}, color={primary_col})')
                code.append(f"        eq.scale({safe_scale})")
                if position == "top":
                    code.append("        eq.to_edge(UP)")
                elif position == "left":
                    code.append("        eq.to_edge(LEFT)")
                elif position == "right":
                    code.append("        eq.to_edge(RIGHT)")
                    
                code.append(f"        self.animate_with_audio(eq, {scene.duration}, animation='write')")
                code.append(f"        self.play(FadeOut(eq), run_time=0.4)")

            elif scene.action == "transform":
                # D: Properly implement transform — morph two expressions
                parts = scene.param.split(" -> ", 1) if " -> " in scene.param else []
                has_non_ascii = any(ord(c) > 127 for c in scene.param)
                if len(parts) == 2 and has_latex and not has_non_ascii:
                    expr1, expr2 = parts[0].strip(), parts[1].strip()
                    code.append(f"        eq1 = MathTex(r'{expr1}', color={primary_col})")
                    code.append(f"        eq1.scale({safe_scale})")
                    code.append(f"        eq2 = MathTex(r'{expr2}', color=YELLOW_COLOR)")
                    code.append(f"        eq2.scale({safe_scale})")
                    intro = f"min(2.5, max(0.8, {scene.duration} * 0.25))"
                    hold  = f"max(0.5, {scene.duration} * 0.4)"
                    outro = f"min(2.0, max(0.8, {scene.duration} * 0.25))"
                    code.append(f"        self.play(Write(eq1), run_time={intro})")
                    code.append(f"        self.wait({hold})")
                    code.append(f"        self.play(TransformMatchingTex(eq1, eq2), run_time={outro})")
                    code.append(f"        remaining_t = max(0, {scene.duration} - ({intro}) - ({hold}) - ({outro}))")
                    code.append(f"        if remaining_t > 0: self.wait(remaining_t)")
                    code.append(f"        self.play(FadeOut(eq2), run_time=0.4)")
                else:
                    # Fallback: treat as show_text when non-ASCII or no separator
                    display_text = self._compact_for_code(scene.param or scene.narration, 150)
                    code.append(f'        text = Text(self.wrap_text(r"""{display_text}""", width=42), font_size={font_size}, color={primary_col})')
                    code.append(f"        text.move_to(ORIGIN)")
                    code.append(f"        text.scale({safe_scale})")
                    code.append(f"        self.animate_with_audio(text, {scene.duration})")
                    code.append(f"        self.play(FadeOut(text), run_time=0.4)")

            elif scene.action == "draw_shape":
                param_lower = scene.param.lower()
                if "circle" in param_lower:
                    code.append(f"        shape = Circle(color=PEACH_COLOR, fill_color=PEACH_COLOR, fill_opacity=0.15)")
                elif "square" in param_lower or "rectangle" in param_lower:
                    code.append(f"        shape = Square(color=GREEN_COLOR, fill_color=GREEN_COLOR, fill_opacity=0.15)")
                elif "triangle" in param_lower:
                    code.append(f"        shape = Triangle(color=YELLOW_COLOR, fill_color=YELLOW_COLOR, fill_opacity=0.15)")
                elif "arrow" in param_lower:
                    code.append(f"        shape = Arrow(LEFT * 2, RIGHT * 2, color=ACCENT_COLOR, buff=0)")
                else:
                    code.append(f"        shape = Square(color=ACCENT_COLOR, fill_color=ACCENT_COLOR, fill_opacity=0.10)")
                code.append(f"        intro_d = min(2.0, max(0.8, {scene.duration} * 0.3))")
                code.append(f"        self.play(GrowFromCenter(shape), run_time=intro_d)")
                code.append(f"        self.wait(max(0, {scene.duration} - intro_d - 0.5))")
                code.append(f"        self.play(FadeOut(shape), run_time=0.5)")
            
            elif scene.action == "show_title":
                code.append(f'        title = Text(r"""{scene.param}""", font_size=max({font_size}, 52), color=HEADING_COLOR, font="{hf}")')
                code.append(f"        title.scale({safe_scale})")
                # Underline accent bar
                code.append(f"        bar = Line(LEFT * 3, RIGHT * 3, color=ACCENT_COLOR, stroke_width=3)")
                code.append(f"        bar.next_to(title, DOWN, buff=0.15)")
                code.append(f"        self.play(Write(title), run_time=min(2.0, {scene.duration} * 0.3))")
                code.append(f"        self.play(Create(bar), run_time=0.4)")
                code.append(f"        self.wait(max(0, {scene.duration} - min(2.0, {scene.duration}*0.3) - 0.4 - 0.5))")
                code.append(f"        self.play(FadeOut(title), FadeOut(bar), run_time=0.5)")

            elif scene.action == "show_text":
                # B: Detect bullet list and animate progressively
                raw_param = scene.param or scene.narration
                bullets = self._extract_bullets(raw_param, layout.get('max_chars', 150))
                if len(bullets) > 1:
                    # Progressive bullet animation
                    bullet_list_repr = repr(bullets)
                    code.append(f"        self.animate_bullets({bullet_list_repr}, {scene.duration}, font_size={font_size})")
                    code.append(f"        self.wait(0.4)")
                    code.append(f"        self.clear()")
                else:
                    display_text = self._compact_for_code(raw_param, layout.get('max_chars', 150))
                    code.append(f'        text = Text(self.wrap_text(r"""{display_text}""", width=42), font_size={font_size}, color={primary_col})')
                    code.append(f"        text.move_to(ORIGIN)")
                    code.append(f"        text.scale({safe_scale})")
                    if position == "top":
                        code.append("        text.to_edge(UP)")
                    elif position == "left":
                        code.append("        text.to_edge(LEFT)")
                    elif position == "right":
                        code.append("        text.to_edge(RIGHT)")
                    code.append(f"        self.animate_with_audio(text, {scene.duration})")
                    code.append(f"        self.play(FadeOut(text), run_time=0.4)")

            elif scene.action == "show_image":
                code.append(f'        text = Text(r"""[Image: {scene.param}]""", font_size=36, color=YELLOW_COLOR)')
                code.append(f"        self.animate_with_audio(text, {scene.duration})")
                code.append(f"        self.play(FadeOut(text), run_time=0.4)")

            else:
                # Default text fallback
                fallback_text = self._compact_for_code(scene.param or scene.narration, layout.get('max_chars', 150))
                code.append(f'        text = Text(self.wrap_text(r"""{fallback_text}""", width=42), font_size={font_size}, color={primary_col})')
                code.append(f"        text.move_to(ORIGIN)")
                code.append(f"        text.scale({safe_scale})")
                code.append(f"        self.animate_with_audio(text, {scene.duration})")
                code.append(f"        self.play(FadeOut(text), run_time=0.4)")
                
        return "\n".join(code)

    def _extract_bullets(self, text: str, max_chars: int) -> List[str]:
        """
        Parse a bullet-list string into individual items.
        Recognises lines starting with -, •, *, or numbered (1.).
        Also handles inline ' - ' separated bullets on a single line.
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
        # Fallback: try inline ' - ' separator (e.g. "- item1 - item2 - item3")
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

    def _compact_for_code(self, text: str, max_chars: int = 150) -> str:
        """Compact text and escape triple-quote issues for safe embedding in code."""
        clean = re.sub(r"\s+", " ", str(text or "")).strip()
        if len(clean) > max_chars:
            truncated = clean[:max_chars].rsplit(' ', 1)[0]
            clean = truncated + '...'
        # Escape triple quotes that would break the generated f-string
        clean = clean.replace('"""', "'\"\"")
        return clean

    # ── Unicode math lookup tables ──────────────────────────────────────
    _LATEX_SUPERSCRIPTS = str.maketrans(
        "0123456789+-=()ninx", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱⁿˣ"
    )
    _LATEX_SUBSCRIPTS = str.maketrans(
        "0123456789+-=()aeiourx", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑᵢₒᵤᵣₓ"
    )
    _LATEX_SYMBOLS: dict[str, str] = {
        # Greek lowercase
        r"\alpha": "α", r"\beta": "β", r"\gamma": "γ", r"\delta": "δ",
        r"\epsilon": "ε", r"\varepsilon": "ε", r"\zeta": "ζ", r"\eta": "η",
        r"\theta": "θ", r"\vartheta": "ϑ", r"\iota": "ι", r"\kappa": "κ",
        r"\lambda": "λ", r"\mu": "μ", r"\nu": "ν", r"\xi": "ξ",
        r"\pi": "π", r"\rho": "ρ", r"\sigma": "σ", r"\tau": "τ",
        r"\upsilon": "υ", r"\phi": "φ", r"\varphi": "φ", r"\chi": "χ",
        r"\psi": "ψ", r"\omega": "ω",
        # Greek uppercase
        r"\Gamma": "Γ", r"\Delta": "Δ", r"\Theta": "Θ", r"\Lambda": "Λ",
        r"\Xi": "Ξ", r"\Pi": "Π", r"\Sigma": "Σ", r"\Upsilon": "Υ",
        r"\Phi": "Φ", r"\Psi": "Ψ", r"\Omega": "Ω",
        # Operators
        r"\sqrt": "√", r"\cbrt": "∛", r"\sum": "∑", r"\prod": "∏",
        r"\int": "∫", r"\iint": "∬", r"\iiint": "∭", r"\oint": "∮",
        r"\partial": "∂", r"\nabla": "∇", r"\infty": "∞",
        r"\pm": "±", r"\mp": "∓", r"\cdot": "·", r"\times": "×",
        r"\div": "÷", r"\circ": "∘", r"\bullet": "•", r"\star": "★",
        r"\oplus": "⊕", r"\otimes": "⊗",
        # Relations
        r"\neq": "≠", r"\ne": "≠", r"\leq": "≤", r"\le": "≤",
        r"\geq": "≥", r"\ge": "≥", r"\ll": "≪", r"\gg": "≫",
        r"\approx": "≈", r"\sim": "∼", r"\simeq": "≃", r"\cong": "≅",
        r"\equiv": "≡", r"\propto": "∝", r"\subset": "⊂", r"\supset": "⊃",
        r"\subseteq": "⊆", r"\supseteq": "⊇", r"\in": "∈", r"\notin": "∉",
        r"\ni": "∋", r"\forall": "∀", r"\exists": "∃", r"\nexists": "∄",
        r"\perp": "⊥", r"\parallel": "∥",
        # Arrows
        r"\to": "→", r"\rightarrow": "→", r"\leftarrow": "←",
        r"\leftrightarrow": "↔", r"\Rightarrow": "⇒", r"\Leftarrow": "⇐",
        r"\Leftrightarrow": "⇔", r"\uparrow": "↑", r"\downarrow": "↓",
        r"\mapsto": "↦", r"\implies": "⟹", r"\iff": "⟺",
        # Misc
        r"\ldots": "…", r"\cdots": "⋯", r"\vdots": "⋮", r"\ddots": "⋱",
        r"\therefore": "∴", r"\because": "∵", r"\angle": "∠",
        r"\triangle": "△", r"\square": "□", r"\diamond": "◇",
        r"\langle": "⟨", r"\rangle": "⟩",
        r"\lceil": "⌈", r"\rceil": "⌉", r"\lfloor": "⌊", r"\rfloor": "⌋",
        r"\emptyset": "∅", r"\varnothing": "∅",
        r"\hbar": "ℏ", r"\ell": "ℓ", r"\Re": "ℜ", r"\Im": "ℑ",
        # Spacing / formatting
        r"\quad": "  ", r"\qquad": "    ", r"\,": " ", r"\;": " ",
        r"\!": "", r"\left": "", r"\right": "", r"\bigl": "", r"\bigr": "",
        r"\Big": "", r"\big": "",
        # Trig / log functions (keep as text)
        r"\sin": "sin", r"\cos": "cos", r"\tan": "tan",
        r"\sec": "sec", r"\csc": "csc", r"\cot": "cot",
        r"\arcsin": "arcsin", r"\arccos": "arccos", r"\arctan": "arctan",
        r"\sinh": "sinh", r"\cosh": "cosh", r"\tanh": "tanh",
        r"\log": "log", r"\ln": "ln", r"\exp": "exp",
        r"\lim": "lim", r"\max": "max", r"\min": "min",
        r"\sup": "sup", r"\inf": "inf", r"\det": "det", r"\dim": "dim",
    }

    def _latex_to_plain_text(self, expression: str) -> str:
        """Convert LaTeX math to readable Unicode plain text."""
        text = expression

        # ── Structural macros (order matters) ────────────────────────────
        # \text{...} → contents
        text = re.sub(r"\\text\{([^}]*)\}", r"\1", text)
        text = re.sub(r"\\textbf\{([^}]*)\}", r"\1", text)
        text = re.sub(r"\\mathrm\{([^}]*)\}", r"\1", text)
        text = re.sub(r"\\mathbf\{([^}]*)\}", r"\1", text)
        text = re.sub(r"\\mathit\{([^}]*)\}", r"\1", text)
        text = re.sub(r"\\mathcal\{([^}]*)\}", r"\1", text)
        text = re.sub(r"\\operatorname\{([^}]*)\}", r"\1", text)
        text = re.sub(r"\\overline\{([^}]*)\}", lambda m: m.group(1) + "\u0305", text)
        text = re.sub(r"\\hat\{([^}]*)\}", lambda m: m.group(1) + "\u0302", text)
        text = re.sub(r"\\vec\{([^}]*)\}", lambda m: m.group(1) + "\u20D7", text)
        text = re.sub(r"\\dot\{([^}]*)\}", lambda m: m.group(1) + "\u0307", text)
        text = re.sub(r"\\ddot\{([^}]*)\}", lambda m: m.group(1) + "\u0308", text)
        text = re.sub(r"\\tilde\{([^}]*)\}", lambda m: m.group(1) + "\u0303", text)
        text = re.sub(r"\\bar\{([^}]*)\}", lambda m: m.group(1) + "\u0304", text)

        # \sqrt{...} → √(...)  and \sqrt[n]{...} → ⁿ√(...)
        text = re.sub(r"\\sqrt\[(\d)\]\{([^}]*)\}", lambda m: m.group(1).translate(self._LATEX_SUPERSCRIPTS) + "√(" + m.group(2) + ")", text)
        text = re.sub(r"\\sqrt\{([^}]*)\}", r"√(\1)", text)

        # \frac{a}{b} → (a)/(b)  — use parens only when multi-char
        def _fmt_frac(m: re.Match) -> str:
            n, d = m.group(1), m.group(2)
            top = f"({n})" if len(n) > 1 else n
            bot = f"({d})" if len(d) > 1 else d
            return f"{top}/{bot}"
        text = re.sub(r"\\frac\{([^}]*)\}\{([^}]*)\}", _fmt_frac, text)

        # \mathbb{X} → double-struck letters
        _bb_map = {c: chr(0x1D538 + ord(c) - ord('A')) for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"}
        _bb_map.update({"R": "ℝ", "N": "ℕ", "Z": "ℤ", "Q": "ℚ", "C": "ℂ"})
        text = re.sub(r"\\mathbb\{([A-Z])\}", lambda m: _bb_map.get(m.group(1), m.group(1)), text)

        # ── Symbol replacements BEFORE super/subscripts (longest match first)
        for cmd, uni in sorted(self._LATEX_SYMBOLS.items(), key=lambda kv: -len(kv[0])):
            text = text.replace(cmd, uni)

        # Superscripts: ^{...} or ^c → Unicode superscript
        def _sup(m: re.Match) -> str:
            return m.group(1).translate(self._LATEX_SUPERSCRIPTS)
        text = re.sub(r"\^{([^}]+)}", _sup, text)
        text = re.sub(r"\^(\w)", _sup, text)

        # Subscripts: _{...} or _c → Unicode subscript
        def _sub(m: re.Match) -> str:
            return m.group(1).translate(self._LATEX_SUBSCRIPTS)
        text = re.sub(r"_\{([^}]+)}", _sub, text)
        text = re.sub(r"_(\w)", _sub, text)

        # ── Cleanup ──────────────────────────────────────────────────────
        text = text.replace("{", "").replace("}", "")
        # Remove stray backslashes (from unknown commands)
        text = re.sub(r"\\([a-zA-Z]+)", r"\1", text)
        text = re.sub(r"\\", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    def _sanitize_generated_code(self, code: str) -> str:
        """
        Rewrite risky MathTex/Tex expressions into safe Text fallbacks when they contain
        non-ASCII language content that standard LaTeX in the container cannot compile.
        """
        # Match MathTex(r'...') or MathTex(r'...', extra_args) — the (?:,[^)]+)?
        # allows optional trailing arguments such as `color=MAUVE_COLOR`.
        pattern = re.compile(r"(MathTex|Tex)\(r([\"'])(.*?)\2(?:,[^)]+)?\)")

        def replace(match: re.Match) -> str:
            expression = match.group(3)
            has_non_ascii = any(ord(char) > 127 for char in expression)
            has_natural_language_label = r"\text{" in expression
            if not has_non_ascii and not has_natural_language_label:
                return match.group(0)

            safe_text = self._latex_to_plain_text(expression)
            return f'Text(r"""{safe_text}""", font_size=40, color=MAUVE_COLOR)'

        return pattern.sub(replace, code)
