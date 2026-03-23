"""
Output Generation Module - The "Voice"
Generates scripts and avatar synthesis for teaching output
"""

import asyncio
import json
import os
import logging
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import numpy as np

from config import config
try:
    from services.tts import TTSService
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from services.tts import TTSService
from core.modules.video_scripting import VideoScriptGenerator, VideoScript, Scene
from core.rendering.manim_renderer import ManimService
from core.modules.storage_manager import CloudStorageManager

logger = logging.getLogger(__name__)


@dataclass
class TeachingScript:
    """Script for teaching output"""
    id: str
    title: str
    script_text: str
    duration_seconds: float
    target_concepts: List[str]
    emotion_cues: Optional[Dict[str, List[Tuple[float, str]]]] = None
    gesture_cues: Optional[Dict[str, List[Tuple[float, str]]]] = None
    metadata: Optional[Dict] = None
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "title": self.title,
            "script_text": self.script_text,
            "duration_seconds": self.duration_seconds,
            "target_concepts": self.target_concepts,
            "emotion_cues": self.emotion_cues or {},
            "gesture_cues": self.gesture_cues or {},
            "metadata": self.metadata or {}
        }


@dataclass
class AvatarVideo:
    """Generated avatar video"""
    id: str
    script_id: str
    video_path: str
    audio_path: str
    duration_seconds: float
    resolution: Tuple[int, int]
    fps: int
    generated_at: datetime
    metadata: Optional[Dict] = None
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "script_id": self.script_id,
            "video_path": self.video_path,
            "audio_path": self.audio_path,
            "duration_seconds": self.duration_seconds,
            "resolution": list(self.resolution),
            "fps": self.fps,
            "generated_at": self.generated_at.isoformat(),
            "metadata": self.metadata or {}
        }


class ScriptGenerator:
    """Generates natural language scripts from lesson plans"""
    
    def __init__(self):
        self.model_config = config.get_models()["deepseek_v3"]
        self.tts_voice = config.TTS_VOICE
    
    async def generate_script(self, lesson_plan: Dict) -> TeachingScript:
        """
        Generate a teaching script from lesson plan
        """
        print(f"Generating script for lesson: {lesson_plan.get('title', 'Unknown')}")
        
        # Prepare prompt for script generation
        prompt = self._create_script_prompt(lesson_plan)
        
        # Mock API call to DeepSeek-V3
        await asyncio.sleep(0.1)
        
        # Generate script
        script_id = f"script_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        script_text = """
        大家好！我是你们的数学老师。
        
        今天我们来学习二次方程。首先，什么是二次方程呢？
        
        二次方程是形如 ax² + bx + c = 0 的方程。这里的a、b、c是常数，而且a不能等于0。
        
        举个例子：x² - 5x + 6 = 0 就是一个二次方程。
        
        解这个方程，我们可以用因式分解法：(x-2)(x-3)=0，所以x=2或者x=3。
        
        注意一个常见错误：一定要检查a是否等于0。如果a=0，那就不是二次方程了！
        
        现在请你试试解这个方程：2x² - 8x + 6 = 0。
        
        提示：可以先除以2简化一下。
        
        很好！今天我们学习了二次方程的基本概念和解法。记住关键点：标准形式、a≠0、多种解法。
        
        如果你还有疑问，随时问我。加油！
        """
        
        # Add emotion and gesture cues
        emotion_cues = {
            "enthusiasm": [(0.0, "high"), (30.0, "medium"), (120.0, "high")],
            "empathy": [(60.0, "high"), (150.0, "medium")],
            "encouragement": [(90.0, "high"), (180.0, "high")]
        }
        
        gesture_cues = {
            "pointing": [(15.0, "screen"), (75.0, "camera")],
            "explaining": [(45.0, "hands_open"), (105.0, "counting")],
            "emphasis": [(30.0, "nod"), (120.0, "lean_in")]
        }
        
        duration = 180.0  # 3 minutes
        
        return TeachingScript(
            id=script_id,
            title=lesson_plan.get("title", "数学课"),
            script_text=script_text.strip(),
            duration_seconds=duration,
            target_concepts=lesson_plan.get("target_concepts", []),
            emotion_cues=emotion_cues,
            gesture_cues=gesture_cues,
            metadata={
                "lesson_plan_id": lesson_plan.get("id", ""),
                "original_query": lesson_plan.get("metadata", {}).get("original_query", ""),
                "generation_model": self.model_config.name
            }
        )
    
    def _create_script_prompt(self, lesson_plan: Dict) -> str:
        """Create prompt for script generation"""
        steps = lesson_plan.get("steps", [])
        steps_text = "\n".join([
            f"{i+1}. {step.get('step_type', '')}: {step.get('content', '')[:100]}..."
            for i, step in enumerate(steps)
        ])
        
        return f"""
        请将以下教学计划转换为自然流畅的教学脚本：
        
        标题：{lesson_plan.get('title', '')}
        目标：{lesson_plan.get('objective', '')}
        受众：{lesson_plan.get('target_audience', '')}
        
        教学步骤：
        {steps_text}
        
        要求：
        1. 使用亲切、鼓励的语气
        2. 包含具体的例子和练习
        3. 指出常见错误和注意事项
        4. 适合{lesson_plan.get('total_duration_minutes', 30)}分钟的教学
        5. 使用中文，面向中国学生
        
        脚本格式：
        - 自然对话式语言
        - 包含适当的停顿和强调
        - 可以加入表情和手势提示（用括号标注）
        
        请生成完整的教学脚本。
        """
    
    async def generate_short_explanation(
        self,
        concept: str,
        context: Optional[str] = None,
        language: str = "zh"
    ) -> str:
        """Generate a short explanation for a concept"""
        prompt = f"""
        {"Please explain the following concept in simple and encouraging English." if language == "en" else "请用简单易懂的中文解释以下概念："}

        {"Concept" if language == "en" else "概念"}: {concept}
        {f"{'Context' if language == 'en' else '上下文'}: {context}" if context else ""}

        {"Requirements" if language == "en" else "要求"}:
        1. {"No more than 3 short sentences" if language == "en" else "不超过3句短句"}
        2. {"Use one concrete example or visual analogy" if language == "en" else "使用一个具体例子或形象比喻"}
        3. {"Keep the wording friendly and clear for students" if language == "en" else "语气友好清晰，适合学生理解"}
        4. {"Reply only in English" if language == "en" else "只用中文回答"}

        {"Generate the explanation." if language == "en" else "请生成解释。"}
        """

        # Mock generation fallback kept concise so downstream Manim scenes stay lightweight.
        explanations = {
            "zh": {
                "二次方程": "二次方程像一条弯弯的抛物线，能描述球的轨迹这类变化。抓住平方项，你就抓住了它的形状关键。",
                "导数": "导数像变化速度计，告诉我们一个量此刻变得有多快。理解它，就更容易看懂函数的趋势。",
                "积分": "积分像把很多很小的部分累加成整体。它能帮助我们从局部变化看出总量。"
            },
            "en": {
                "quadratic equation": "A quadratic equation is a rule that creates a curved parabola. It is useful for modeling shapes like the path of a thrown ball.",
                "derivative": "A derivative measures how fast something is changing at one moment. It works like a speedometer for a function.",
                "integral": "An integral adds many small pieces into one whole. It helps us turn local change into total amount."
            },
        }

        normalized_concept = concept.strip().lower()
        localized_examples = explanations["en" if language == "en" else "zh"]
        if normalized_concept in localized_examples:
            return localized_examples[normalized_concept]

        if language == "en":
            context_hint = f" In this lesson, we focus on {context.strip()}." if context else ""
            return (
                f"{concept} is an important idea that becomes easier once you connect it to a picture or pattern."
                f"{context_hint} We will break it into a few simple steps and one concrete example."
            )

        context_hint = f" 这节课会结合{context.strip()}来理解它。" if context else ""
        return (
            f"{concept}是一个重要概念，只要把它和图像、规律联系起来就会更好懂。"
            f"{context_hint}我们会用几个简单步骤和一个具体例子来拆开理解。"
        )


class TTSSynthesizer:
    """Text-to-speech synthesis using real TTS service"""
    
    def __init__(self):
        self.voice = config.TTS_VOICE
        self.output_dir = os.path.join(config.DATA_DIR, "audio")
        os.makedirs(self.output_dir, exist_ok=True)
        self.sf_tts = SiliconFlowTTSService() if SiliconFlowTTSService else None
    
    async def synthesize(self, text: str, script_id: str, voice: str = "female") -> Tuple[str, float]:
        """
        Synthesize speech using SiliconFlow Cloud TTS
        Returns: (audio_file_path, duration_seconds)
        """
        logger.info(f"Synthesizing speech for script: {script_id} (Voice: {voice})")
        
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            audio_path = os.path.join(self.output_dir, f"{script_id}_{timestamp}.mp3")
            
            if self.sf_tts:
                # Map generic voice names to specific models/presets if needed
                # For SiliconFlow, we might pass the voice name directly if it matches their API
                # Or map "male" -> "alex", "female" -> "anna" etc.
                voice_map = {
                    "female": "FunAudioLLM/CosyVoice2-0.5B:anna",
                    "male": "FunAudioLLM/CosyVoice2-0.5B:caleb", # Example mapping
                    "young_female": "FunAudioLLM/CosyVoice2-0.5B:sara",
                    "young_male": "FunAudioLLM/CosyVoice2-0.5B:ben"
                }
                
                # If voice is a key in map, use the mapped value, otherwise use as is
                # But wait, SiliconFlowTTSService takes voice and voice_label separately or formatted.
                # Let's check siliconflow_tts.py again. 
                # It takes `voice` (model) and `voice_label` (speaker).
                
                # Simplified: Expect voice to be "anna", "caleb" etc. and let service handle it
                # Or better: let's update SiliconFlowTTSService to handle the "voice:label" format
                
                # strictly passing the "label" (e.g. "anna") as the voice argument to the service wrapper
                # referencing backend/services/siliconflow_tts.py: 
                # payload["voice"] = f"{voice}:{voice_label}" where voice is model.
                
                # So we just need to pass the label "anna", "caleb" to the service's voice_label param?
                # The service method signature is: text_to_speech(self, text, voice, voice_label, ...)
                
                target_label = voice if voice in ["anna", "ben", "caleb", "sara"] else "anna"
                if voice == "male": target_label = "caleb"
                if voice == "female": target_label = "anna"
                
                result = await self.sf_tts.text_to_speech(
                    text=text,
                    voice_label=target_label, # We need to update the call to pass this
                    output_path=audio_path
                )
                return result.audio_path, result.duration
            else:
                raise Exception("SiliconFlow TTS service unavailable")
            
        except Exception as e:
            logger.error(f"Error synthesizing speech for script {script_id}: {e}")
            raise
    
    def get_available_voices(self) -> List[Dict[str, str]]:
        """Get available TTS voices"""
        return [
            {"id": "anna", "name": "Female (Standard)", "gender": "female"},
            {"id": "caleb", "name": "Male (Standard)", "gender": "male"},
            {"id": "sara", "name": "Young Female", "gender": "female"},
            {"id": "ben", "name": "Young Male", "gender": "male"}
        ]
    
    async def synthesize_with_emotion(self, text: str, emotion: str = "neutral") -> str:
        """Synthesize speech with specific emotion"""
        logger.info(f"Synthesizing with emotion: {emotion}")
        
        try:
            # Map emotion to voice parameters
            emotion_params = {
                "neutral": {"speed": 1.0, "pitch": 1.0},
                "happy": {"speed": 1.1, "pitch": 1.1},
                "sad": {"speed": 0.9, "pitch": 0.9},
                "excited": {"speed": 1.2, "pitch": 1.2},
                "calm": {"speed": 0.95, "pitch": 0.95}
            }
            
            params = emotion_params.get(emotion, emotion_params["neutral"])
            
            # Generate filename
            import hashlib
            content_hash = hashlib.md5(text.encode()).hexdigest()[:8]
            audio_path = os.path.join(self.output_dir, f"emotion_{emotion}_{content_hash}.wav")
            
            # Use TTS service with emotion parameters
            result = await self.tts_service.text_to_speech(
                text=text,
                language="zh-CN",
                voice="female",
                speed=params["speed"],
                pitch=params["pitch"],
                output_format="wav",
                output_path=audio_path
            )
            
            return audio_path
            
        except Exception as e:
            logger.error(f"Error synthesizing speech with emotion {emotion}: {e}")
            # Fall back to regular synthesis
            return await self.synthesize(text, f"emotion_{emotion}")[0]


try:
    from services.heygen import HeyGenService
except (ImportError, ModuleNotFoundError):
    HeyGenService = None

try:
    from services.siliconflow import SiliconFlowService
except ImportError:
    logger.warning("SiliconFlowService not found")
    SiliconFlowService = None

try:
    from services.siliconflow_tts import SiliconFlowTTSService
except ImportError:
    logger.warning("SiliconFlowTTSService not found")
    SiliconFlowTTSService = None

class AvatarGenerator:
    """Generates avatar videos using SiliconFlow, HeyGen, or Mock fallback"""
    
    def __init__(self):
        self.avatar_image_path = config.AVATAR_IMAGE_PATH
        self.video_fps = config.VIDEO_FPS
        self.output_dir = os.path.join(config.DATA_DIR, "videos")
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Initialize services
        self.heygen_service = HeyGenService() if HeyGenService else None
        self.siliconflow_service = SiliconFlowService() if SiliconFlowService else None
        
        if not os.path.exists(self.avatar_image_path):
            logger.debug(f"Avatar image not found at {self.avatar_image_path}, using default placeholder")
            self.avatar_image_path = self._create_default_avatar()
            
    async def _use_siliconflow(self) -> bool:
        """Check if SiliconFlow is available"""
        if not self.siliconflow_service:
            return False
        return await self.siliconflow_service.check_availability()

    async def _use_heygen(self) -> bool:
        """Check if HeyGen is available"""
        if not self.heygen_service:
            return False
        return await self.heygen_service.check_availability()
    
    def _create_default_avatar(self) -> str:
        """Create a default avatar placeholder"""
        default_path = os.path.join(config.DATA_DIR, "default_avatar.png")
        if not os.path.exists(default_path):
            with open(default_path, 'w') as f:
                f.write("Avatar placeholder image")
        return default_path
    
    async def generate_video(
        self,
        script: TeachingScript,
        audio_path: str,
        emotion_cues: Optional[Dict] = None,
        gesture_cues: Optional[Dict] = None
    ) -> AvatarVideo:
        """
        Generate avatar video from script and audio
        """
        print(f"Generating avatar video for script: {script.id}")
        
        video_path = ""
        resolution = (1920, 1080)
        is_mocked = True
        provider = "Mock"
        
        # Priority 1: SiliconFlow (Cheaper/Faster)
        if await self._use_siliconflow():
            try:
                print("Connecting to SiliconFlow Video API...")
                
                # Use public URL or default image-to-video if possible
                public_avatar_url = "https://mentormind-assets.oss-cn-shanghai.aliyuncs.com/teachers/avatar_1.png"
                
                # SiliconFlow requires a prompt. We'll use the script title or simplified content.
                prompt = f"A female teacher explaining: {script.title}. Realistic, professional style."
                
                result = await self.siliconflow_service.generate_video(
                    prompt=prompt,
                    image_url=public_avatar_url
                )
                print(f"SiliconFlow task submitted: {result['video_id']}")
                
                download_url = await self.siliconflow_service.wait_for_completion(result['video_id'])
                if download_url:
                    import aiohttp
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    video_path = os.path.join(self.output_dir, f"{script.id}_{timestamp}.mp4")
                    
                    async with aiohttp.ClientSession() as session:
                        async with session.get(download_url) as resp:
                            if resp.status == 200:
                                with open(video_path, 'wb') as f:
                                    f.write(await resp.read())
                                is_mocked = False
                                provider = "SiliconFlow"
                                print(f"Video downloaded to {video_path}")
            except Exception as e:
                logger.error(f"SiliconFlow generation failed: {e}")
                print(f"SiliconFlow error: {e}. Trying next provider...")

        # Priority 2: HeyGen (High Quality)
        if is_mocked and await self._use_heygen():
            try:
                print("Connecting to HeyGen API...")
                result = await self.heygen_service.generate_video(
                    text=script.script_text,
                    background_color="#f0f0f0"
                )
                print(f"HeyGen task started: {result['video_id']}")
                
                download_url = await self.heygen_service.wait_for_completion(result['video_id'])
                if download_url:
                    import aiohttp
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    video_path = os.path.join(self.output_dir, f"{script.id}_{timestamp}.mp4")
                    
                    async with aiohttp.ClientSession() as session:
                        async with session.get(download_url) as resp:
                            if resp.status == 200:
                                with open(video_path, 'wb') as f:
                                    f.write(await resp.read())
                                is_mocked = False
                                provider = "HeyGen"
                                print(f"Video downloaded to {video_path}")
            except Exception as e:
                logger.error(f"HeyGen generation failed: {e}")
                print(f"HeyGen error: {e}. Falling back to mock...")

        # Priority 3: Mock Fallback
        if is_mocked:
            await asyncio.sleep(0.3)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            video_path = os.path.join(self.output_dir, f"{script.id}_{timestamp}.mp4")
            
            with open(video_path, 'w') as f:
                f.write(f"Video placeholder for script: {script.id}\n")
                f.write(f"Audio: {audio_path}\n")
                f.write(f"Provider: Mock (Real services unavailable)\n")
        
        video_id = f"video_{os.path.basename(video_path).split('.')[0]}"
        
        return AvatarVideo(
            id=video_id,
            script_id=script.id,
            video_path=video_path,
            audio_path=audio_path,
            duration_seconds=script.duration_seconds,
            resolution=resolution,
            fps=self.video_fps,
            generated_at=datetime.now(),
            metadata={
                "script_title": script.title,
                "target_concepts": script.target_concepts,
                "emotion_cues_used": emotion_cues is not None,
                "gesture_cues_used": gesture_cues is not None,
                "avatar_provider": provider,
                "avatar_image": self.avatar_image_path
            }
        )
    
    async def generate_talking_head(
        self,
        audio_path: str,
        text: str = "Hello",
        reference_image_path: Optional[str] = None
    ) -> str:
        """
        Generate talking head video from audio
        Attempt to use real services first
        """
        if reference_image_path is None:
            reference_image_path = self.avatar_image_path
        
        print(f"Generating talking head with image: {reference_image_path}")
        
        # Create a dummy script for talking head
        script_id = f"talk_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        dummy_script = TeachingScript(
            id=script_id,
            title="Short Talk",
            script_text=text,
            duration_seconds=5.0,
            target_concepts=[]
        )
        
        # Use full video generator which has real service logic
        video = await self.generate_video(dummy_script, audio_path)
        return video.video_path
    
    def get_animation_styles(self) -> List[Dict[str, str]]:
        """Get available animation styles"""
        return [
            {"id": "natural", "name": "自然风格", "description": "自然的说话动画"},
            {"id": "enthusiastic", "name": "热情风格", "description": "充满激情的教学风格"},
            {"id": "calm", "name": "平静风格", "description": "平静温和的解释风格"},
            {"id": "storytelling", "name": "讲故事风格", "description": "适合叙述故事"}
        ]


class ProgrammaticVideoGenerator:
    """
    Code-to-Video Generator
    Orchestrates DeepSeek-R1 scripting, TTS sync, and Manim/Remotion rendering
    """
    
    def __init__(self):
        self.script_generator = VideoScriptGenerator()
        self.tts_synthesizer = TTSSynthesizer()
        self.manim_service = ManimService()
        
    async def generate_video(
        self,
        topic: str,
        content: str,
        style: str = "math",
        voice_id: str = "anna",
        language: str = "en",
        student_level: str = "beginner",
        target_audience: str = "students",
        duration_minutes: int = 10,
        custom_requirements: Optional[str] = None,
    ) -> Dict:
        """
        Generate a programmatic video from content
        """
        logger.info(f"Generating programmatic video for: {topic} ({style}) Voice: {voice_id} Lang: {language}")
        required_duration_seconds = max(10, int(duration_minutes or 10)) * 60

        async def build_video(expanded_requirements: Optional[str], attempt: int) -> Dict:
            video_script = await self.script_generator.generate_script(
                topic,
                content,
                style,
                language,
                student_level=student_level,
                target_audience=target_audience,
                duration_minutes=duration_minutes,
                custom_requirements=expanded_requirements,
            )

            logger.info("Synthesizing audio concurrently for all scenes...")

            async def process_scene_audio(scene: Scene) -> float:
                if not scene.narration:
                    return 0.0

                audio_path, duration = await self.tts_synthesizer.synthesize(
                    scene.narration, f"{video_script.title}_{scene.id}", voice=voice_id
                )
                if not audio_path or not os.path.exists(audio_path):
                    raise ValueError(f"TTS did not produce an audio file for {scene.id}")
                if duration <= 0:
                    raise ValueError(f"TTS returned a non-positive duration for {scene.id}")

                scene.duration = duration
                scene.audio_path = audio_path
                return scene.duration

            tasks = [process_scene_audio(scene) for scene in video_script.scenes]
            audio_durations = await asyncio.gather(*tasks)

            total_audio_duration = sum(audio_durations)
            video_script.total_duration = total_audio_duration

            min_duration_seconds = 360  # 6 minutes
            if total_audio_duration < min_duration_seconds:
                raise ValueError(
                    f"Generated lesson is too short ({total_audio_duration:.1f}s < {min_duration_seconds}s target). "
                    f"Try expanding the narration."
                )

            logger.info(f"Rendering with engine: Manim (style={style})")
            video_path = await self.manim_service.render_script(video_script)
            video_probe = await asyncio.to_thread(self._probe_rendered_video, video_path)
            if video_probe.get("has_audio_stream") is False:
                raise ValueError(f"Rendered video is missing an audio stream: {video_path}")

            return {
                "video_path": video_path,
                "script": video_script,
                "provider": "Manim",
                "duration": total_audio_duration,
                "debug": {
                    "generation_pipeline": video_script.debug_artifacts,
                    "video_probe": video_probe,
                    "duration_target_seconds": required_duration_seconds,
                    "generation_attempt": attempt,
                    "scene_audio": [
                        {
                            "scene_id": scene.id,
                            "duration": scene.duration,
                            "audio_path": scene.audio_path,
                        }
                        for scene in video_script.scenes
                    ],
                },
            }

        base_requirements = custom_requirements
        retry_requirements = "\n".join(
            part
            for part in [
                custom_requirements or "",
                (
                    f"Retry requirement: the lesson must run for at least {max(10, int(duration_minutes or 10))} full minutes. "
                    "Expand the narration substantially, add more worked examples, recap transitions, and short retrieval checks. "
                    "Keep on-screen wording concise and avoid dense overlapping text over graphs or equations."
                ),
            ]
            if part
        )

        last_error: Optional[Exception] = None
        for attempt, requirements in enumerate([base_requirements, retry_requirements], start=1):
            try:
                return await build_video(requirements, attempt)
            except ValueError as exc:
                last_error = exc
                if "too short" not in str(exc).lower() or attempt == 2:
                    raise
                logger.warning("Video generation attempt %s was too short for %s: %s", attempt, topic, exc)

        raise last_error or ValueError("Programmatic video generation failed unexpectedly")

    def _probe_rendered_video(self, video_path: str) -> Dict[str, Optional[bool]]:
        if not video_path or not os.path.exists(video_path):
            return {"checked": True, "has_audio_stream": False}

        ffprobe = shutil.which("ffprobe")
        if not ffprobe:
            return {"checked": False, "has_audio_stream": None}

        try:
            result = subprocess.run(
                [
                    ffprobe,
                    "-v",
                    "error",
                    "-show_entries",
                    "stream=codec_type",
                    "-of",
                    "json",
                    video_path,
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            data = json.loads(result.stdout or "{}")
            streams = data.get("streams") or []
            has_audio_stream = any(stream.get("codec_type") == "audio" for stream in streams)
            return {"checked": True, "has_audio_stream": has_audio_stream}
        except Exception as exc:
            logger.warning("Unable to probe rendered video %s: %s", video_path, exc)
            return {"checked": False, "has_audio_stream": None}


def _to_relative_path(absolute_path: str | None) -> str | None:
    """Convert an absolute local path to a path relative to DATA_DIR (with forward slashes).
    Cloud URLs are returned as-is. None/empty stays None."""
    if not absolute_path:
        return None
    if absolute_path.startswith("http"):
        return absolute_path  # Cloud URL — keep as-is
    if os.path.isabs(absolute_path):
        try:
            absolute_path = os.path.relpath(absolute_path, config.DATA_DIR)
        except ValueError:
            pass  # Different drive on Windows — keep as-is
    return absolute_path.replace(os.sep, "/")


class OutputPipeline:
    """Main output generation pipeline"""
    
    def __init__(self):
        self.script_generator = ScriptGenerator()
        self.tts_synthesizer = TTSSynthesizer()
        self.avatar_generator = AvatarGenerator()
        self.programmatic_generator = ProgrammaticVideoGenerator()
        self.processing_config = config.PROCESSING
        self.storage_manager = CloudStorageManager()
    
    async def generate_teaching_output(self, lesson_plan: Dict, include_video: bool = True) -> Dict:
        """
        Generate complete teaching output from lesson plan.
        Optimized to avoid redundant LLM calls and parallelize asset generation.
        """
        print(f"Starting output generation pipeline (include_video={include_video})...")
        
        # Determine style and parameters
        title = lesson_plan.get("title", "Lesson")
        title_lower = title.lower()
        math_keywords = [
            "math", "algebra", "geometry", "calculus", "equation", "function", "graph", 
            "number", "arithmetic", "probability", "statistics", "theorem", "proof",
            "quadratic", "linear", "polynomial", "derivative", "integral", "matrix",
            "vector", "trigonometry", "circle", "triangle", "polygon", "parabola",
            "physics", "kinematics", "velocity", "acceleration", "force", "gravity",
            "energy", "momentum", "projectile", "motion", "mechanics", "newton",
            "数学", "代数", "几何", "微积分", "方程", "函数", "图象", "数论", "概率", "统计",
            "物理", "运动", "力", "速度", "加速度", "重力", "能量", "牛顿"
        ]
        style = "math" if any(k in title_lower for k in math_keywords) else "general"
        voice_id = lesson_plan.get("voice_id", "anna")
        language = lesson_plan.get("language", "en")
        
        if include_video:
            # 1. Generate Programmatic Video (Handles its own scripting and concurrent TTS)
            print(f"⏳ [Step 1/1] Generating full video content...")
            video_result = await self.programmatic_generator.generate_video(
                topic=title,
                content=lesson_plan.get("description", ""),
                style=style,
                voice_id=voice_id,
                language=language,
                duration_minutes=lesson_plan.get("duration_minutes", 10)
            )
            
            video_local_path = video_result['video_path']
            video_duration = video_result['duration']
            
            # Extract first scene audio as the "main" audio if needed, or just use video
            audio_local_path = video_result['script'].scenes[0].audio_path if video_result['script'].scenes else ""
            
            # Parallel Upload to Cloud
            print(f"☁️ Uploading video artifacts to cloud storage...")
            upload_tasks = [
                self.storage_manager.upload_file(video_local_path, f"videos/{os.path.basename(video_local_path)}", "video/mp4"),
                self.storage_manager.upload_file(audio_local_path, f"audio/{os.path.basename(audio_local_path)}", "audio/mpeg") if audio_local_path else asyncio.sleep(0, result=None)
            ]
            video_url, audio_url = await asyncio.gather(*upload_tasks)
            
            final_video_path = video_url or _to_relative_path(video_local_path)
            final_audio_path = audio_url or _to_relative_path(audio_local_path)
            
            # Create a TeachingScript for compatibility
            full_transcript = "\n\n".join([s.narration for s in video_result['script'].scenes if s.narration])
            script = TeachingScript(
                id=f"script_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                title=title,
                script_text=full_transcript,
                duration_seconds=video_duration,
                target_concepts=[]
            )
            
            # Mock AvatarVideo object for compatibility
            video = AvatarVideo(
                id=f"vid_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                script_id=script.id,
                video_path=final_video_path,
                audio_path=final_audio_path,
                duration_seconds=video_duration,
                resolution=(1920, 1080),
                fps=30,
                generated_at=datetime.now(),
                metadata={"provider": video_result['provider']}
            )
            
            return {
                "script": script.to_dict(),
                "audio": {"path": final_audio_path, "duration_seconds": video_duration, "voice": voice_id},
                "video": video.to_dict(),
                "metadata": {"pipeline": "programmatic_video", "timestamp": datetime.now().isoformat()},
                "download_urls": {
                    "script": f"/api/scripts/{script.id}/download",
                    "audio": f"/api/audio/{Path(audio_local_path).stem}/download" if audio_local_path else None,
                    "video": f"/api/videos/{video.id}/download"
                },
                "debug": video_result.get("debug") or {}
            }
        else:
            # Traditional Audio-only Pipeline
            print(f"⏳ [Step 1/2] Generating teaching script...")
            script = await self.script_generator.generate_script(lesson_plan)
            
            print(f"⏳ [Step 2/2] Synthesizing audio (TTS)...")
            audio_path, audio_duration = await self.tts_synthesizer.synthesize(script.script_text, script.id)
            
            print(f"☁️ Uploading audio artifact...")
            audio_url = await self.storage_manager.upload_file(audio_path, f"audio/{os.path.basename(audio_path)}", "audio/mpeg")
            final_audio_path = audio_url or _to_relative_path(audio_path)
            
            return {
                "script": script.to_dict(),
                "audio": {"path": final_audio_path, "duration_seconds": audio_duration, "voice": voice_id},
                "video": None,
                "metadata": {"pipeline": "audio_only", "timestamp": datetime.now().isoformat()},
                "download_urls": {
                    "script": f"/api/scripts/{script.id}/download",
                    "audio": f"/api/audio/{Path(audio_path).stem}/download"
                }
            }
    
    def _estimate_costs(self, script: TeachingScript, audio_duration: float) -> Dict[str, float]:
        """Estimate costs for output generation"""
        # Estimate token count for script generation
        script_tokens = len(script.script_text) / 4  # Rough estimate
        
        # Model costs
        script_cost = script_tokens * self.script_generator.model_config.cost_per_1k_tokens / 1000
        
        # TTS cost (estimated)
        tts_cost = audio_duration * 0.0001  # $0.0001 per second
        
        # Video generation cost (estimated)
        video_cost = audio_duration * 0.0002  # $0.0002 per second
        
        total_cost = script_cost + tts_cost + video_cost
        
        return {
            "script_generation_usd": round(script_cost, 4),
            "tts_synthesis_usd": round(tts_cost, 4),
            "video_generation_usd": round(video_cost, 4),
            "total_usd": round(total_cost, 4),
            "estimated_monthly_usd": round(total_cost * 30, 2)  # Assuming daily use
        }
    
    async def generate_quick_explanation(
        self,
        concept: str,
        context: Optional[str] = None,
        voice_id: str = "anna",
        language: str = "en",
        student_level: str = "beginner",
        target_audience: str = "students",
        duration_minutes: int = 10,
        custom_requirements: Optional[str] = None,
    ) -> Dict:
        """
        Generate quick explanation with audio and real video
        """
        # Generate explanation
        explanation = await self.script_generator.generate_short_explanation(
            concept,
            context,
            language=language
        )
        
        # Synthesize audio
        # Synthesize audio (not strictly needed as Programmatic generator does it, but good for quick audio return)
        # However, programmatic engine handles TTS internally for sync. 
        # Let's delegate everything to programmatic generator for consistency.
        
        math_keywords = [
            "math", "algebra", "geometry", "calculus", "equation", "function", "graph", 
            "number", "arithmetic", "probability", "statistics", "theorem", "proof",
            "quadratic", "linear", "polynomial", "derivative", "integral", "matrix",
            "vector", "trigonometry", "circle", "triangle", "polygon", "parabola",
            "physics", "kinematics", "velocity", "acceleration", "force", "gravity",
            "energy", "momentum", "projectile", "motion", "mechanics", "newton",
            "数学", "代数", "几何", "微积分", "方程", "函数", "图象", "数论", "概率", "统计",
            "物理", "运动", "力", "速度", "加速度", "重力", "能量", "牛顿"
        ]
        
        style = "math" if any(k in concept.lower() for k in math_keywords) else "general"
        
        video_result = await self.programmatic_generator.generate_video(
            topic=concept,
            content=explanation,
            style=style,
            voice_id=voice_id,
            language=language,
            student_level=student_level,
            target_audience=target_audience,
            duration_minutes=duration_minutes,
            custom_requirements=custom_requirements or context,
        )
        video_local_path = video_result['video_path']
        audio_local_path = video_result['script'].scenes[0].audio_path if video_result['script'].scenes else ""
        full_transcript = "\n\n".join(
            f"[{index + 1:02d}] {scene.narration}"
            for index, scene in enumerate(video_result['script'].scenes)
            if scene.narration
        )
        scene_script = [
            {
                "id": scene.id,
                "duration": scene.duration,
                "action": scene.action,
                "on_screen_text": scene.param,
                "narration": scene.narration,
                "canvas_config": scene.canvas_config,
            }
            for scene in video_result['script'].scenes
        ]
        
        # Upload to Cloud
        video_url = await self.storage_manager.upload_file(video_local_path, f"videos/{os.path.basename(video_local_path)}", "video/mp4")
        audio_url = await self.storage_manager.upload_file(audio_local_path, f"audio/{os.path.basename(audio_local_path)}", "audio/mpeg") if audio_local_path else None
        
        final_video_path = video_url or _to_relative_path(video_local_path)
        final_audio_path = audio_url or _to_relative_path(audio_local_path)
        
        return {
            "concept": concept,
            "explanation": explanation,
            "audio": {
                "path": final_audio_path,
                "duration_seconds": video_result['duration']
            },
            "video": {
                "path": final_video_path,
                "duration_seconds": video_result['duration'],
                "id": f"vid_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            },
            "script": {
                "title": video_result['script'].title,
                "script_text": full_transcript,
                "scene_script": scene_script,
                "total_duration_seconds": video_result['duration'],
            },
            "full_transcript": full_transcript,
            "lesson_blueprint": (video_result.get("debug") or {}).get("generation_pipeline", {}),
            "debug": video_result.get("debug") or {},
            "generated_at": datetime.now().isoformat()
        }
    
    async def batch_generate(
        self,
        lesson_plans: List[Dict],
        max_concurrent: int = 3
    ) -> List[Dict]:
        """
        Batch generate outputs for multiple lesson plans
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def generate_with_semaphore(lesson_plan: Dict):
            async with semaphore:
                return await self.generate_teaching_output(lesson_plan)
        
        tasks = [
            generate_with_semaphore(lesson_plan)
            for lesson_plan in lesson_plans
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out exceptions
        valid_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                print(f"Error generating output for lesson plan {i}: {result}")
            else:
                valid_results.append(result)
        
        return valid_results


# Example usage
async def example_usage():
    """Example of output generation"""
    pipeline = OutputPipeline()
    
    # Example lesson plan from agentic module
    lesson_plan = {
        "id": "lesson_20250123_123456",
        "title": "二次方程入门",
        "objective": "理解二次方程的基本概念和解法",
        "target_audience": "beginner",
        "total_duration_minutes": 30,
        "steps": [
            {
                "step_type": "explanation",
                "content": "二次方程的一般形式是 ax² + bx + c = 0",
                "target_concepts": ["quadratic_equation"],
                "duration_minutes": 5
            },
            {
                "step_type": "example",
                "content": "解方程 x² - 5x + 6 = 0",
                "target_concepts": ["quadratic_equation", "factoring"],
                "duration_minutes": 7
            }
        ],
        "metadata": {
            "original_query": "我不理解二次方程"
        }
    }
    
    print("Generating teaching output...")
    result = await pipeline.generate_teaching_output(lesson_plan)
    
    print(f"\n✓ Output generation complete!")
    print(f"Script: {result['script']['title']}")
    print(f"Audio: {result['audio']['path']} ({result['audio']['duration_seconds']:.1f}s)")
    print(f"Video: {result['video']['video_path']}")
    print(f"Estimated cost: ${result['metadata']['cost_estimation']['total_usd']:.4f}")
    
    # Quick explanation example
    print(f"\nGenerating quick explanation...")
    quick_result = await pipeline.generate_quick_explanation("导数")
    
    print(f"Quick explanation for '导数':")
    print(f"Text: {quick_result['explanation'][:100]}...")
    print(f"Audio: {quick_result['audio']['path']}")
    
    return result, quick_result


if __name__ == "__main__":
    asyncio.run(example_usage())
