"""
Real PaddleOCR Service Implementation
"""

import asyncio
import os
import cv2
import numpy as np
from typing import List, Tuple, Optional, Dict, Any
import aiohttp
import logging
from dataclasses import dataclass
import tempfile

logger = logging.getLogger(__name__)


@dataclass
class OCRResult:
    """OCR result for a single text region"""
    bbox: List[Tuple[int, int]]  # 4 points of bounding box
    text: str
    confidence: float
    angle: float = 0.0


@dataclass
class FrameOCRResult:
    """OCR results for a video frame"""
    timestamp: float  # seconds
    frame_image: np.ndarray
    ocr_results: List[OCRResult]
    text_summary: str = ""
    
    def get_combined_text(self) -> str:
        """Combine all OCR text results"""
        if self.text_summary:
            return self.text_summary
        texts = [result.text for result in self.ocr_results]
        return "\n".join(texts)


class PaddleOCRService:
    """Real PaddleOCR service for text extraction from images/video"""
    
    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None):
        """
        Initialize PaddleOCR service
        
        Args:
            api_url: PaddleOCR API endpoint URL
            api_key: API key for authentication
        """
        self.api_url = api_url or os.getenv("PADDLEOCR_API_URL", "http://localhost:8889")
        self.api_key = api_key or os.getenv("PADDLEOCR_API_KEY", "")
        self.timeout = 60  # 1 minute timeout
        
    async def extract_text_from_image(
        self, 
        image_path: str, 
        language: str = "ch",
        use_angle_cls: bool = True,
        det_db_thresh: float = 0.3,
        det_db_box_thresh: float = 0.5
    ) -> List[OCRResult]:
        """
        Extract text from image using PaddleOCR
        
        Args:
            image_path: Path to image file
            language: Language code (ch, en, etc.)
            use_angle_cls: Whether to use angle classification
            det_db_thresh: Text detection threshold
            det_db_box_thresh: Text box threshold
            
        Returns:
            List of OCR results
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")
        
        try:
            # Read image file
            with open(image_path, 'rb') as f:
                image_data = f.read()
            
            # Prepare request
            form_data = aiohttp.FormData()
            form_data.add_field('image_file', image_data, 
                              filename=os.path.basename(image_path),
                              content_type='image/jpeg')
            form_data.add_field('language', language)
            form_data.add_field('use_angle_cls', str(use_angle_cls).lower())
            form_data.add_field('det_db_thresh', str(det_db_thresh))
            form_data.add_field('det_db_box_thresh', str(det_db_box_thresh))
            
            if self.api_key:
                form_data.add_field('api_key', self.api_key)
            
            # Send request to PaddleOCR API
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self.timeout)) as session:
                async with session.post(f"{self.api_url}/ocr", data=form_data) as response:
                    if response.status == 200:
                        result = await response.json()
                        return self._parse_response(result)
                    else:
                        error_text = await response.text()
                        raise Exception(f"PaddleOCR API error {response.status}: {error_text}")
                        
        except aiohttp.ClientError as e:
            logger.error(f"Network error calling PaddleOCR: {e}")
            raise
        except Exception as e:
            logger.error(f"Error extracting text from image: {e}")
            raise
    
    def _parse_response(self, response: dict) -> List[OCRResult]:
        """Parse PaddleOCR API response"""
        results = []
        
        if 'results' in response:
            for item in response['results']:
                # Parse bounding box
                bbox = []
                if 'bbox' in item:
                    for point in item['bbox']:
                        bbox.append((point[0], point[1]))
                
                # Create OCRResult
                result = OCRResult(
                    bbox=bbox,
                    text=item.get('text', ''),
                    confidence=item.get('confidence', 1.0),
                    angle=item.get('angle', 0.0)
                )
                results.append(result)
        
        return results
    
    async def extract_text_from_video_frame(
        self, 
        frame: np.ndarray, 
        timestamp: float,
        language: str = "ch"
    ) -> FrameOCRResult:
        """
        Extract text from video frame
        
        Args:
            frame: Video frame as numpy array
            timestamp: Frame timestamp in seconds
            language: Language code
            
        Returns:
            FrameOCRResult with OCR results
        """
        # Save frame to temporary file
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_file:
            tmp_path = tmp_file.name
            cv2.imwrite(tmp_path, frame)
        
        try:
            # Extract text from the saved image
            ocr_results = await self.extract_text_from_image(tmp_path, language)
            
            # Create text summary
            texts = [result.text for result in ocr_results]
            text_summary = "\n".join(texts) if texts else ""
            
            return FrameOCRResult(
                timestamp=timestamp,
                frame_image=frame,
                ocr_results=ocr_results,
                text_summary=text_summary
            )
        finally:
            # Clean up temporary file
            os.unlink(tmp_path)
    
    async def process_video_frames(
        self, 
        video_path: str, 
        frame_interval: float = 1.0,
        language: str = "ch"
    ) -> List[FrameOCRResult]:
        """
        Process video frames at regular intervals
        
        Args:
            video_path: Path to video file
            frame_interval: Interval between frames to process (seconds)
            language: Language code
            
        Returns:
            List of FrameOCRResult for processed frames
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")
        
        # Open video file
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise Exception(f"Cannot open video file: {video_path}")
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_skip = int(fps * frame_interval)
        
        results = []
        frame_count = 0
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Process frame at interval
                if frame_count % frame_skip == 0:
                    timestamp = frame_count / fps
                    
                    try:
                        frame_result = await self.extract_text_from_video_frame(
                            frame, timestamp, language
                        )
                        results.append(frame_result)
                        logger.info(f"Processed frame at {timestamp:.2f}s: {len(frame_result.ocr_results)} text regions")
                    except Exception as e:
                        logger.warning(f"Error processing frame at {timestamp:.2f}s: {e}")
                
                frame_count += 1
                
        finally:
            cap.release()
        
        return results
    
    def validate_image_file(self, image_path: str) -> Tuple[bool, str]:
        """
        Validate image file for OCR
        
        Args:
            image_path: Path to image file
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not os.path.exists(image_path):
            return False, f"File not found: {image_path}"
        
        # Check file size
        file_size = os.path.getsize(image_path)
        if file_size == 0:
            return False, "Image file is empty"
        
        # Check file extension
        valid_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'}
        ext = os.path.splitext(image_path)[1].lower()
        if ext not in valid_extensions:
            return False, f"Unsupported image format: {ext}. Supported: {valid_extensions}"
        
        # Check file size limits (50MB max)
        if file_size > 50 * 1024 * 1024:
            return False, f"Image file too large: {file_size/1024/1024:.1f}MB (max 50MB)"
        
        return True, ""


# Async wrapper for compatibility with existing code
async def extract_text_from_image(image_path: str, language: str = "ch") -> str:
    """Convenience function for text extraction from image"""
    service = PaddleOCRService()
    results = await service.extract_text_from_image(image_path, language)
    
    # Combine all text results
    texts = [result.text for result in results]
    return "\n".join(texts) if texts else ""