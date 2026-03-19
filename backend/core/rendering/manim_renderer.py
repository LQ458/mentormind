"""
Manim Renderer Service
Renders mathematical animations using the Manim engine.
Translates "Director JSON" scenes into executable Manim Python code.
"""

import os
import logging
import subprocess
from typing import List, Dict, Optional
from datetime import datetime
from config.config import config
from core.modules.video_scripting import Scene, VideoScript

logger = logging.getLogger(__name__)

class ManimService:
    """Service for rendering Manim animations"""
    
    def __init__(self):
        self.output_dir = os.path.join(config.DATA_DIR, "videos", "manim")
        os.makedirs(self.output_dir, exist_ok=True)
        
    async def render_script(self, script: VideoScript) -> str:
        """
        Render a full video script using Manim with Self-Correction.
        Returns the path to the final video file.
        """

        import time
        import asyncio
        start_time = time.time()
        logger.info(f"📐 [Manim] Starting render for: '{script.title}'")
        
        # 1. Generate Python code for Manim
        manim_code = self._generate_manim_code(script)
        
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
                # -qm: Medium quality, -o: Output filename
                # Run in thread to avoid blocking asyncio loop
                cmd = [
                    "manim", 
                    "-qm", 
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
                    timeout=300
                )
                
                # Find output file (Manim standard output structure)
                # media_dir/videos/scene_timestamp_attempt/720p30/LessonScene.mp4
                video_subpath = f"videos/scene_{timestamp}_{attempt}/720p30/LessonScene.mp4" 
                video_path = os.path.join(self.output_dir, video_subpath)
                
                if os.path.exists(video_path):
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
                            manim_code = new_code
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
        client = APIClient()
        
        prompt = f"""
        You are a Manim (Python) Expert. The following code failed to render.
        
        ERROR LOG:
        {error_log}
        
        BROKEN CODE:
        ```python
        {broken_code}
        ```
        
        TASK:
        Fix the code to resolve the error. 
        - Return ONLY the full corrected Python code.
        - Do not output markdown backticks.
        - Do not explain.
        """
        
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

    def _generate_manim_code(self, script: VideoScript) -> str:
        """Generate the Python code string for the Manim scene"""
        
        has_latex = self._check_latex_availability()
        
        code = [
            "from manim import *",
            "import numpy as np",
            "from math import *",
            "",
            "class LessonScene(Scene):",
            "    def wrap_text(self, text, width=40):",
            "        return '\\n'.join([text[i:i+width] for i in range(0, len(text), width)])",
            "",
            "    def construct(self):",
            "        # Global config",
            "        Text.set_default(font='Arial')",
            ""
        ]
        
        for scene in script.scenes:
            # Note: We process ALL scenes if sent to Manim, regardless of visual_type tag
            # to ensure we don't produce empty videos.

            code.append(f"        # Scene: {scene.id}")
            if scene.audio_path:
                # Use raw string for paths to handle backslashes on Windows if needed
                code.append(f"        self.add_sound(r'{scene.audio_path}')")
            
            # Action Mapping
            if scene.action == "plot":
                # param: "sin(x)"
                code.append(f"        ax = Axes(x_range=[-3, 3], y_range=[-2, 2])")
                code.append(f"        curve = ax.plot(lambda x: {scene.param}, color=BLUE)")
                code.append(f"        self.play(Create(ax), Create(curve), run_time={scene.duration})")
                code.append(f"        self.wait(1)")
                
            elif scene.action == "write_tex":
                # param: "E = mc^2"
                # Defensive check: Standard LaTeX MathTex fails on non-ASCII characters (Chinese)
                has_non_ascii = any(ord(c) > 127 for c in scene.param)
                
                if has_latex and not has_non_ascii:
                    code.append(f"        eq = MathTex(r'{scene.param}')")
                else:
                    # Fallback to Text if non-ASCII is present or LaTeX is missing
                    # Standard math symbols replacement for plain Text fallback
                    clean_text = scene.param.replace('^2', '²').replace('^3', '³').replace('_', '').replace('\\', '').replace('text', '')
                    code.append(f"        eq = Text(r\"\"\"{clean_text}\"\"\", font_size=40)")
                    
                code.append(f"        self.play(Write(eq), run_time={scene.duration})")
                code.append(f"        self.wait(1)")
                # Clear for next scene if needed
                code.append(f"        self.clear()")
                
            elif scene.action == "draw_shape":
                if "circle" in scene.param.lower():
                    code.append(f"        shape = Circle(color=RED)")
                elif "square" in scene.param.lower():
                    code.append(f"        shape = Square(color=GREEN)")
                else:
                    code.append(f"        shape = Square(color=WHITE)")
                    
                code.append(f"        self.play(Create(shape), run_time={scene.duration})")
                code.append(f"        self.wait(1)")
                code.append(f"        self.clear()")
            
            elif scene.action == "show_title":
                # Big title text
                code.append(f"        title = Text(r\"\"\"{scene.param}\"\"\", font_size=64, color=BLUE)")
                code.append(f"        self.play(Write(title), run_time={scene.duration})")
                code.append(f"        self.wait(1)")
                code.append(f"        self.clear()")

            elif scene.action == "show_image":
                # Fallback for images in Manim (until we have real image loading)
                # Show text indicating image
                code.append(f"        text = Text(r\"\"\"[Image: {scene.param}]\"\"\", font_size=36, color=YELLOW)")
                code.append(f"        self.play(FadeIn(text), run_time={scene.duration})")
                code.append(f"        self.wait(1)")
                code.append(f"        self.clear()")

            else:
                # Default text
                # Default text with helper wrapping
                code.append(f"        text = Text(self.wrap_text(r\"\"\"{scene.narration}\"\"\"), font_size=24)")
                code.append(f"        self.play(Write(text), run_time={scene.duration})")
                code.append(f"        self.wait(1)")
                code.append(f"        self.clear()")
                
        return "\n".join(code)
