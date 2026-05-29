from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from typing import Any, AsyncGenerator, Optional

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
        cjk = sum(1 for ch in text if "一" <= ch <= "鿿")
        non_cjk = max(0, len(text) - cjk)
        return int(cjk * 200 + non_cjk * 80) + 400
    words = max(1, len(text.split()))
    return int(words * 380) + 400


def _fast_mode_enabled() -> bool:
    """Whether ``BOARD_FAST_MODE`` is set to a truthy value.

    When fast mode is on the backend skips TTS entirely; the frontend falls
    back to ``window.speechSynthesis`` for narration. This trades audio
    quality for time-to-first-element.
    """
    raw = os.environ.get("BOARD_FAST_MODE", "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


# Cap concurrent TTS API calls so we don't flood the synth backend when an
# orchestrator emits a burst of elements. Wave 1F target.
_TTS_PARALLELISM = 4


class BoardTTSSync:
    """Decoupled TTS pipeline that paces audio independently of board events.

    Wave 1F design:
      * ``element_added`` events flow through immediately so the client renders
        the element the moment the LLM produces it.
      * TTS synthesis runs in parallel background tasks (capped by a
        semaphore) and pushes ``audio_ready`` / ``audio_error`` events into a
        shared queue.
      * The frontend already plays ``audioQueue`` sequentially, so the
        client preserves narration order even though the network events
        arrive out-of-order with respect to the elements they describe.
      * When ``BOARD_FAST_MODE`` is set, TTS is skipped entirely — the
        client uses Web Speech API for narration and we save the round-trip
        latency of every TTS call.
    """

    def __init__(
        self,
        tts_service: Optional[Any] = None,
        language: str = "zh-CN",
        voice: str = "female",
        max_parallel: int = _TTS_PARALLELISM,
    ) -> None:
        self._tts_service = tts_service
        self._language = language
        self._voice = voice
        self._max_parallel = max(1, int(max_parallel))

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
        """Yield board events with audio events interleaved as TTS completes.

        Behavior:
          * Board events (``element_added``, ``element_updated``, …) yield
            immediately when the orchestrator produces them. The pipeline
            does NOT block on TTS.
          * For each event with attached narration, a background task is
            scheduled (subject to the parallelism semaphore) that synthesizes
            audio and emits ``audio_ready`` (or ``audio_error``) into the
            same out-stream.
          * When ``BOARD_FAST_MODE`` is set, we skip TTS scheduling entirely
            and let the client handle narration via Web Speech API.
        """
        fast_mode = _fast_mode_enabled()
        if fast_mode:
            logger.info("BoardTTSSync running in fast mode — TTS skipped")

        out_queue: "asyncio.Queue[Optional[BoardEvent]]" = asyncio.Queue()
        semaphore = asyncio.Semaphore(self._max_parallel)
        pending: set[asyncio.Task[None]] = set()

        async def _synth_and_emit(text: str, element_id: Optional[str]) -> None:
            try:
                async with semaphore:
                    audio_event = await self._generate_audio_event(text, element_id)
                if audio_event is not None:
                    await out_queue.put(audio_event)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # defensive: a task failure must not stall the stream
                logger.exception("TTS background task crashed: %s", exc)

        def _spawn_tts(text: str, element_id: Optional[str]) -> None:
            task = asyncio.create_task(_synth_and_emit(text, element_id))
            pending.add(task)
            task.add_done_callback(pending.discard)

        async def _producer() -> None:
            """Pump board events into the out-queue and schedule TTS."""
            try:
                async for event in board_events:
                    await out_queue.put(event)

                    narration_text = self._extract_narration(event)
                    if not narration_text:
                        continue

                    if fast_mode:
                        # Hint the client that narration is available locally.
                        await out_queue.put(
                            BoardEvent(
                                event_type="narration_pending",
                                timestamp=time.time(),
                                element_id=event.element_id,
                                data={
                                    "narration_text": narration_text,
                                    "fast_mode": True,
                                },
                            )
                        )
                        continue

                    # Tell the client TTS is in flight so the writing
                    # indicator can show before audio_ready lands.
                    await out_queue.put(
                        BoardEvent(
                            event_type="narration_pending",
                            timestamp=time.time(),
                            element_id=event.element_id,
                            data={"narration_text": narration_text},
                        )
                    )
                    _spawn_tts(narration_text, event.element_id)
            except asyncio.CancelledError:
                raise
            finally:
                # Wait for outstanding TTS tasks to drain so the consumer
                # sees their audio events before the queue closes.
                if pending:
                    try:
                        await asyncio.gather(*pending, return_exceptions=True)
                    except asyncio.CancelledError:
                        for t in pending:
                            t.cancel()
                        raise
                await out_queue.put(None)  # sentinel: producer + workers done

        producer_task = asyncio.create_task(_producer())

        try:
            while True:
                item = await out_queue.get()
                if item is None:
                    break
                yield item
        except asyncio.CancelledError:
            producer_task.cancel()
            for t in pending:
                t.cancel()
            raise
        finally:
            if not producer_task.done():
                producer_task.cancel()
                try:
                    await producer_task
                except (asyncio.CancelledError, Exception):
                    pass
