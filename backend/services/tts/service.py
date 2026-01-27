"""
Real TTS (Text-to-Speech) Service Implementation
"""

import asyncio
import os
import aiohttp
import logging
from typing import Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class TTSResult:
    """TTS conversion result"""
    audio_path: str
    duration: float  # seconds
    sample_rate: int
    format: str


class TTSService:
    """Real TTS service for text-to-speech conversion"""
    
    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None):
        """
        Initialize TTS service
        
        Args:
            api_url: TTS API endpoint URL
            api_key: API key for authentication
        """
        self.api_url = api_url or os.getenv("TTS_API_URL", "http://localhost:8890")
        self.api_key = api_key or os.getenv("TTS_API_KEY", "")
        self.timeout = 60  # 1 minute timeout
        
    async def text_to_speech(
        self,
        text: str,
        language: str = "zh-CN",
        voice: str = "female",
        speed: float = 1.0,
        pitch: float = 1.0,
        output_format: str = "wav",
        output_path: Optional[str] = None
    ) -> TTSResult:
        """
        Convert text to speech
        
        Args:
            text: Text to convert to speech
            language: Language code (zh-CN, en-US, etc.)
            voice: Voice type (female, male, etc.)
            speed: Speech speed (0.5 to 2.0)
            pitch: Speech pitch (0.5 to 2.0)
            output_format: Audio format (wav, mp3, etc.)
            output_path: Optional output path for audio file
            
        Returns:
            TTSResult with audio file information
        """
        if not text.strip():
            raise ValueError("Text cannot be empty")
        
        try:
            # Prepare request
            form_data = aiohttp.FormData()
            form_data.add_field('text', text)
            form_data.add_field('language', language)
            form_data.add_field('voice', voice)
            form_data.add_field('speed', str(speed))
            form_data.add_field('pitch', str(pitch))
            form_data.add_field('format', output_format)
            
            if self.api_key:
                form_data.add_field('api_key', self.api_key)
            
            # Send request to TTS API
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self.timeout)) as session:
                async with session.post(f"{self.api_url}/tts", data=form_data) as response:
                    if response.status == 200:
                        # Get content type
                        content_type = response.headers.get('Content-Type', '')
                        
                        # Determine output path
                        if output_path is None:
                            import tempfile
                            ext = output_format if '.' not in output_format else output_format.split('.')[-1]
                            with tempfile.NamedTemporaryFile(suffix=f'.{ext}', delete=False) as tmp_file:
                                output_path = tmp_file.name
                        
                        # Save audio file
                        audio_data = await response.read()
                        with open(output_path, 'wb') as f:
                            f.write(audio_data)
                        
                        # Parse metadata from headers
                        duration = float(response.headers.get('X-Audio-Duration', 0))
                        sample_rate = int(response.headers.get('X-Audio-Sample-Rate', 16000))
                        
                        return TTSResult(
                            audio_path=output_path,
                            duration=duration,
                            sample_rate=sample_rate,
                            format=output_format
                        )
                    else:
                        error_text = await response.text()
                        raise Exception(f"TTS API error {response.status}: {error_text}")
                        
        except aiohttp.ClientError as e:
            logger.error(f"Network error calling TTS service: {e}")
            raise
        except Exception as e:
            logger.error(f"Error converting text to speech: {e}")
            raise
    
    async def generate_speech_for_lesson(
        self,
        lesson_text: str,
        language: str = "zh-CN",
        output_dir: str = "./data/audio"
    ) -> Tuple[str, float]:
        """
        Generate speech audio for a lesson
        
        Args:
            lesson_text: Lesson text to convert to speech
            language: Language code
            output_dir: Output directory for audio files
            
        Returns:
            Tuple of (audio_file_path, duration_seconds)
        """
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate filename based on content hash
        import hashlib
        content_hash = hashlib.md5(lesson_text.encode()).hexdigest()[:8]
        timestamp = int(asyncio.get_event_loop().time())
        output_path = os.path.join(output_dir, f"lesson_{content_hash}_{timestamp}.wav")
        
        # Convert text to speech
        result = await self.text_to_speech(
            text=lesson_text,
            language=language,
            voice="female",  # Default to female voice for lessons
            speed=1.0,
            pitch=1.0,
            output_format="wav",
            output_path=output_path
        )
        
        return result.audio_path, result.duration
    
    def validate_text(self, text: str) -> Tuple[bool, str]:
        """
        Validate text for TTS conversion
        
        Args:
            text: Text to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not text or not text.strip():
            return False, "Text cannot be empty"
        
        # Check text length (max 5000 characters)
        if len(text) > 5000:
            return False, f"Text too long: {len(text)} characters (max 5000)"
        
        # Check for invalid characters
        import re
        # Allow Chinese characters, English letters, numbers, and common punctuation
        if not re.match(r'^[\u4e00-\u9fff\w\s\.,;:!?()\[\]{}"\'\-—–/\\+*=@#$%^&|<>~`]+$', text):
            return False, "Text contains invalid characters"
        
        return True, ""


# Async wrapper for compatibility with existing code
async def text_to_speech(text: str, language: str = "zh-CN", output_path: Optional[str] = None) -> str:
    """Convenience function for text-to-speech conversion"""
    service = TTSService()
    result = await service.text_to_speech(text, language, output_path=output_path)
    return result.audio_path