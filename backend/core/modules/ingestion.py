"""
Multimodal Ingestion Module - The "Senses"
Handles audio/video processing and alignment to solve referential ambiguity
"""

import asyncio
import json
import os
import cv2
import numpy as np
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import logging

from config import config
try:
    from services.funasr import FunASRService
    from services.paddleocr import PaddleOCRService
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from services.funasr import FunASRService
    from services.paddleocr import PaddleOCRService

logger = logging.getLogger(__name__)


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
        self.funasr_service = FunASRService()
    
    async def transcribe(self, audio_path: str) -> List[Tuple[float, str]]:
        """
        Transcribe audio with timestamps using real FunASR service
        Returns: List of (timestamp_seconds, text)
        """
        logger.info(f"Transcribing audio: {audio_path}")
        
        try:
            # Use real FunASR service
            segments = await self.funasr_service.transcribe_with_timestamps(audio_path)
            
            if not segments:
                logger.warning(f"No transcription results for: {audio_path}")
                return []
            
            logger.info(f"Transcribed {len(segments)} segments from: {audio_path}")
            return segments
            
        except Exception as e:
            logger.error(f"Error transcribing audio {audio_path}: {e}")
            raise
    
    def validate_audio(self, audio_path: str) -> bool:
        """Validate audio file format and quality"""
        is_valid, error_msg = self.funasr_service.validate_audio_file(audio_path)
        if not is_valid:
            logger.warning(f"Invalid audio file {audio_path}: {error_msg}")
        return is_valid


class VideoProcessor:
    """Handles video frame extraction and OCR using PaddleOCR"""
    
    def __init__(self):
        self.frame_rate = config.VIDEO_FRAME_RATE
        self.scene_change_threshold = config.SCENE_CHANGE_THRESHOLD
        self.ocr_config = config.get_models()["paddle_ocr"]
        self.paddleocr_service = PaddleOCRService()
    
    async def extract_slides(self, video_path: str) -> List[Tuple[float, str, np.ndarray]]:
        """
        Extract slides at scene changes using real PaddleOCR service
        Returns: List of (timestamp_seconds, ocr_text, visual_embedding)
        """
        logger.info(f"Processing video: {video_path}")
        
        try:
            # Process video frames at scene changes
            frames = await self._extract_scene_frames(video_path)
            
            results = []
            for timestamp, frame in frames:
                # Extract text from frame using PaddleOCR
                frame_result = await self.paddleocr_service.extract_text_from_video_frame(
                    frame, timestamp, language="ch"
                )
                
                # Get visual embedding (simplified - would use image embedding model)
                visual_embedding = self._extract_visual_embedding(frame)
                
                results.append((
                    timestamp,
                    frame_result.get_combined_text(),
                    visual_embedding
                ))
            
            logger.info(f"Extracted {len(results)} slides from: {video_path}")
            return results
            
        except Exception as e:
            logger.error(f"Error processing video {video_path}: {e}")
            raise
    
    async def _extract_scene_frames(self, video_path: str) -> List[Tuple[float, np.ndarray]]:
        """Extract frames at scene changes"""
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise Exception(f"Cannot open video file: {video_path}")
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = []
        prev_frame = None
        frame_count = 0
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                timestamp = frame_count / fps
                
                # Detect scene change
                if prev_frame is None or self.detect_scene_change(prev_frame, frame):
                    frames.append((timestamp, frame.copy()))
                    prev_frame = frame.copy()
                
                frame_count += 1
                
                # Limit processing for long videos
                if frame_count > 1000:  # Process max 1000 frames
                    break
                    
        finally:
            cap.release()
        
        return frames
    
    def detect_scene_change(self, frame1: np.ndarray, frame2: np.ndarray) -> bool:
        """Detect if scene has changed significantly"""
        if frame1 is None or frame2 is None:
            return True
        
        # Convert to grayscale for comparison
        gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)
        
        # Calculate structural similarity
        from skimage.metrics import structural_similarity as ssim
        score, _ = ssim(gray1, gray2, full=True)
        
        # Lower score means more different
        return score < (1.0 - self.scene_change_threshold)
    
    def _extract_visual_embedding(self, frame: np.ndarray) -> np.ndarray:
        """Extract visual embedding from frame (simplified)"""
        # In production, would use a pre-trained image embedding model
        # For now, use a simple histogram-based feature
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        hist = cv2.calcHist([gray], [0], None, [64], [0, 256])
        hist = cv2.normalize(hist, hist).flatten()
        return hist


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