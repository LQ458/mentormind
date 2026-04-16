"""
Volcengine TTS Service Implementation
Uses Volcengine (豆包语音) HTTP TTS endpoint for high-quality speech synthesis.
Legacy module name kept for backward compatibility with imports.
"""

import aiohttp
import base64
import os
import uuid
import logging
from typing import Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
from dotenv import load_dotenv
from config.config import config

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

VOLCENGINE_TTS_URL = "https://openspeech.bytedance.com/api/v1/tts"
VOLCENGINE_CLUSTER = "volcano_tts"

@dataclass
class TTSResult:
    """TTS conversion result"""
    audio_path: str
    duration: float  # seconds
    format: str

class SiliconFlowTTSService:
    """TTS service using Volcengine Cloud API (legacy class name kept for compatibility)"""

    def __init__(self, app_id: Optional[str] = None, token: Optional[str] = None):
        self.app_id = app_id or os.getenv("VOLC_TTS_APPID", "")
        self.token = token or os.getenv("VOLC_TTS_TOKEN", "")

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
        Convert text to speech using Volcengine TTS.
        voice_label is used as the voice_type for Volcengine.
        """
        if not self.token:
            raise ValueError("VOLC_TTS_TOKEN is not set")

        # Resolve voice_type: use voice_label directly as Volcengine voice_type
        voice_type = voice_label

        payload = {
            "app": {
                "appid": self.app_id,
                "token": self.token,
                "cluster": VOLCENGINE_CLUSTER,
            },
            "user": {
                "uid": "mentormind_user",
            },
            "audio": {
                "voice_type": voice_type,
                "encoding": output_format,
                "rate": 24000,
                "speed_ratio": 1.0,
                "volume_ratio": 1.0,
                "pitch_ratio": 1.0,
            },
            "request": {
                "reqid": str(uuid.uuid4()),
                "text": text,
                "text_type": "plain",
                "operation": "query",
            },
        }

        headers = {
            "Authorization": f"Bearer;{self.token}",
            "Content-Type": "application/json",
        }

        try:
            connector = aiohttp.TCPConnector(ssl=config.VERIFY_SSL)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.post(VOLCENGINE_TTS_URL, headers=headers, json=payload) as response:
                    resp_json = await response.json()

                    if resp_json.get("code") != 3000:
                        error_msg = resp_json.get("message", "Unknown error")
                        raise Exception(f"Volcengine TTS error {resp_json.get('code')}: {error_msg}")

                    if output_path is None:
                        output_dir = os.path.join(config.DATA_DIR, "audio")
                        os.makedirs(output_dir, exist_ok=True)
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        output_path = os.path.join(output_dir, f"tts_{timestamp}.{output_format}")

                    audio_data = base64.b64decode(resp_json["data"])
                    with open(output_path, 'wb') as f:
                        f.write(audio_data)

                    # Get duration from response (milliseconds)
                    duration_ms = float(resp_json.get("addition", {}).get("duration", "0"))
                    duration = duration_ms / 1000.0
                    if duration <= 0:
                        # Fallback: estimate from text length
                        words = len(text) / 2
                        duration = max(1.0, words / 2.5)

                    logger.info(f"Generated TTS audio: {output_path}")
                    return TTSResult(audio_path=output_path, duration=duration, format=output_format)

        except Exception as e:
            logger.error(f"Failed to generate speech with Volcengine: {e}")
            raise
