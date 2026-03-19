"""
Video Scripting Engine
Generates "Director JSON" for programmatically rendering videos.
Uses DeepSeek to generate Manim-compatible animation scripts for all content types.
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

class VideoScriptGenerator:
    """Generates programmable Manim video scripts from lesson content"""
    
    def __init__(self):
        self.api_client = APIClient()
    
    async def generate_script(self, topic: str, content: str, style: str = "general", language: str = "en") -> VideoScript:
        """
        Generate a Manim director script for the given content.
        style: 'math' for equation-heavy content, anything else for general explanations.
        All styles render via Manim.
        """

        import time
        start_time = time.time()
        logger.info(f"🎬 [Script] Generating video script for: '{topic}' | Style: {style} | Lang: {language}")
        
        system_prompt = self._get_system_prompt(style, language)
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
                temperature=0.2,
                max_tokens=4000
            )
            
            if not response.success:
                raise Exception(f"Failed to generate script: {response.error}")
            
            script_json = self._parse_json_response(response.data["choices"][0]["message"]["content"])
            
            duration = time.time() - start_time
            logger.info(f"✅ [Script] DeepSeek generation complete in {duration:.2f}s")
            
            return self._convert_to_video_script(script_json)
            
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"❌ [Script] Generation failed after {duration:.2f}s: {e}")
            logger.warning("⚠️ [Script] Falling back to mock script generation")
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

    def _get_system_prompt(self, style: str, language: str) -> str:
        base_prompt = f"""
        You are a Video Director AI. Your goal is to convert educational content into a 'Programmatic Video Script' (JSON).
        This script will be executed by Manim, a Python mathematical animation engine.
        
        OUTPUT FORMAT (strict JSON, no markdown):
        {{
          "title": "Video Title",
          "scenes": [
            {{
              "id": "scene_1",
              "duration": 5.0,
              "narration": "Text for TTS to speak",
              "action": "ACTION_TYPE",
              "param": "CONTENT_TO_RENDER",
              "visual_type": "manim"
            }}
          ]
        }}
        
        ALLOWED ACTIONS (Manim):
        - write_tex: param = LaTeX string (e.g. "E = mc^2", "F = ma")
        - plot: param = function string (e.g. "sin(x)", "x**2")
        - draw_shape: param = shape name (circle, square, triangle)
        - show_text: param = plain text to display
        - transform: param = target LaTeX (for equation transformation)
        
        RULES:
        - All visual_type values must be "manim"
        - The video MUST BE clear and structured, but stay efficient to render (target 4-8 scenes)
        - You MUST include concrete examples and step-by-step conceptual breakdowns
        - Narration should be detailed and educational, matching the visual content
        - For general topics, use show_text and write_tex for key terms, definitions, and examples
        - For math/science topics, you MUST explicitly include step-by-step calculations, equations, and plot graphs using write_tex, plot, and transform actions
        
        CRITICAL LANGUAGE INSTRUCTION:
        All 'narration' values MUST exclusively be written in {language}. 
        If the language is 'zh' or 'Chinese', write all narrations in Chinese characters.
        
        MATH & LATEX RULES:
        1. Do NOT translate LaTeX math equations.
        2. VERY IMPORTANT: Do NOT include Chinese characters inside 'write_tex' or 'plot' param values. 
        3. If you need to display Chinese text on screen, use the 'show_text' action.
        4. Math formulas in 'write_tex' must be pure standard LaTeX (e.g. "a^2 + b^2 = c^2").
        """
        
        if style == "math":
            return base_prompt + """
            STYLE: 3Blue1Brown / Khan Academy
            Focus on equations, graphs, and mathematical relationships.
            Use write_tex for all formulas. Use plot for function graphs.
            Dark background, white text, minimalistic.
            """
        else:
            return base_prompt + """
            STYLE: Educational explainer (Kurzgesagt-inspired, but Manim-rendered)
            Focus on key concepts, definitions, and relationships.
            Use show_text for concepts, write_tex for any important terms or equations.
            Keep it clear and visually structured.
            """
            
    def _parse_json_response(self, content: str) -> Dict:
        """Extract and parse JSON from potential markdown blocks"""
        try:
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
                
            return json.loads(content.strip())
        except Exception as e:
            logger.error(f"Failed to parse JSON: {content[:100]}...")
            return {"title": "Error", "scenes": []}

    def _convert_to_video_script(self, data: Dict) -> VideoScript:
        scenes = []
        total_duration = 0.0
        
        max_scenes = 8
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
            engine="manim"
        )
