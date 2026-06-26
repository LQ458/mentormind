"""Phase 2 tests — learner-paced BACKEND pause in StreamingLessonGenerator.

Covers the additive continue queue / adaptive counters and the boundary-await
guard. Pure unit tests: ``StreamingLessonGenerator.__new__`` bypasses ``__init__``
so no LLM/board dependencies are constructed.
"""

import asyncio

from config import config
from core.board.models import BoardEvent
from core.streaming import lesson_generator as lg
from core.streaming.lesson_generator import StreamingLessonGenerator
from services.api_client import StreamChunk


def _bare_gen() -> StreamingLessonGenerator:
    gen = StreamingLessonGenerator.__new__(StreamingLessonGenerator)
    gen.continue_queue = asyncio.Queue()
    gen._adaptive = {"wrong_streak": 0, "skip_streak": 0}
    gen.backend_pause_wired = True
    gen._pause_unwired_warned = False
    return gen


def test_enqueue_continue_tolerates_none():
    async def run():
        gen = _bare_gen()
        gen.enqueue_continue(None)
        return gen.continue_queue.get_nowait()

    assert asyncio.run(run()) == {}


def test_wait_for_continue_blocks_until_signal_then_injects():
    """_wait_for_continue does not return until a continue is enqueued, then it
    appends the [Learner response] turn and bumps the wrong_streak counter."""

    async def run():
        gen = _bare_gen()
        messages = []

        async def feeder():
            # The await must still be pending when this fires.
            await asyncio.sleep(0.02)
            gen.enqueue_continue({"text": "maybe 42", "answer_correct": False})

        task = asyncio.create_task(feeder())
        await gen._wait_for_continue(messages)
        await task
        return gen, messages

    gen, messages = asyncio.run(run())
    assert messages == [
        {"role": "user", "content": "[Learner response] maybe 42"}
    ]
    assert gen._adaptive["wrong_streak"] == 1
    assert gen._adaptive["skip_streak"] == 0


def test_wait_for_continue_correct_answer_resets_wrong_streak():
    async def run():
        gen = _bare_gen()
        gen._adaptive = {"wrong_streak": 3, "skip_streak": 2}
        messages = []
        gen.enqueue_continue({"answer_correct": True, "skipped": False})
        await gen._wait_for_continue(messages)
        return gen, messages

    gen, messages = asyncio.run(run())
    assert gen._adaptive["wrong_streak"] == 0
    assert gen._adaptive["skip_streak"] == 0
    # No text -> nothing injected into the conversation.
    assert messages == []


def test_wait_for_continue_skip_increments_skip_streak():
    async def run():
        gen = _bare_gen()
        messages = []
        gen.enqueue_continue({"skipped": True})
        await gen._wait_for_continue(messages)
        return gen, messages

    gen, messages = asyncio.run(run())
    assert gen._adaptive["skip_streak"] == 1
    assert messages == []


def test_wait_for_continue_bare_note_resets_skip_streak():
    """A bare continue (only text, no skipped / answer_correct) resets skip_streak
    to 0 and leaves wrong_streak at 0."""

    async def run():
        gen = _bare_gen()
        gen._adaptive = {"wrong_streak": 0, "skip_streak": 5}
        messages = []
        gen.enqueue_continue({"text": "just a note"})
        await gen._wait_for_continue(messages)
        return gen, messages

    gen, messages = asyncio.run(run())
    assert gen._adaptive["skip_streak"] == 0
    assert gen._adaptive["wrong_streak"] == 0
    assert messages == [{"role": "user", "content": "[Learner response] just a note"}]


def test_wait_for_continue_timeout_returns_cleanly(monkeypatch):
    """A timeout must return without mutating messages or counters."""

    async def fake_wait_for(coro, timeout):
        # Drain the queue coroutine to avoid 'never awaited' warnings.
        if hasattr(coro, "close"):
            coro.close()
        raise asyncio.TimeoutError

    async def run():
        gen = _bare_gen()
        messages = []
        monkeypatch.setattr(lg.asyncio, "wait_for", fake_wait_for)
        await gen._wait_for_continue(messages)
        return gen, messages

    gen, messages = asyncio.run(run())
    assert messages == []
    assert gen._adaptive == {"wrong_streak": 0, "skip_streak": 0}


def test_backend_pause_off_by_default():
    """The flag gating the boundary await must default OFF (zero behavior change)."""
    assert config.BOARD_BACKEND_PAUSE is False


class _FakeLLMClient:
    """First round yields the supplied tool-call chunks then done; every later
    round yields only a done chunk (no tool calls) so the core generator ends."""

    def __init__(self, chunks):
        self._chunks = chunks
        self._round = 0

    async def chat_completion_stream(self, **_kwargs):
        self._round += 1
        if self._round == 1:
            for chunk in self._chunks:
                yield chunk
        else:
            yield StreamChunk(chunk_type="done")


class _FakeBoardServer:
    """Returns a non-last segment_boundary event for any tool call."""

    def __init__(self, event):
        self._event = event

    def handle_tool_call_safe(self, _name, _args):
        return self._event


def _integration_gen() -> StreamingLessonGenerator:
    """A generator wired enough to drive _generate_lesson_core without the LLM
    or real board/prompt dependencies."""
    gen = StreamingLessonGenerator.__new__(StreamingLessonGenerator)
    gen.continue_queue = asyncio.Queue()
    gen.user_message_queue = asyncio.Queue()
    gen._adaptive = {"wrong_streak": 0, "skip_streak": 0}
    gen.backend_pause_wired = True
    gen._pause_unwired_warned = False
    gen._current_messages = None
    gen.model = "deepseek-v4-flash"
    gen.agent_tools_server = None
    gen._build_initial_messages = lambda **_kw: [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "teach"},
    ]

    async def _no_follow_up(_messages):
        return False

    gen._wait_for_follow_up = _no_follow_up
    return gen


def test_boundary_pause_invokes_wait_for_continue(monkeypatch):
    """Integration: with BOARD_BACKEND_PAUSE on + backend_pause_wired, a non-last
    segment_boundary drives _wait_for_continue exactly once after the round."""

    monkeypatch.setattr(config, "BOARD_BACKEND_PAUSE", True)
    monkeypatch.setattr(config, "BOARD_PACING_MODE", "learner_paced")

    boundary_event = BoardEvent(
        event_type="segment_boundary",
        timestamp=0.0,
        data={"is_last_segment": False},
    )
    chunks = [
        StreamChunk(
            chunk_type="tool_call_complete",
            tool_call_id="tc1",
            tool_name="end_segment",
            tool_arguments="{}",
        ),
        StreamChunk(chunk_type="done"),
    ]

    gen = _integration_gen()
    gen.llm_client = _FakeLLMClient(chunks)
    gen.board_server = _FakeBoardServer(boundary_event)

    calls = {"n": 0}

    async def fake_wait(messages):
        calls["n"] += 1

    gen._wait_for_continue = fake_wait

    async def run():
        events = []
        async for ev in gen._generate_lesson_core(topic="t"):
            events.append(ev)
        return events

    events = asyncio.run(run())
    assert any(ev.event_type == "segment_boundary" for ev in events)
    assert calls["n"] == 1


def test_boundary_pause_skipped_when_not_wired(monkeypatch):
    """With BOARD_BACKEND_PAUSE on but backend_pause_wired False, the boundary
    await is NOT invoked (no-wiring safety)."""

    monkeypatch.setattr(config, "BOARD_BACKEND_PAUSE", True)
    monkeypatch.setattr(config, "BOARD_PACING_MODE", "learner_paced")

    boundary_event = BoardEvent(
        event_type="segment_boundary",
        timestamp=0.0,
        data={"is_last_segment": False},
    )
    chunks = [
        StreamChunk(
            chunk_type="tool_call_complete",
            tool_call_id="tc1",
            tool_name="end_segment",
            tool_arguments="{}",
        ),
        StreamChunk(chunk_type="done"),
    ]

    gen = _integration_gen()
    gen.backend_pause_wired = False
    gen.llm_client = _FakeLLMClient(chunks)
    gen.board_server = _FakeBoardServer(boundary_event)

    calls = {"n": 0}

    async def fake_wait(messages):
        calls["n"] += 1

    gen._wait_for_continue = fake_wait

    async def run():
        async for _ev in gen._generate_lesson_core(topic="t"):
            pass

    asyncio.run(run())
    assert calls["n"] == 0
    assert gen._pause_unwired_warned is True
