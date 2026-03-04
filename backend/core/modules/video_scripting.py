"""
Video Scripting Engine
Generates "Director JSON" for programmatically rendering videos.
Uses DeepSeek-R1 to infer visual structure from teaching concepts.
"""

import json
import logging
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from services.api_client import APIClient

logger = logging.getLogger(__name__)

@dataclass
class Scene:
    id: str
    duration: float
    narration: str
    action: str  # plot, write_tex, draw_shape, show_image, etc.
    param: str   # content to render
    visual_type: str = "manim"  # manim or remotion
    canvas_config: Dict[str, Any] = field(default_factory=dict)
    audio_path: Optional[str] = None

@dataclass
class VideoScript:
    title: str
    scenes: List[Scene]
    total_duration: float
    engine: str = "hybrid"  # manim, remotion, or hybrid

class VideoScriptGenerator:
    """Generates programmable video scripts from lesson content"""
    
    def __init__(self):
        self.api_client = APIClient()
    
    async def generate_script(self, topic: str, content: str, style: str = "math") -> VideoScript:
        """
        Generate a director script for the given content.
        style: 'math' (Manim-heavy) or 'history/language' (Remotion-heavy)
        """

        import time
        start_time = time.time()
        logger.info(f"🎬 [Script] Generating video script for: '{topic}' | Style: {style}")
        
        system_prompt = self._get_system_prompt(style)
        user_prompt = f"""
        Topic: {topic}
        Content: {content}
        
        Generate a standardized JSON director script.
        """
        
        try:
            response = await self.api_client.deepseek.chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2, # Low temp for deterministic structure
                max_tokens=4000
            )
            
            if not response.success:
                raise Exception(f"Failed to generate script: {response.error}")
            
            # Parse JSON from response
            script_json = self._parse_json_response(response.data["choices"][0]["message"]["content"])
            
            duration = time.time() - start_time
            logger.info(f"✅ [Script] DeepSeek generation complete in {duration:.2f}s")
            
            return self._convert_to_video_script(script_json)
            
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"❌ [Script] Generation failed after {duration:.2f}s: {e}")
            logger.warning("⚠️ [Script] Falling back to MOCK script generation")
            return self._generate_mock_script(topic, style)

    def _generate_mock_script(self, topic: str, style: str) -> VideoScript:
        """Generate a guaranteed valid mock script when API fails"""
        title = f"{topic} (Demo)"
        scenes = []
        
        # Scene 1: Title
        scenes.append(Scene(
            id="s1",
            duration=4.0,
            narration=f"Welcome to this lesson on {topic}.",
            action="show_title",
            param=topic,
            visual_type="remotion"
        ))
        
        # Scene 2: Explanation
        scenes.append(Scene(
            id="s2", 
            duration=6.0,
            narration=f"In this video, we will explore the core concepts of {topic} using our AI engine.",
            action="show_text", 
            param=f"Understanding {topic}",
            visual_type="remotion"
        ))
        
        # Scene 3: Visual/Math
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
                action="show_image",
                param="education",
                visual_type="remotion"
            ))
            
        # Scene 4: Conclusion
        scenes.append(Scene(
            id="s4",
            duration=4.0,
            narration="Thanks for watching MentorMind.",
            action="show_text",
            param="MentorMind AI",
            visual_type="remotion"
        ))
        
        return VideoScript(
            title=title,
            scenes=scenes,
            total_duration=19.0,
            engine="hybrid"
        )

    def _get_system_prompt(self, style: str) -> str:
        base_prompt = """
        You are a Video Director AI. Your goal is to convert educational content into a 'Programmatic Video Script' (JSON).
        This script will be executed by a rendering engine (Manim for math, Remotion for UI/Images).
        
        OUTPUT FORMAT:
        {
          "title": "Video Title",
          "scenes": [
            {
              "id": "scene_1",
              "duration": 5.0, // estimated seconds
              "narration": "Text for TTS to speak",
              "action": "ACTION_TYPE", 
              "param": "CONTENT_TO_RENDER",
              "visual_type": "manim" // or "remotion"
            }
          ]
        }
        
        """
        
        if style == "math":
            return base_prompt + """
            STYLE: 3Blue1Brown / Khan Academy / Physics Animation
            ENGINE: Manim (Python)
            
            ALLOWED ACTIONS:
            - plot: param = function string (e.g. "sin(x)", "x**2", "9.8*t**2")
            - write_tex: param = LaTeX string (e.g. "E = mc^2", "v = v_0 + at", "d = v_0 t + 0.5 a t^2")
            - draw_shape: param = shape name (circle, square, triangle, projectile_path)
            - transform: param = target LaTeX (for equation transformation)
            
            RULE: accurate math/physics, clear steps.
            VISUALS: minimalistic, dark background, white text/lines. Use 'write_tex' for all formulas.
            """
        else:
            return base_prompt + """
            STYLE: Vox / Kurzgesagt / Documentary
            ENGINE: Remotion (React)
            
            ALLOWED ACTIONS:
            - show_title: param = title text
            - show_image: param = search query for image
            - timeline_event: param = "Year: Event description"
            - mind_map: param = list of concepts
            
            RULE: rich visuals, dynamic layout.
            """
            
    def _parse_json_response(self, content: str) -> Dict:
        """Extract and parse JSON from potential markdown blocks"""
        try:
            # Strip markdown code blocks if present
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
                
            return json.loads(content.strip())
        except Exception as e:
            logger.error(f"Failed to parse JSON: {content[:100]}...")
            # Fallback: simple dict
            return {"title": "Error", "scenes": []}

    def _convert_to_video_script(self, data: Dict) -> VideoScript:
        scenes = []
        total_duration = 0.0
        
        for s in data.get("scenes", []):
            scene = Scene(
                id=s.get("id", f"s_{len(scenes)}"),
                duration=float(s.get("duration", 5.0)),
                narration=s.get("narration", ""),
                action=s.get("action", "show_text"),
                param=s.get("param", ""),
                visual_type=s.get("visual_type", "manim"),
                canvas_config=s.get("canvas_config", {})
            )
            scenes.append(scene)
            total_duration += scene.duration
            
        return VideoScript(
            title=data.get("title", "Untitled Lesson"),
            scenes=scenes,
            total_duration=total_duration,
            engine="hybrid"
        )
