"""Unit tests for backend/core/streaming/tts_sync.py — TTS pipeline is mocked."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import AsyncGenerator, List

import pytest

from core.board.models import BoardEvent
from core.streaming.tts_sync import BoardTTSSync


@dataclass
class _FakeTTSResult:
    audio_path: str
    duration: float


class _FakeTTSService:
    def __init__(self) -> None:
        self.calls: List[str] = []

    async def text_to_speech(self, text: str, language: str, voice: str) -> _FakeTTSResult:
        self.calls.append(text)
        await asyncio.sleep(0)  # yield
        return _FakeTTSResult(audio_path=f"/tmp/{hash(text) & 0xffff}.mp3", duration=1.0)


async def _events(*events: BoardEvent) -> AsyncGenerator[BoardEvent, None]:
    for ev in events:
        yield ev


@pytest.mark.asyncio
async def test_board_events_passthrough_without_narration() -> None:
    svc = _FakeTTSService()
    sync = BoardTTSSync(tts_service=svc)
    input_events = [
        BoardEvent(event_type="board_created", timestamp=0.0, data={"title": "t"}),
        BoardEvent(event_type="layout_changed", timestamp=0.1, data={"layout": "full_canvas"}),
    ]
    out = [ev async for ev in sync.stream_with_tts(_events(*input_events))]
    assert [e.event_type for e in out] == ["board_created", "layout_changed"]
    assert svc.calls == []


@pytest.mark.asyncio
async def test_narration_triggers_audio_ready() -> None:
    svc = _FakeTTSService()
    sync = BoardTTSSync(tts_service=svc)
    input_events = [
        BoardEvent(
            event_type="element_added",
            timestamp=0.0,
            element_id="el1",
            data={"narration": "Hello world"},
        ),
    ]
    out = [ev async for ev in sync.stream_with_tts(_events(*input_events))]
    types = [e.event_type for e in out]
    assert "element_added" in types
    assert "audio_ready" in types
    audio = next(e for e in out if e.event_type == "audio_ready")
    assert audio.element_id == "el1"
    assert audio.data["narration_text"] == "Hello world"
    assert svc.calls == ["Hello world"]


@pytest.mark.asyncio
async def test_standalone_narration_event_also_generates_tts() -> None:
    svc = _FakeTTSService()
    sync = BoardTTSSync(tts_service=svc)
    input_events = [
        BoardEvent(
            event_type="narration",
            timestamp=0.0,
            element_id=None,
            data={"narration_text": "Transition"},
        ),
    ]
    out = [ev async for ev in sync.stream_with_tts(_events(*input_events))]
    assert svc.calls == ["Transition"]
    assert any(e.event_type == "audio_ready" for e in out)


@pytest.mark.asyncio
async def test_tts_failure_emits_audio_error_not_crash() -> None:
    class _FailingTTS:
        async def text_to_speech(self, text: str, language: str, voice: str):
            raise RuntimeError("TTS provider down")

    sync = BoardTTSSync(tts_service=_FailingTTS())
    input_events = [
        BoardEvent(
            event_type="element_added",
            timestamp=0.0,
            element_id="el1",
            data={"narration": "oops"},
        ),
    ]
    out = [ev async for ev in sync.stream_with_tts(_events(*input_events))]
    types = [e.event_type for e in out]
    assert "audio_error" in types
