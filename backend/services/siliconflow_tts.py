"""
SiliconFlow TTS Service Implementation
Using OpenAI-compatible /v1/audio/speech endpoint
"""

import aiohttp
import os
import logging
from typing import Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
from config.config import config

logger = logging.getLogger(__name__)

@dataclass
class TTSResult:
    """TTS conversion result"""
    audio_path: str
    duration: float  # seconds
    format: str

class SiliconFlowTTSService:
    """TTS service using SiliconFlow Cloud API"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("SILICONFLOW_API_KEY")
        self.base_url = "https://api.siliconflow.cn/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
    async def text_to_speech(
        self,
        text: str,
        voice: str = config.TTS_VOICE,
        voice_label: str = config.TTS_VOICE_LABEL,
        output_path: Optional[str] = None,
        output_format: str = "mp3",
        verify_ssl: bool = config.VERIFY_SSL
    ) -> TTSResult:
        """
        Convert text to speech using SiliconFlow
        """
        if not self.api_key:
            raise ValueError("SILICONFLOW_API_KEY is not set")
            
        url = f"{self.base_url}/audio/speech"
        
        payload = {
            "model": voice,
            "input": text,
            "voice": f"{voice}:{voice_label}", # Consistent with documentation for pre-built voices
            "response_format": output_format
        }
        
        try:
            connector = aiohttp.TCPConnector(ssl=config.VERIFY_SSL)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.post(url, headers=self.headers, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"SiliconFlow TTS error {response.status}: {error_text}")
                    
                    if output_path is None:
                        # used global config
                        output_dir = os.path.join(config.DATA_DIR, "audio")
                        os.makedirs(output_dir, exist_ok=True)
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        output_path = os.path.join(output_dir, f"tts_{timestamp}.{output_format}")
                    
                    audio_data = await response.read()
                    with open(output_path, 'wb') as f:
                        f.write(audio_data)
                    
                    # Estimate duration (roughly 150 words per minute)
                    # For a more accurate duration, we'd need to parse the audio file
                    words = len(text) / 2 # Simple heuristic for Chinese/English mix
                    duration = max(1.0, words / 2.5) 
                    
                    logger.info(f"Generated TTS audio: {output_path}")
                    return TTSResult(audio_path=output_path, duration=duration, format=output_format)
                    
        except Exception as e:
            logger.error(f"Failed to generate speech with SiliconFlow: {e}")
            raise
