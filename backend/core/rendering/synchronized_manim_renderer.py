"""
Enhanced Synchronized Manim Renderer
- Audio-Video Synchronization
- Advanced Layout Management
- External Image Integration
- Educational Design Principles
"""

import os
import logging
import subprocess
import time
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

from core.rendering.manim_renderer import ManimService, THEME, PREFERRED_FONT, HEADING_FONT
from core.rendering.layout_manager import EducationalLayoutManager, create_educational_layout, ContentType
from services.siliconflow_tts import SiliconFlowTTSService
from services.image_sources import get_educational_images, ImageSource

logger = logging.getLogger(__name__)


class AudioTimingInfo:
    """Container for audio timing information"""
    def __init__(self, duration: float, audio_file: str, text: str):
        self.duration = duration
        self.audio_file = audio_file
        self.text = text


class SynchronizedManimRenderer(ManimService):
    """
    Enhanced Manim renderer with:
    - Perfect audio-video synchronization
    - Advanced layout management
    - External image integration
    - Educational design principles
    """
    
    def __init__(self):
        super().__init__()
        self.tts_service = SiliconFlowTTSService()
        self.layout_manager = EducationalLayoutManager()
        
        # Create directories
        self.audio_dir = os.path.join(self.output_dir, "audio")
        self.image_dir = os.path.join(self.output_dir, "images")
        os.makedirs(self.audio_dir, exist_ok=True)
        os.makedirs(self.image_dir, exist_ok=True)
        
        # Cache for educational images
        self.image_cache: Dict[str, List[ImageSource]] = {}
        
    async def render_script_with_sync(self, script: Any) -> str:
        """
        Render video script with perfect audio-video synchronization,
        advanced layout, and educational images
        """
        start_time = time.time()
        logger.info(f"🎬 [SyncRender] Starting enhanced render for: '{script.title}'")
        
        # Step 1: Pre-fetch educational images for the topic
        await self._preload_educational_images(script)
        
        # Step 2: Pre-generate all audio with timing analysis
        audio_timings = await self._pregenerate_audio_timing(script)
        
        # Step 3: Update scene durations based on actual audio
        synchronized_script = self._synchronize_scene_durations(script, audio_timings)
        
        # Step 4: Generate enhanced Manim code with layout and images
        manim_code = self._generate_enhanced_manim_code(synchronized_script, audio_timings)
        
        # Step 5: Render with all integrations
        video_path = await self._render_with_audio(synchronized_script, manim_code, audio_timings)
        
        duration = time.time() - start_time
        logger.info(f"✅ [SyncRender] Enhanced render complete in {duration:.2f}s")
        
        return video_path
    
    async def _preload_educational_images(self, script: Any) -> None:
        """
        Pre-load relevant educational images for the script topic
        """
        try:
            topic = script.title
            logger.info(f"🖼️  [SyncRender] Pre-loading images for topic: '{topic}'")
            
            # Extract context from scene narrations
            context_words = []
            for scene in script.scenes[:3]:  # Sample first few scenes
                if scene.narration:
                    words = scene.narration.split()
                    context_words.extend(word.lower() for word in words if len(word) > 4)
            
            context = " ".join(context_words[:20])  # Limit context
            
            # Fetch relevant images
            images = await get_educational_images(topic, context, max_images=3)
            self.image_cache[topic] = images
            
            logger.info(f"📥 [SyncRender] Cached {len(images)} images for '{topic}'")
            
        except Exception as e:
            logger.warning(f"⚠️  [SyncRender] Image preloading failed: {e}")
            self.image_cache[script.title] = []
    
    async def _pregenerate_audio_timing(self, script: Any) -> Dict[str, AudioTimingInfo]:
        """
        Pre-generate all audio files and analyze their timing
        """
        audio_timings = {}
        
        logger.info(f"🎤 [SyncRender] Pre-generating audio for {len(script.scenes)} scenes")
        
        # Generate audio for each scene in parallel
        audio_tasks = []
        for scene in script.scenes:
            if scene.narration and scene.narration.strip():
                task = self._generate_scene_audio(scene)
                audio_tasks.append((scene.id, task))
        
        # Wait for all audio generation to complete
        for scene_id, task in audio_tasks:
            try:
                audio_info = await task
                audio_timings[scene_id] = audio_info
                logger.info(f"🎵 [SyncRender] Audio ready for scene {scene_id}: {audio_info.duration:.2f}s")
            except Exception as e:
                logger.warning(f"⚠️ [SyncRender] Audio generation failed for scene {scene_id}: {e}")
                # Create silent timing placeholder
                audio_timings[scene_id] = AudioTimingInfo(
                    duration=5.0,  # Default duration
                    audio_file="",
                    text=script.scenes[[s.id for s in script.scenes].index(scene_id)].narration
                )
        
        return audio_timings
    
    async def _generate_scene_audio(self, scene: Any) -> AudioTimingInfo:
        """
        Generate audio for a single scene and measure its duration
        """
        try:
            # Generate audio using TTS
            audio_result = await self.tts_service.text_to_speech(
                text=scene.narration,
                voice_id="anna",  # Default voice
                language="en"
            )
            
            if not audio_result.success:
                raise Exception(f"TTS generation failed: {audio_result.error}")
            
            # Save audio file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            audio_filename = f"scene_{scene.id}_{timestamp}.wav"
            audio_path = os.path.join(self.audio_dir, audio_filename)
            
            # Write audio data to file
            with open(audio_path, 'wb') as f:
                f.write(audio_result.audio_data)
            
            # Measure actual audio duration
            duration = self._measure_audio_duration(audio_path)
            
            return AudioTimingInfo(
                duration=duration,
                audio_file=audio_path,
                text=scene.narration
            )
            
        except Exception as e:
            logger.error(f"Audio generation failed for scene {scene.id}: {e}")
            raise
    
    def _measure_audio_duration(self, audio_path: str) -> float:
        """
        Measure the actual duration of an audio file
        """
        try:
            import librosa
            y, sr = librosa.load(audio_path)
            duration = len(y) / sr
            return float(duration)
        except ImportError:
            # Fallback to ffprobe if librosa not available
            try:
                result = subprocess.run([
                    'ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                    '-of', 'csv=p=0', audio_path
                ], capture_output=True, text=True)
                
                if result.returncode == 0:
                    return float(result.stdout.strip())
                else:
                    raise Exception("ffprobe failed")
            except:
                # Final fallback: estimate based on text
                words = len(audio_path.split())
                return max(3.0, words * 0.5)  # 120 WPM estimate
    
    def _synchronize_scene_durations(self, script: Any, audio_timings: Dict[str, AudioTimingInfo]) -> Any:
        """
        Update scene durations to match actual audio durations
        """
        synchronized_scenes = []
        
        for scene in script.scenes:
            audio_info = audio_timings.get(scene.id)
            
            if audio_info:
                # Use actual audio duration with small buffer for animation
                new_duration = audio_info.duration + 0.5  # 500ms buffer
                scene.duration = new_duration
                
                logger.debug(f"Scene {scene.id} duration synchronized: {new_duration:.2f}s")
            
            synchronized_scenes.append(scene)
        
        # Return updated script object (preserving original structure)
        script.scenes = synchronized_scenes
        script.total_duration = sum(getattr(s, 'duration', 0) for s in synchronized_scenes)
        return script
    
    def _generate_enhanced_manim_code(self, script: Any, audio_timings: Dict[str, AudioTimingInfo]) -> str:
        """
        Generate enhanced Manim code with:
        - Audio synchronization
        - Advanced layout management
        - Educational images
        - Structured content presentation
        """
        # Theme colors
        bg = THEME["BG"]
        accent = THEME["ACCENT"]
        text_col = THEME["TEXT"]
        heading = THEME["HEADING"]
        green = THEME["GREEN"]
        peach = THEME["PEACH"]
        yellow = THEME["YELLOW"]
        mauve = THEME["MAUVE"]
        red_col = THEME["RED"]
        pf = PREFERRED_FONT
        hf = HEADING_FONT
        
        # Get cached images for this topic
        topic_images = self.image_cache.get(script.title, [])
        
        code = [
            "from manim import *",
            "import numpy as np",
            "from math import *",
            "import os",
            "from PIL import Image as PILImage",
            "",
            "class LessonScene(Scene):",
            f"    def __init__(self, **kwargs):",
            f"        super().__init__(**kwargs)",
            f"        self.camera.background_color = '{bg}'",
            "",
            "    def construct(self):",
        ]
        
        # Add image loading if available
        if topic_images:
            code.extend([
                "        # Load educational images",
                f"        educational_images = []"
            ])
            for i, img in enumerate(topic_images[:3]):  # Limit to 3 images
                if img.local_path and os.path.exists(img.local_path):
                    code.append(f"        img_{i} = ImageMobject('{img.local_path}').scale(0.5)")
                    code.append(f"        educational_images.append(img_{i})")
            code.append("")
        
        # Generate enhanced scene code
        for i, scene in enumerate(script.scenes):
            audio_info = audio_timings.get(scene.id)
            scene_code = self._generate_enhanced_scene_code(scene, audio_info, i, topic_images)
            code.extend([f"        {line}" for line in scene_code.split('\n') if line.strip()])
            code.append("")
        
        return '\n'.join(code)
    
    def _generate_enhanced_scene_code(self, scene: Any, audio_info: Optional[AudioTimingInfo], scene_index: int, topic_images: List[ImageSource]) -> str:
        """
        Generate enhanced Manim code with advanced layout and educational elements
        """
        # Determine content type and create layout
        content = scene.param or scene.narration or ""
        layout_data = create_educational_layout(content)
        
        # Generate layout-aware visual elements
        visual_code = self._create_enhanced_visual_elements(scene, layout_data, scene_index, topic_images)
        
        # Audio synchronization
        if audio_info and audio_info.audio_file and os.path.exists(audio_info.audio_file):
            sync_code = f"""
# Enhanced Scene {scene.id} with audio sync and advanced layout
audio_file = "{audio_info.audio_file}"
audio_duration = {audio_info.duration:.2f}

{visual_code}

# Synchronize animation with audio
if os.path.exists(audio_file):
    # Add audio to scene
    self.add_sound(audio_file)
    
    # Time visual animations to match audio
    animation_duration = audio_duration
    
    # Enhanced animations with layout awareness
    {self._get_enhanced_animation_code(scene, layout_data, 'animation_duration')}
    
    # Hold for remaining audio time
    remaining_time = max(0, audio_duration - animation_duration * 0.7)
    if remaining_time > 0:
        self.wait(remaining_time)
else:
    # Fallback without audio but with enhanced layout
    {self._get_enhanced_animation_code(scene, layout_data, scene.duration)}
    self.wait({scene.duration:.2f})
"""
        else:
            # No audio - use enhanced layout with regular timing
            sync_code = f"""
# Enhanced Scene {scene.id} with advanced layout
{visual_code}
{self._get_enhanced_animation_code(scene, layout_data, scene.duration)}
self.wait({scene.duration:.2f})
"""
        
        return sync_code
    
    def _create_enhanced_visual_elements(self, scene: Any, layout_data: Dict[str, Any], scene_index: int, topic_images: List[ImageSource]) -> str:
        """Create enhanced visual elements with precise positioning and images"""
        code_lines = []
        
        # Add educational images if available and relevant
        if topic_images and scene_index < len(topic_images):
            image = topic_images[scene_index % len(topic_images)]
            if image.local_path and os.path.exists(image.local_path):
                code_lines.extend([
                    f"# Educational image for context",
                    f"bg_image = ImageMobject('{image.local_path}').scale(0.4).set_opacity(0.3)",
                    f"bg_image.move_to(RIGHT * 4 + UP * 2)",  # Top right corner
                    f"self.add(bg_image)"
                ])
        
        # Generate positioned elements based on layout
        for i, element in enumerate(layout_data.get("elements", [])):
            var_name = f"element_{i}"
            content = element["content"].replace('"', '\\"')  # Escape quotes
            
            # Convert layout coordinates to Manim coordinates
            manim_x = (element["position"]["x"] - 960) / 200  # Scale and center
            manim_y = (540 - element["position"]["y"]) / 200  # Flip Y and scale
            
            font_size = element.get("font_size", 36)
            color = element.get("color", "#FFFFFF")
            
            if element.get("is_latex", False):
                code_lines.extend([
                    f"try:",
                    f"    {var_name} = MathTex(r'{content}', font_size={font_size}, color='{color}')",
                    f"except:",
                    f"    {var_name} = Text('{content}', font_size={font_size}, color='{color}')",
                ])
            else:
                code_lines.append(f"{var_name} = Text('{content}', font_size={font_size}, color='{color}')")
            
            code_lines.append(f"{var_name}.move_to([{manim_x:.2f}, {manim_y:.2f}, 0])")
        
        return '\n'.join(code_lines)
    
    def _get_enhanced_animation_code(self, scene: Any, layout_data: Dict[str, Any], duration_var: str) -> str:
        """Generate enhanced animation code based on layout"""
        elements = layout_data.get("elements", [])
        
        if not elements:
            return f"self.wait({duration_var})"
        
        # Different animation strategies based on layout type
        layout_type = layout_data.get("layout_type", "default")
        
        if layout_type == "problem_solution":
            return f"""
# Animate problem first, then solutions
problem_elements = [element_i for i, element_i in enumerate([{''.join(f'element_{i}' for i in range(len(elements)))}]) if 'problem' in locals()]
solution_elements = [element_i for i, element_i in enumerate([{''.join(f'element_{i}' for i in range(len(elements)))}]) if 'solution' in locals()]

if problem_elements:
    self.play(*[FadeIn(elem) for elem in problem_elements], run_time={duration_var} * 0.3)
    self.wait({duration_var} * 0.2)

if solution_elements:
    for i, elem in enumerate(solution_elements):
        self.play(FadeIn(elem), run_time={duration_var} * 0.1)
        self.wait({duration_var} * 0.1)
"""
        else:
            # Default sequential animation
            animation_code = []
            for i in range(len(elements)):
                if scene.action == "write_tex":
                    animation_code.append(f"self.play(Write(element_{i}), run_time={duration_var} * 0.3)")
                else:
                    animation_code.append(f"self.play(FadeIn(element_{i}), run_time={duration_var} * 0.2)")
            
            return '\n'.join(animation_code) if animation_code else f"self.wait({duration_var})"
    
    def _create_visual_element_code(self, scene: Any) -> str:
        """Generate code for creating visual elements"""
        action = scene.action
        param = scene.param
        
        if action == "show_title":
            return f"""
title_text = Text("{param}", font="{HEADING_FONT}", font_size=48, color="{THEME['HEADING']}")
title_text.move_to(ORIGIN)
visual_element = title_text
"""
        elif action == "show_text":
            return f"""
main_text = Text("{param}", font="{PREFERRED_FONT}", font_size=36, color="{THEME['TEXT']}")
main_text.move_to(ORIGIN)
visual_element = main_text
"""
        elif action == "write_tex":
            return f"""
try:
    tex_element = MathTex("{param}", font_size=40, color="{THEME['MAUVE']}")
    tex_element.move_to(ORIGIN)
    visual_element = tex_element
except:
    # Fallback to text if LaTeX fails
    fallback_text = Text("{param}", font="{PREFERRED_FONT}", font_size=36, color="{THEME['TEXT']}")
    fallback_text.move_to(ORIGIN)
    visual_element = fallback_text
"""
        elif action == "plot":
            return f"""
try:
    axes = Axes(x_range=[-3, 3, 1], y_range=[-2, 2, 1], 
                x_length=6, y_length=4, 
                axis_config={{"color": "{THEME['TEXT']}"}})
    axes.move_to(ORIGIN)
    
    # Parse and plot function
    func_str = "{param}".replace("^", "**")
    plot = axes.plot(lambda x: eval(func_str, {{"x": x, "sin": sin, "cos": cos, "tan": tan, "exp": exp, "log": log}}), 
                    color="{THEME['ACCENT']}")
    
    visual_element = VGroup(axes, plot)
except:
    # Fallback to text description
    fallback_text = Text(f"Graph: {param}", font="{PREFERRED_FONT}", font_size=32, color="{THEME['TEXT']}")
    fallback_text.move_to(ORIGIN)
    visual_element = fallback_text
"""
        else:
            return f"""
default_text = Text("{param}", font="{PREFERRED_FONT}", font_size=32, color="{THEME['TEXT']}")
default_text.move_to(ORIGIN)
visual_element = default_text
"""
    
    def _get_animation_code(self, scene: Any, duration_var: str) -> str:
        """Generate animation code for the scene"""
        action = scene.action
        
        if action in ["show_title", "show_text"]:
            return f"self.play(FadeIn(visual_element), run_time={duration_var} * 0.3)"
        elif action == "write_tex":
            return f"self.play(Write(visual_element), run_time={duration_var} * 0.5)"
        elif action == "plot":
            return f"""
self.play(Create(visual_element[0]), run_time={duration_var} * 0.3)  # Axes
self.play(Create(visual_element[1]), run_time={duration_var} * 0.5)  # Plot
"""
        else:
            return f"self.play(FadeIn(visual_element), run_time={duration_var} * 0.4)"
    
    async def _render_with_audio(self, script: Any, manim_code: str, audio_timings: Dict[str, AudioTimingInfo]) -> str:
        """
        Render the Manim scene with integrated audio
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        script_path = os.path.join(self.output_dir, f"sync_scene_{timestamp}.py")
        
        # Write synchronized Manim code
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(manim_code)
        
        try:
            # Render with Manim
            uv_manim = "/Users/LeoQin/Documents/GitHub/mentormind/backend/.venv/bin/manim"
            cmd = [
                uv_manim,
                f"-q{self.render_quality}",
                "--media_dir", self.output_dir,
                "--disable_caching",  # Important for audio sync
                script_path,
                "LessonScene"
            ]
            
            logger.info(f"🎬 [SyncRender] Executing synchronized render: {' '.join(cmd)}")
            
            result = await asyncio.to_thread(
                subprocess.run,
                cmd,
                check=True,
                capture_output=True,
                text=True,
                env={**os.environ, "PATH": os.environ["PATH"]},
                timeout=self.render_timeout_seconds
            )
            
            # Find output video
            video_root = Path(self.output_dir) / "videos" / f"sync_scene_{timestamp}"
            video_matches = sorted(video_root.rglob("LessonScene.mp4"))
            
            if not video_matches:
                raise Exception(f"No output video found in {video_root}")
            
            video_path = str(video_matches[0])
            
            # Validate audio-video synchronization
            sync_validation = await self._validate_av_synchronization(video_path, audio_timings)
            
            if not sync_validation["is_synchronized"]:
                logger.warning(f"⚠️ [SyncRender] Sync validation failed: {sync_validation}")
            
            file_size_mb = os.path.getsize(video_path) / (1024 * 1024)
            logger.info(f"✅ [SyncRender] Synchronized video ready | Size: {file_size_mb:.2f}MB | Path: {video_path}")
            
            return video_path
            
        except subprocess.CalledProcessError as e:
            logger.error(f"❌ [SyncRender] Render failed: {e.stderr}")
            raise Exception(f"Synchronized render failed: {e.stderr}")
    
    async def _validate_av_synchronization(self, video_path: str, audio_timings: Dict[str, AudioTimingInfo]) -> Dict[str, Any]:
        """
        Validate that audio and video are properly synchronized
        """
        try:
            # Get video duration using ffprobe
            result = subprocess.run([
                'ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                '-of', 'csv=p=0', video_path
            ], capture_output=True, text=True)
            
            if result.returncode != 0:
                return {"is_synchronized": False, "error": "Could not measure video duration"}
            
            video_duration = float(result.stdout.strip())
            expected_duration = sum(timing.duration for timing in audio_timings.values())
            
            # Allow 5% tolerance
            duration_diff = abs(video_duration - expected_duration)
            tolerance = expected_duration * 0.05
            
            is_synchronized = duration_diff <= tolerance
            
            return {
                "is_synchronized": is_synchronized,
                "video_duration": video_duration,
                "expected_duration": expected_duration,
                "duration_difference": duration_diff,
                "tolerance": tolerance
            }
            
        except Exception as e:
            return {
                "is_synchronized": False,
                "error": str(e)
            }


# Integration function for existing video scripting
async def render_with_perfect_sync(script: Any) -> str:
    """
    Render video script with perfect audio-video synchronization
    """
    renderer = SynchronizedManimRenderer()
    return await renderer.render_script_with_sync(script)


if __name__ == "__main__":
    # Test the synchronized renderer
    async def test_sync_render():
        from core.modules.video_scripting import Scene, VideoScript
        
        test_scenes = [
            Scene(
                id="intro",
                duration=5.0,
                narration="Welcome to this mathematics lesson.",
                action="show_title",
                param="Mathematics Lesson",
                visual_type="manim"
            ),
            Scene(
                id="content",
                duration=8.0,
                narration="Today we will learn about quadratic functions and their properties.",
                action="write_tex",
                param="f(x) = ax^2 + bx + c",
                visual_type="manim"
            )
        ]
        
        test_script = VideoScript(
            title="Test Synchronized Video",
            scenes=test_scenes,
            total_duration=13.0,
            engine="manim"
        )
        
        renderer = SynchronizedManimRenderer()
        result = await renderer.render_script_with_sync(test_script)
        print(f"Test render complete: {result}")
    
    asyncio.run(test_sync_render())