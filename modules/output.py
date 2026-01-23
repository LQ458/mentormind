"""
Output Generation Module - The "Voice"
Generates scripts and avatar synthesis for teaching output
"""

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import numpy as np

from config import config


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
    
    async def generate_short_explanation(self, concept: str, context: Optional[str] = None) -> str:
        """Generate a short explanation for a concept"""
        prompt = f"""
        请用简单易懂的语言解释以下概念：
        
        概念：{concept}
        {f"上下文：{context}" if context else ""}
        
        要求：
        1. 不超过3句话
        2. 使用比喻或例子帮助理解
        3. 语气积极鼓励
        4. 用中文
        
        请生成解释。
        """
        
        # Mock generation
        explanations = {
            "二次方程": "二次方程就像数学中的'抛物线游戏'，它描述的是变量平方的关系。比如扔一个球，它的轨迹就是二次方程。记住a不能为0哦！",
            "导数": "导数就像速度计，告诉你变化有多快。比如汽车加速时，导数就是加速度。理解导数就能预测变化趋势！",
            "积分": "积分就像累积计数器，把小的变化加起来得到总量。比如计算路程，就是把每个时刻的速度加起来。积分让整体变得清晰！"
        }
        
        return explanations.get(concept, f"{concept}是一个重要的数学概念，理解它需要一些练习。让我慢慢解释给你听...")


class TTSSynthesizer:
    """Text-to-speech synthesis using Edge-TTS"""
    
    def __init__(self):
        self.voice = config.TTS_VOICE
        self.output_dir = os.path.join(config.DATA_DIR, "audio")
        os.makedirs(self.output_dir, exist_ok=True)
    
    async def synthesize(self, text: str, script_id: str) -> Tuple[str, float]:
        """
        Synthesize speech from text
        Returns: (audio_file_path, duration_seconds)
        """
        print(f"Synthesizing speech for script: {script_id}")
        
        # Mock TTS synthesis
        # In production, would use Edge-TTS or similar
        await asyncio.sleep(0.2)
        
        # Generate audio file path
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        audio_path = os.path.join(self.output_dir, f"{script_id}_{timestamp}.wav")
        
        # Estimate duration based on text length
        # Average speaking rate: 150 words per minute
        words = len(text.split())
        duration_seconds = (words / 150) * 60
        
        # Create placeholder file
        with open(audio_path, 'w') as f:
            f.write(f"Audio placeholder for: {text[:100]}...")
        
        print(f"Generated audio: {audio_path} ({duration_seconds:.1f}s)")
        
        return audio_path, duration_seconds
    
    def get_available_voices(self) -> List[Dict[str, str]]:
        """Get available TTS voices"""
        # Mock voice list
        return [
            {"name": "zh-CN-XiaoxiaoNeural", "language": "zh-CN", "gender": "female", "style": "general"},
            {"name": "zh-CN-YunxiNeural", "language": "zh-CN", "gender": "male", "style": "general"},
            {"name": "zh-CN-YunxiaNeural", "language": "zh-CN", "gender": "male", "style": "story"},
            {"name": "zh-CN-XiaoyiNeural", "language": "zh-CN", "gender": "female", "style": "cheerful"}
        ]
    
    async def synthesize_with_emotion(self, text: str, emotion: str = "neutral") -> str:
        """Synthesize speech with specific emotion"""
        # This would use emotion-aware TTS in production
        print(f"Synthesizing with emotion: {emotion}")
        
        audio_path, duration = await self.synthesize(text, f"emotion_{emotion}")
        
        return audio_path


class AvatarGenerator:
    """Generates avatar videos using LivePortrait"""
    
    def __init__(self):
        self.avatar_image_path = config.AVATAR_IMAGE_PATH
        self.video_fps = config.VIDEO_FPS
        self.output_dir = os.path.join(config.DATA_DIR, "videos")
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Check if avatar image exists
        if not os.path.exists(self.avatar_image_path):
            print(f"Warning: Avatar image not found at {self.avatar_image_path}")
            print("Using default placeholder")
            self.avatar_image_path = self._create_default_avatar()
    
    def _create_default_avatar(self) -> str:
        """Create a default avatar placeholder"""
        default_path = os.path.join(config.DATA_DIR, "default_avatar.png")
        if not os.path.exists(default_path):
            # Create a simple placeholder
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
        
        # Mock video generation
        # In production, would use LivePortrait or similar
        await asyncio.sleep(0.3)
        
        # Generate video file path
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        video_path = os.path.join(self.output_dir, f"{script.id}_{timestamp}.mp4")
        
        # Create placeholder video file
        with open(video_path, 'w') as f:
            f.write(f"Video placeholder for script: {script.id}\n")
            f.write(f"Audio: {audio_path}\n")
            f.write(f"Duration: {script.duration_seconds}s\n")
            if emotion_cues:
                f.write(f"Emotion cues: {json.dumps(emotion_cues, indent=2)}\n")
            if gesture_cues:
                f.write(f"Gesture cues: {json.dumps(gesture_cues, indent=2)}\n")
        
        video_id = f"video_{timestamp}"
        
        return AvatarVideo(
            id=video_id,
            script_id=script.id,
            video_path=video_path,
            audio_path=audio_path,
            duration_seconds=script.duration_seconds,
            resolution=(1920, 1080),
            fps=self.video_fps,
            generated_at=datetime.now(),
            metadata={
                "script_title": script.title,
                "target_concepts": script.target_concepts,
                "emotion_cues_used": emotion_cues is not None,
                "gesture_cues_used": gesture_cues is not None,
                "avatar_image": self.avatar_image_path
            }
        )
    
    async def generate_talking_head(
        self,
        audio_path: str,
        reference_image_path: Optional[str] = None
    ) -> str:
        """
        Generate talking head video from audio
        """
        if reference_image_path is None:
            reference_image_path = self.avatar_image_path
        
        print(f"Generating talking head with image: {reference_image_path}")
        
        # Mock generation
        await asyncio.sleep(0.2)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(self.output_dir, f"talking_head_{timestamp}.mp4")
        
        with open(output_path, 'w') as f:
            f.write(f"Talking head video\n")
            f.write(f"Reference: {reference_image_path}\n")
            f.write(f"Audio: {audio_path}\n")
        
        return output_path
    
    def get_animation_styles(self) -> List[Dict[str, str]]:
        """Get available animation styles"""
        return [
            {"id": "natural", "name": "自然风格", "description": "自然的说话动画"},
            {"id": "enthusiastic", "name": "热情风格", "description": "充满激情的教学风格"},
            {"id": "calm", "name": "平静风格", "description": "平静温和的解释风格"},
            {"id": "storytelling", "name": "讲故事风格", "description": "适合叙述故事"}
        ]


class OutputPipeline:
    """Main output generation pipeline"""
    
    def __init__(self):
        self.script_generator = ScriptGenerator()
        self.tts_synthesizer = TTSSynthesizer()
        self.avatar_generator = AvatarGenerator()
        self.processing_config = config.PROCESSING
    
    async def generate_teaching_output(self, lesson_plan: Dict) -> Dict:
        """
        Generate complete teaching output from lesson plan
        """
        print("Starting output generation pipeline...")
        
        # 1. Generate script
        script = await self.script_generator.generate_script(lesson_plan)
        print(f"✓ Generated script: {script.title}")
        
        # 2. Synthesize speech
        audio_path, audio_duration = await self.tts_synthesizer.synthesize(
            script.script_text, script.id
        )
        print(f"✓ Synthesized audio: {audio_path} ({audio_duration:.1f}s)")
        
        # 3. Generate avatar video
        video = await self.avatar_generator.generate_video(
            script=script,
            audio_path=audio_path,
            emotion_cues=script.emotion_cues,
            gesture_cues=script.gesture_cues
        )
        print(f"✓ Generated video: {video.video_path}")
        
        # 4. Prepare metadata
        metadata = {
            "pipeline_version": "1.0",
            "processing_timestamp": datetime.now().isoformat(),
            "models_used": {
                "script_generation": self.script_generator.model_config.name,
                "tts_voice": self.tts_synthesizer.voice,
                "avatar_generator": "LivePortrait (mock)"
            },
            "cost_estimation": self._estimate_costs(script, audio_duration),
            "quality_metrics": {
                "script_length_chars": len(script.script_text),
                "audio_duration_seconds": audio_duration,
                "video_resolution": list(video.resolution),
                "video_fps": video.fps
            }
        }
        
        return {
            "script": script.to_dict(),
            "audio": {
                "path": audio_path,
                "duration_seconds": audio_duration,
                "voice": self.tts_synthesizer.voice
            },
            "video": video.to_dict(),
            "metadata": metadata,
            "download_urls": {
                "script": f"/api/scripts/{script.id}/download",
                "audio": f"/api/audio/{Path(audio_path).stem}/download",
                "video": f"/api/videos/{video.id}/download"
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
        context: Optional[str] = None
    ) -> Dict:
        """
        Generate quick explanation with audio
        """
        # Generate explanation
        explanation = await self.script_generator.generate_short_explanation(concept, context)
        
        # Synthesize audio
        audio_path, duration = await self.tts_synthesizer.synthesize(
            explanation, f"quick_{concept}"
        )
        
        # Generate talking head
        video_path = await self.avatar_generator.generate_talking_head(audio_path)
        
        return {
            "concept": concept,
            "explanation": explanation,
            "audio": {
                "path": audio_path,
                "duration_seconds": duration
            },
            "video": {
                "path": video_path,
                "duration_seconds": duration
            },
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