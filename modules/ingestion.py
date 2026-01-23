"""
Multimodal Ingestion Module - The "Senses"
Handles audio/video processing and alignment to solve referential ambiguity
"""

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import numpy as np

from config import config


@dataclass
class ContextBlock:
    """Aligned audio-visual context block"""
    timestamp: float  # seconds from start
    audio_text: str
    slide_text: str
    visual_embedding: np.ndarray
    slide_image_path: Optional[str] = None
    confidence: float = 1.0
    pedagogical_tag: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            "timestamp": self.timestamp,
            "audio_text": self.audio_text,
            "slide_text": self.slide_text,
            "visual_embedding": self.visual_embedding.tolist() if self.visual_embedding is not None else None,
            "slide_image_path": self.slide_image_path,
            "confidence": self.confidence,
            "pedagogical_tag": self.pedagogical_tag
        }


class AudioProcessor:
    """Handles audio transcription using FunASR"""
    
    def __init__(self):
        self.sample_rate = config.AUDIO_SAMPLE_RATE
        self.model_config = config.get_models()["funasr"]
    
    async def transcribe(self, audio_path: str) -> List[Tuple[float, str]]:
        """
        Transcribe audio with timestamps
        Returns: List of (timestamp_seconds, text)
        """
        # Mock implementation - would integrate with FunASR API
        print(f"Processing audio: {audio_path}")
        
        # Simulate API call to FunASR
        await asyncio.sleep(0.1)  # Simulate network delay
        
        # Example output simulating FunASR timestamped transcription
        return [
            (0.0, "大家好，今天我们来学习二次方程。"),
            (5.2, "二次方程的一般形式是 ax² + bx + c = 0。"),
            (12.5, "其中a、b、c是常数，且a不等于0。"),
            (20.1, "解二次方程的方法有配方法、公式法和因式分解法。")
        ]
    
    def validate_audio(self, audio_path: str) -> bool:
        """Validate audio file format and quality"""
        # Check file exists and has valid format
        import os
        if not os.path.exists(audio_path):
            return False
        
        # Check file size (minimum 1KB)
        if os.path.getsize(audio_path) < 1024:
            return False
        
        return True


class VideoProcessor:
    """Handles video frame extraction and OCR using PaddleOCR"""
    
    def __init__(self):
        self.frame_rate = config.VIDEO_FRAME_RATE
        self.scene_change_threshold = config.SCENE_CHANGE_THRESHOLD
        self.ocr_config = config.get_models()["paddle_ocr"]
    
    async def extract_slides(self, video_path: str) -> List[Tuple[float, str, np.ndarray]]:
        """
        Extract slides at scene changes
        Returns: List of (timestamp_seconds, ocr_text, visual_embedding)
        """
        print(f"Processing video: {video_path}")
        
        # Mock implementation - would integrate with OpenCV and PaddleOCR
        await asyncio.sleep(0.1)
        
        # Simulate slide extraction at scene changes
        return [
            (0.0, "二次方程 Quadratic Equations\nax² + bx + c = 0", np.random.randn(512)),
            (12.0, "解二次方程的方法\n1. 配方法\n2. 公式法\n3. 因式分解法", np.random.randn(512)),
            (25.0, "二次公式\nx = [-b ± √(b² - 4ac)] / 2a", np.random.randn(512))
        ]
    
    def detect_scene_change(self, frame1: np.ndarray, frame2: np.ndarray) -> bool:
        """Detect if scene has changed significantly"""
        if frame1 is None or frame2 is None:
            return True
        
        # Simple difference detection
        diff = np.mean(np.abs(frame1 - frame2))
        return diff > self.scene_change_threshold


class AlignmentEngine:
    """Aligns audio transcripts with visual slides"""
    
    def __init__(self):
        self.context_block_size = config.CONTEXT_BLOCK_SIZE
    
    async def align_audio_visual(
        self,
        audio_segments: List[Tuple[float, str]],
        video_slides: List[Tuple[float, str, np.ndarray]]
    ) -> List[ContextBlock]:
        """
        Align audio segments with video slides to create context blocks
        """
        context_blocks = []
        
        # Simple temporal alignment based on timestamps
        slide_idx = 0
        current_slide = video_slides[slide_idx] if video_slides else None
        
        for audio_timestamp, audio_text in audio_segments:
            # Find matching slide based on timestamp
            while (slide_idx + 1 < len(video_slides) and 
                   audio_timestamp >= video_slides[slide_idx + 1][0]):
                slide_idx += 1
                current_slide = video_slides[slide_idx]
            
            if current_slide:
                slide_timestamp, slide_text, visual_embedding = current_slide
                
                # Calculate alignment confidence based on temporal proximity
                time_diff = abs(audio_timestamp - slide_timestamp)
                confidence = max(0, 1 - time_diff / 10.0)  # Confidence decays over 10 seconds
                
                block = ContextBlock(
                    timestamp=audio_timestamp,
                    audio_text=audio_text,
                    slide_text=slide_text,
                    visual_embedding=visual_embedding,
                    confidence=confidence
                )
                context_blocks.append(block)
        
        return context_blocks
    
    def chunk_context_blocks(self, blocks: List[ContextBlock], max_tokens: int = None) -> List[List[ContextBlock]]:
        """Chunk context blocks based on token limit"""
        if max_tokens is None:
            max_tokens = self.context_block_size
        
        chunks = []
        current_chunk = []
        current_token_count = 0
        
        for block in blocks:
            # Estimate token count (rough approximation)
            block_tokens = len(block.audio_text.split()) + len(block.slide_text.split())
            
            if current_token_count + block_tokens > max_tokens and current_chunk:
                chunks.append(current_chunk)
                current_chunk = [block]
                current_token_count = block_tokens
            else:
                current_chunk.append(block)
                current_token_count += block_tokens
        
        if current_chunk:
            chunks.append(current_chunk)
        
        return chunks


class MultimodalIngestionPipeline:
    """Main pipeline for multimodal ingestion"""
    
    def __init__(self):
        self.audio_processor = AudioProcessor()
        self.video_processor = VideoProcessor()
        self.alignment_engine = AlignmentEngine()
        self.processing_config = config.PROCESSING
    
    async def process_lecture(
        self,
        audio_path: str,
        video_path: str,
        metadata: Optional[Dict] = None
    ) -> Dict:
        """
        Process a complete lecture (audio + video)
        Returns: Dictionary with context blocks and metadata
        """
        # Validate inputs
        if not self.audio_processor.validate_audio(audio_path):
            raise ValueError(f"Invalid audio file: {audio_path}")
        
        # Process audio and video in parallel
        audio_task = asyncio.create_task(self.audio_processor.transcribe(audio_path))
        video_task = asyncio.create_task(self.video_processor.extract_slides(video_path))
        
        audio_segments, video_slides = await asyncio.gather(audio_task, video_task)
        
        # Align audio and video
        context_blocks = await self.alignment_engine.align_audio_visual(
            audio_segments, video_slides
        )
        
        # Chunk into manageable blocks
        chunks = self.alignment_engine.chunk_context_blocks(context_blocks)
        
        # Prepare result
        result = {
            "metadata": metadata or {},
            "audio_segments": audio_segments,
            "video_slides": [(ts, text) for ts, text, _ in video_slides],
            "context_blocks": [block.to_dict() for block in context_blocks],
            "chunks": [
                [block.to_dict() for block in chunk]
                for chunk in chunks
            ],
            "processing_timestamp": datetime.now().isoformat(),
            "total_blocks": len(context_blocks),
            "total_chunks": len(chunks)
        }
        
        return result
    
    async def batch_process(
        self,
        lectures: List[Tuple[str, str, Optional[Dict]]],
        max_concurrent: int = 5
    ) -> List[Dict]:
        """
        Process multiple lectures with concurrency control
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def process_with_semaphore(audio_path: str, video_path: str, metadata: Optional[Dict]):
            async with semaphore:
                return await self.process_lecture(audio_path, video_path, metadata)
        
        tasks = [
            process_with_semaphore(audio_path, video_path, metadata)
            for audio_path, video_path, metadata in lectures
        ]
        
        return await asyncio.gather(*tasks, return_exceptions=True)


# Example usage
async def example_usage():
    """Example of how to use the ingestion pipeline"""
    pipeline = MultimodalIngestionPipeline()
    
    # Process a single lecture
    result = await pipeline.process_lecture(
        audio_path="./data/lectures/math_lecture_1.mp3",
        video_path="./data/lectures/math_lecture_1.mp4",
        metadata={
            "subject": "数学",
            "topic": "二次方程",
            "grade_level": "高中一年级",
            "teacher": "张老师"
        }
    )
    
    print(f"Processed {result['total_blocks']} context blocks")
    print(f"Chunked into {result['total_chunks']} chunks")
    
    return result


if __name__ == "__main__":
    # Run example
    asyncio.run(example_usage())