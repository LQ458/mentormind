"""
Manim Renderer Service
Renders mathematical animations using the Manim engine.
Translates "Director JSON" scenes into executable Manim Python code.
"""

import os
import logging
import re
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
        
    async def render_script(self, script: Any) -> str:
        """
        Render a full video script using Manim with Self-Correction.
        Returns the path to the final video file.
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
                uv_manim = "/Users/LeoQin/Documents/GitHub/mentormind/backend/.venv/bin/manim"
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
        """Check if LaTeX standalone class is available"""
        try:
            subprocess.run(
                ["kpsewhich", "standalone.cls"], 
                check=True, 
                stdout=subprocess.DEVNULL, 
                stderr=subprocess.DEVNULL
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.warning("LaTeX 'standalone.cls' not found. Falling back to Text renderer.")
            return False

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
            "        return '\\n'.join([text[i:i+width] for i in range(0, len(text), width)])",
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
                code.append(f"        ax = Axes(")
                code.append(f"            x_range={x_range},")
                code.append(f"            y_range={y_range},")
                code.append(f"            axis_config={{\"color\": ACCENT_COLOR}},")
                code.append(f"        )")
                code.append(f"        ax.set_color(ACCENT_COLOR)")
                code.append(f"        curve = ax.plot(lambda x: {scene.param}, color=YELLOW_COLOR)")
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
                    clean_text = scene.param.replace('^2', '²').replace('^3', '³').replace('_', '').replace('\\', '').replace('text', '')
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
                    display_text = scene.param or scene.narration
                    code.append(f'        text = Text(self.compact_text(r"""{display_text}""", max_chars=72), font_size={font_size}, color={primary_col})')
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
                bullets = self._extract_bullets(raw_param, layout.get('max_chars', 72))
                if len(bullets) > 1:
                    # Progressive bullet animation
                    bullet_list_repr = repr(bullets)
                    code.append(f"        self.animate_bullets({bullet_list_repr}, {scene.duration}, font_size={font_size})")
                    code.append(f"        self.wait(0.4)")
                    code.append(f"        self.clear()")
                else:
                    display_text = self._compact_for_code(raw_param, layout.get('max_chars', 72))
                    code.append(f'        text = Text(self.wrap_text(r"""{display_text}""", width=42), font_size={font_size}, color={primary_col})')
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
                fallback_text = self._compact_for_code(scene.param or scene.narration, layout.get('max_chars', 72))
                code.append(f'        text = Text(self.wrap_text(r"""{fallback_text}""", width=42), font_size={font_size}, color={primary_col})')
                code.append(f"        text.scale({safe_scale})")
                code.append(f"        self.animate_with_audio(text, {scene.duration})")
                code.append(f"        self.play(FadeOut(text), run_time=0.4)")
                
        return "\n".join(code)

    def _extract_bullets(self, text: str, max_chars: int) -> List[str]:
        """
        B: Parse a bullet-list string into individual items.
        Recognises lines starting with -, •, *, or numbered (1.).
        Returns the list only if there are 2+ bullets; otherwise returns [text].
        """
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        bullets = []
        bullet_re = re.compile(r'^[-•*]\s+|^\d+[.)]\s+')
        for line in lines:
            if bullet_re.match(line):
                cleaned = bullet_re.sub("", line).strip()
                # Compact each bullet independently
                if len(cleaned) > max_chars:
                    cleaned = cleaned[:max_chars - 3] + "..."
                bullets.append(cleaned)
        if len(bullets) >= 2:
            return bullets
        return [self._compact_for_code(text, max_chars)]

    def _compact_for_code(self, text: str, max_chars: int) -> str:
        """Compact text and escape triple-quote issues for safe embedding in code."""
        clean = re.sub(r"\s+", " ", str(text or "")).strip()
        if len(clean) > max_chars:
            clean = clean[:max_chars - 3] + "..."
        # Escape triple quotes that would break the generated f-string
        clean = clean.replace('"""', "'\"\"")
        return clean

    def _latex_to_plain_text(self, expression: str) -> str:
        """Best-effort conversion from simple LaTeX-ish math strings to plain text."""
        text = expression
        text = re.sub(r"\\text\{([^}]*)\}", r"\1", text)
        text = re.sub(r"\\frac\{([^}]*)\}\{([^}]*)\}", r"(\1)/(\2)", text)
        replacements = {
            r"\quad": " ",
            r"\neq": "≠",
            r"\leq": "≤",
            r"\geq": "≥",
            r"\cdot": "·",
            r"\times": "×",
            r"\to": "→",
            r"\Rightarrow": "⇒",
            r"\left": "",
            r"\right": "",
            "{": "",
            "}": "",
            "\\": "",
        }
        for source, target in replacements.items():
            text = text.replace(source, target)
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
