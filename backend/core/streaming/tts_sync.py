from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from typing import Any, AsyncGenerator, Dict, Optional

from config import config
from core.board.models import BoardEvent

logger = logging.getLogger(__name__)


def _estimate_duration_ms(text: str, language: str = "zh-CN") -> int:
    """Fallback duration estimate when the TTS backend does not return one.

    Roughly: Chinese ≈ 200ms per character, English ≈ 380ms per word.
    """
    if not text:
        return 0
    if language.lower().startswith("zh"):
        # Count CJK characters; ignore punctuation/whitespace
        cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
        non_cjk = max(0, len(text) - cjk)
        return int(cjk * 200 + non_cjk * 80) + 400
    words = max(1, len(text.split()))
    return int(words * 380) + 400


class BoardTTSSync:
    """Synchronous TTS pipeline that paces board events to narration playback.

    Each board event is yielded first (so the client renders the element),
    then its narration is synthesized, the ``audio_ready`` event is yielded,
    and we sleep for the audio's playback duration before letting the next
    board event through. This keeps the board one-step-ahead of the voice
    instead of rendering every element up front and narrating them later.
    """

    def __init__(self, tts_service: Optional[Any] = None, language: str = "zh-CN", voice: str = "female"):
        self._tts_service = tts_service
        self._language = language
        self._voice = voice

    async def _get_tts_service(self) -> Any:
        if self._tts_service is None:
            from services.tts.service import TTSService
            self._tts_service = TTSService()
        return self._tts_service

    async def _generate_audio_event(
        self, narration_text: str, element_id: Optional[str]
    ) -> Optional[BoardEvent]:
        """Synthesize a single narration into an ``audio_ready`` BoardEvent."""
        if not narration_text:
            return None
        try:
            tts = await self._get_tts_service()
            board_audio_dir = os.path.join(config.DATA_DIR, "board-audio")
            os.makedirs(board_audio_dir, exist_ok=True)
            filename = f"{uuid.uuid4().hex}.mp3"
            output_path = os.path.join(board_audio_dir, filename)
            result = await tts.text_to_speech(
                text=narration_text,
                language=self._language,
                voice=self._voice,
                output_path=output_path,
            )
            local_path = (
                result.audio_path if hasattr(result, "audio_path") else str(result)
            )
            rel_name = os.path.basename(local_path)
            audio_path = f"/api/files/board-audio/{rel_name}"
            duration_ms = (
                int(getattr(result, "duration", 0) * 1000)
                if hasattr(result, "duration") and getattr(result, "duration", 0)
                else None
            )
            return BoardEvent(
                event_type="audio_ready",
                timestamp=time.time(),
                element_id=element_id,
                data={
                    "audio_path": audio_path,
                    "duration_ms": duration_ms,
                    "narration_text": narration_text,
                },
            )
        except Exception as exc:
            logger.warning(
                "TTS generation failed for element %s: %s", element_id, exc
            )
            return BoardEvent(
                event_type="audio_error",
                timestamp=time.time(),
                element_id=element_id,
                data={"error": str(exc), "narration_text": narration_text},
            )

    def _extract_narration(self, event: BoardEvent) -> Optional[str]:
        """Pull the narration text attached to an event, if any."""
        if event.event_type == "element_added":
            text = event.data.get("narration")
            if isinstance(text, str) and text.strip():
                return text.strip()
        if event.event_type == "narration":
            text = event.data.get("narration_text")
            if isinstance(text, str) and text.strip():
                return text.strip()
        return None

    async def stream_with_tts(
        self,
        board_events: AsyncGenerator[BoardEvent, None],
    ) -> AsyncGenerator[BoardEvent, None]:
        """Yield board events interleaved with synchronised audio playback."""
        async for event in board_events:
            # 1. Yield the board event itself so the client renders the
            #    element BEFORE narration begins ("board first, voice second").
            yield event

            narration_text = self._extract_narration(event)
            if not narration_text:
                continue

            # 2. Signal that we are generating audio so the UI can show a
            #    "writing the board…" style indicator while TTS is running.
            yield BoardEvent(
                event_type="narration_pending",
                timestamp=time.time(),
                element_id=event.element_id,
                data={"narration_text": narration_text},
            )

            # 3. Synthesize audio synchronously; this is what makes the pipe
            #    paced — we deliberately don't pull the next board event
            #    until the current narration has had time to play.
            audio_event = await self._generate_audio_event(
                narration_text=narration_text,
                element_id=event.element_id,
            )
            if audio_event is None:
                continue
            yield audio_event

            # 4. Pace: hold the pipeline for the estimated playback duration
            #    so the client has time to actually play the narration before
            #    the next board element pours in.
            if audio_event.event_type == "audio_ready":
                duration_ms = audio_event.data.get("duration_ms")
                if not duration_ms or duration_ms <= 0:
                    duration_ms = _estimate_duration_ms(narration_text, self._language)
                # Cap individual waits to 30s to avoid a stuck lesson if a
                # single narration somehow claims an enormous duration.
                sleep_s = max(0.0, min(30.0, duration_ms / 1000.0))
                try:
                    await asyncio.sleep(sleep_s)
                except asyncio.CancelledError:
                    raise
