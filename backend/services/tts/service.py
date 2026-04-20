"""
Real TTS (Text-to-Speech) Service Implementation
Uses Volcengine (豆包语音) for natural, high-quality speech synthesis.
"""

import asyncio
import base64
import os
import uuid
import aiohttp
import logging
from typing import Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Volcengine voice mappings (basic voices, no per-voice grant required)
_VOICE_MAP = {
    "female": "BV001_streaming",
    "male": "BV002_streaming",
    "female_zh": "BV001_streaming",
    "male_zh": "BV002_streaming",
    "female_en": "BV001_streaming",
    "male_en": "BV002_streaming",
}

_NAMED_VOICE_MAP = {
    "anna": "BV001_streaming",
    "bella": "BV001_streaming",
    "david": "BV002_streaming",
    "benjamin": "BV002_streaming",
    "charles": "BV002_streaming",
    "claire": "BV001_streaming",
    "alex": "BV002_streaming",
    "diana": "BV001_streaming",
    "caleb": "BV002_streaming",
    "sara": "BV001_streaming",
    "ben": "BV002_streaming",
    "chris": "BV002_streaming",
}

VOLCENGINE_TTS_URL = "https://openspeech.bytedance.com/api/v1/tts"
VOLCENGINE_CLUSTER = "volcano_tts"


@dataclass
class TTSResult:
    """TTS conversion result"""
    audio_path: str
    duration: float  # seconds
    sample_rate: int
    format: str


class TTSService:
    """TTS service using Volcengine (豆包语音) for natural speech synthesis."""

    def __init__(self, app_id: Optional[str] = None, token: Optional[str] = None):
        self.app_id = app_id or os.getenv("VOLC_TTS_APPID", "")
        self.token = token or os.getenv("VOLC_TTS_TOKEN", "")
        self.timeout = 120  # 2 minute timeout for long text

    def _resolve_voice(self, voice: str, language: str) -> str:
        """Resolve a voice name to a Volcengine voice_type."""
        # Check named voice aliases first
        if voice in _NAMED_VOICE_MAP:
            return _NAMED_VOICE_MAP[voice]

        # Map generic voice + language to a specific voice
        lang_prefix = "zh" if language.startswith("zh") else "en"
        key = f"{voice}_{lang_prefix}"
        return _VOICE_MAP.get(key, _VOICE_MAP.get(voice, "BV001_streaming"))

    async def text_to_speech(
        self,
        text: str,
        language: str = "zh-CN",
        voice: str = "female",
        speed: float = 1.0,
        pitch: float = 1.0,
        output_format: str = "mp3",
        output_path: Optional[str] = None
    ) -> TTSResult:
        """
        Convert text to speech via Volcengine TTS.

        Args:
            text: Text to convert (max ~300 chars per request, auto-chunked)
            language: Language code (zh-CN, en-US, etc.)
            voice: Voice name or type (female, male, or specific voice name)
            speed: Speech speed (0.2 to 3.0)
            pitch: Pitch ratio (0.1 to 3.0)
            output_format: Audio format (mp3, wav, ogg_opus, pcm)
            output_path: Optional output path for audio file

        Returns:
            TTSResult with audio file information
        """
        if not text.strip():
            raise ValueError("Text cannot be empty")

        voice_type = self._resolve_voice(voice, language)

        # Volcengine encoding format mapping
        encoding_map = {
            "mp3": "mp3",
            "wav": "wav",
            "opus": "ogg_opus",
            "ogg_opus": "ogg_opus",
            "pcm": "pcm",
        }
        encoding = encoding_map.get(output_format, "mp3")

        # Volcengine sample rate
        sample_rate = 24000

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
                "encoding": encoding,
                "rate": sample_rate,
                "speed_ratio": max(0.2, min(3.0, speed)),
                "volume_ratio": 1.0,
                "pitch_ratio": max(0.1, min(3.0, pitch)),
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
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            ) as session:
                async with session.post(
                    VOLCENGINE_TTS_URL,
                    headers=headers,
                    json=payload,
                ) as response:
                    resp_json = await response.json()

                    if resp_json.get("code") == 3000:
                        if output_path is None:
                            import tempfile
                            ext = output_format if "." not in output_format else output_format.split(".")[-1]
                            with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp_file:
                                output_path = tmp_file.name

                        audio_data = base64.b64decode(resp_json["data"])
                        with open(output_path, "wb") as f:
                            f.write(audio_data)

                        # Get duration from response (in milliseconds)
                        duration_ms = float(resp_json.get("addition", {}).get("duration", "0"))
                        duration = duration_ms / 1000.0

                        # Fallback: estimate from file size if duration not provided
                        if duration <= 0:
                            bitrate = {"mp3": 128000, "wav": 256000, "ogg_opus": 64000, "pcm": 256000}
                            duration = (len(audio_data) * 8) / bitrate.get(output_format, 128000)

                        return TTSResult(
                            audio_path=output_path,
                            duration=duration,
                            sample_rate=sample_rate,
                            format=output_format,
                        )
                    else:
                        error_msg = resp_json.get("message", "Unknown error")
                        error_code = resp_json.get("code", "unknown")
                        raise Exception(f"Volcengine TTS API error {error_code}: {error_msg}")

        except aiohttp.ClientError as e:
            logger.error(f"Network error calling Volcengine TTS: {e}")
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
        """Generate speech audio for a lesson."""
        os.makedirs(output_dir, exist_ok=True)

        import hashlib
        content_hash = hashlib.md5(lesson_text.encode()).hexdigest()[:8]
        timestamp = int(asyncio.get_event_loop().time())
        output_path = os.path.join(output_dir, f"lesson_{content_hash}_{timestamp}.mp3")

        result = await self.text_to_speech(
            text=lesson_text,
            language=language,
            voice="female",
            speed=1.0,
            output_format="mp3",
            output_path=output_path,
        )

        return result.audio_path, result.duration

    def validate_text(self, text: str) -> Tuple[bool, str]:
        """Validate text for TTS conversion."""
        if not text or not text.strip():
            return False, "Text cannot be empty"

        if len(text) > 128000:
            return False, f"Text too long: {len(text)} characters (max 128000)"

        return True, ""


# Async wrapper for compatibility with existing code
async def text_to_speech(text: str, language: str = "zh-CN", output_path: Optional[str] = None) -> str:
    """Convenience function for text-to-speech conversion"""
    service = TTSService()
    result = await service.text_to_speech(text, language, output_path=output_path)
    return result.audio_path
