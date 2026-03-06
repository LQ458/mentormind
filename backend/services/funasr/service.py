"""
Real FunASR Service Implementation
"""

import asyncio
import json
import os
from typing import List, Tuple, Optional
import aiohttp
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class TranscriptionSegment:
    """Transcription segment with timestamp"""
    start_time: float  # seconds
    end_time: float    # seconds
    text: str
    confidence: float


class FunASRService:
    """Real FunASR service for audio transcription"""
    
    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None):
        """
        Initialize FunASR service
        
        Args:
            api_url: FunASR API endpoint URL
            api_key: API key for authentication
        """
        self.api_url = api_url or os.getenv("FUNASR_ENDPOINT", "http://localhost:10095")
        self.api_key = api_key or os.getenv("FUNASR_API_KEY", "")
        self.timeout = 300  # 5 minutes timeout for long audio files
        
    async def transcribe_audio(
        self, 
        audio_path: str, 
        language: str = "zh-CN",
        model: str = "paraformer-zh"
    ) -> List[TranscriptionSegment]:
        """
        Transcribe audio file using FunASR
        
        Args:
            audio_path: Path to audio file
            language: Language code (zh-CN, en-US, etc.)
            model: FunASR model to use
            
        Returns:
            List of transcription segments with timestamps
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        try:
            # Read audio file
            with open(audio_path, 'rb') as f:
                audio_data = f.read()
            
            # Prepare request
            form_data = aiohttp.FormData()
            form_data.add_field('audio_file', audio_data, 
                              filename=os.path.basename(audio_path),
                              content_type='audio/wav')
            form_data.add_field('model', model)
            form_data.add_field('language', language)
            
            if self.api_key:
                form_data.add_field('api_key', self.api_key)
            
            # Send request to FunASR API
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self.timeout)) as session:
                async with session.post(f"{self.api_url}/transcribe", data=form_data) as response:
                    if response.status == 200:
                        result = await response.json()
                        return self._parse_response(result)
                    else:
                        error_text = await response.text()
                        raise Exception(f"FunASR API error {response.status}: {error_text}")
                        
        except aiohttp.ClientError as e:
            logger.error(f"Network error calling FunASR: {e}")
            raise
        except Exception as e:
            logger.error(f"Error transcribing audio: {e}")
            raise
    
    def _parse_response(self, response: dict) -> List[TranscriptionSegment]:
        """Parse FunASR API response"""
        segments = []
        
        if 'segments' in response:
            for seg in response['segments']:
                segment = TranscriptionSegment(
                    start_time=seg.get('start', 0),
                    end_time=seg.get('end', 0),
                    text=seg.get('text', ''),
                    confidence=seg.get('confidence', 1.0)
                )
                segments.append(segment)
        elif 'text' in response:
            # Simple response format
            segment = TranscriptionSegment(
                start_time=0,
                end_time=response.get('duration', 0),
                text=response['text'],
                confidence=response.get('confidence', 1.0)
            )
            segments.append(segment)
        
        return segments
    
    async def transcribe_with_timestamps(self, audio_path: str) -> List[Tuple[float, str]]:
        """
        Transcribe audio and return list of (timestamp, text)
        
        Args:
            audio_path: Path to audio file
            
        Returns:
            List of (timestamp_seconds, text)
        """
        segments = await self.transcribe_audio(audio_path)
        
        # Convert to (timestamp, text) format
        result = []
        for segment in segments:
            # Use start time as timestamp
            result.append((segment.start_time, segment.text))
        
        return result
    
    def validate_audio_file(self, audio_path: str) -> Tuple[bool, str]:
        """
        Validate audio file for transcription
        
        Args:
            audio_path: Path to audio file
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not os.path.exists(audio_path):
            return False, f"File not found: {audio_path}"
        
        # Check file size
        file_size = os.path.getsize(audio_path)
        if file_size == 0:
            return False, "Audio file is empty"
        
        # Check file extension
        valid_extensions = {'.wav', '.mp3', '.m4a', '.flac', '.ogg'}
        ext = os.path.splitext(audio_path)[1].lower()
        if ext not in valid_extensions:
            return False, f"Unsupported audio format: {ext}. Supported: {valid_extensions}"
        
        # Check file size limits (100MB max)
        if file_size > 100 * 1024 * 1024:
            return False, f"Audio file too large: {file_size/1024/1024:.1f}MB (max 100MB)"
        
        return True, ""


# Async wrapper for compatibility with existing code
async def transcribe_audio(audio_path: str, language: str = "zh-CN") -> List[Tuple[float, str]]:
    """Convenience function for audio transcription"""
    service = FunASRService()
    return await service.transcribe_with_timestamps(audio_path)