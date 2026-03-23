"""
Video Scripting Engine
Generates "Director JSON" for programmatically rendering videos.
Uses DeepSeek to generate Manim-compatible animation scripts for all content types.
"""

import logging
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from services.api_client import APIClient
from core.modules.robust_video_generation import RobustVideoGenerationPipeline

logger = logging.getLogger(__name__)

@dataclass
class Scene:
    id: str
    duration: float
    narration: str
    action: str  # plot, write_tex, draw_shape, show_text, etc.
    param: str   # content to render
    visual_type: str = "manim"  # always manim
    canvas_config: Dict[str, Any] = field(default_factory=dict)
    audio_path: Optional[str] = None

@dataclass
class VideoScript:
    title: str
    scenes: List[Scene]
    total_duration: float
    engine: str = "manim"
    debug_artifacts: Dict[str, Any] = field(default_factory=dict)

class VideoScriptGenerator:
    """Generates programmable Manim video scripts from lesson content"""
    
    def __init__(self):
        self.api_client = APIClient()
        self.robust_pipeline = RobustVideoGenerationPipeline(self.api_client)
    
    async def generate_script(
        self,
        topic: str,
        content: str,
        style: str = "general",
        language: str = "en",
        student_level: str = "beginner",
        target_audience: str = "students",
        duration_minutes: int = 10,
        custom_requirements: Optional[str] = None,
    ) -> VideoScript:
        """
        Generate a Manim director script for the given content.
        style: 'math' for equation-heavy content, anything else for general explanations.
        All styles render via Manim.
        """

        import time
        start_time = time.time()
        logger.info(f"🎬 [Script] Generating video script for: '{topic}' | Style: {style} | Lang: {language}")
        
        try:
            generation_bundle = await self.robust_pipeline.build_generation_bundle(
                topic=topic,
                content=content,
                style=style,
                language=language,
                student_level=student_level,
                target_audience=target_audience,
                duration_minutes=duration_minutes,
                custom_requirements=custom_requirements,
            )

            duration = time.time() - start_time
            logger.info(f"✅ [Script] DeepSeek generation complete in {duration:.2f}s")

            return self._convert_to_video_script(
                generation_bundle.get("render_plan") or {},
                debug_artifacts=generation_bundle,
            )
            
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"❌ [Script] Generation failed after {duration:.2f}s: {e}")
            logger.warning("⚠️ [Script] Falling back to deterministic syllabus-based script generation")
            generation_bundle = await self.robust_pipeline.build_generation_bundle(
                topic=topic,
                content=content,
                style=style,
                language=language,
                student_level=student_level,
                target_audience=target_audience,
                duration_minutes=duration_minutes,
                custom_requirements=custom_requirements,
            )
            return self._convert_to_video_script(
                generation_bundle.get("render_plan") or {},
                debug_artifacts=generation_bundle,
            )

    def _generate_mock_script(self, topic: str, style: str) -> VideoScript:
        """Generate a guaranteed valid mock script when API fails"""
        title = f"{topic} (Demo)"
        scenes = []
        
        # Scene 1: Title
        scenes.append(Scene(
            id="s1",
            duration=4.0,
            narration=f"Welcome to this lesson on {topic}.",
            action="write_tex",
            param=topic,
            visual_type="manim"
        ))
        
        # Scene 2: Explanation
        scenes.append(Scene(
            id="s2", 
            duration=6.0,
            narration=f"In this video, we will explore the core concepts of {topic}.",
            action="show_text", 
            param=f"Understanding {topic}",
            visual_type="manim"
        ))
        
        # Scene 3: Visual
        if style == "math":
            scenes.append(Scene(
                id="s3",
                duration=5.0,
                narration="Let's look at the mathematical representation.",
                action="plot",
                param="sin(x)",
                visual_type="manim"
            ))
        else:
            scenes.append(Scene(
                id="s3",
                duration=5.0,
                narration="Let's visualize this concept.",
                action="show_text",
                param=f"Key concepts: {topic}",
                visual_type="manim"
            ))
            
        # Scene 4: Conclusion
        scenes.append(Scene(
            id="s4",
            duration=4.0,
            narration="Thanks for watching MentorMind.",
            action="show_text",
            param="MentorMind AI",
            visual_type="manim"
        ))
        
        return VideoScript(
            title=title,
            scenes=scenes,
            total_duration=19.0,
            engine="manim"
        )

    def _convert_to_video_script(self, data: Dict, debug_artifacts: Optional[Dict[str, Any]] = None) -> VideoScript:
        scenes = []
        total_duration = 0.0
        
        max_scenes = 18
        for s in data.get("scenes", [])[:max_scenes]:
            scene = Scene(
                id=s.get("id", f"s_{len(scenes)}"),
                duration=float(s.get("duration", 5.0)),
                narration=s.get("narration", ""),
                action=s.get("action", "show_text"),
                param=s.get("param", ""),
                visual_type="manim",  # Always manim, ignore whatever the LLM says
                canvas_config=s.get("canvas_config", {})
            )
            scenes.append(scene)
            total_duration += scene.duration
            
        return VideoScript(
            title=data.get("title", "Untitled Lesson"),
            scenes=scenes,
            total_duration=total_duration,
            engine="manim",
            debug_artifacts=debug_artifacts or {},
        )
