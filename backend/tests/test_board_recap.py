"""Phase 1b — end-of-lesson recap (comprehension_check) tests.

The recap is a guaranteed, non-blocking retrieval check emitted once after the
core lesson stream ends. These tests pin the wrapper's contract (forward all core
events, then append exactly one recap; never let a recap failure break the
stream) and the recap event's shape — without needing a live LLM.
"""

import asyncio

from core.streaming.lesson_generator import StreamingLessonGenerator
from mcp.board_server import BoardMCPServer


def _collect(gen, **kwargs):
    async def run():
        return [e async for e in gen.generate_lesson(**kwargs)]

    return asyncio.run(run())


def test_generate_lesson_appends_recap_after_core():
    gen = StreamingLessonGenerator.__new__(StreamingLessonGenerator)

    async def fake_core(**kwargs):
        yield "E1"
        yield "E2"

    gen._generate_lesson_core = fake_core
    gen._recap_event = lambda topic, language: "RECAP"

    assert _collect(gen, topic="t", language="en") == ["E1", "E2", "RECAP"]


def test_recap_failure_does_not_break_stream():
    gen = StreamingLessonGenerator.__new__(StreamingLessonGenerator)

    async def fake_core(**kwargs):
        yield "E1"

    def boom(topic, language):
        raise RuntimeError("recap gen failed")

    gen._generate_lesson_core = fake_core
    gen._recap_event = boom

    # Core events are still delivered; the recap failure is swallowed.
    assert _collect(gen, topic="t", language="en") == ["E1"]


def test_recap_event_is_comprehension_check():
    srv = BoardMCPServer()
    srv.handle_tool_call("board_create", {"title": "T", "layout": "full_canvas"})
    gen = StreamingLessonGenerator.__new__(StreamingLessonGenerator)
    gen.board_server = srv

    ev = gen._recap_event("Limits", "en")
    assert ev.event_type == "comprehension_check"
    assert ev.data["question"]
    assert ev.data["segment_summary"] == "Limits"
    assert ev.data["allow_emoji"] is True
    # Free-recall recap carries no MCQ options.
    assert ev.data["options"] == []


def test_recap_event_localized_zh():
    srv = BoardMCPServer()
    srv.handle_tool_call("board_create", {"title": "T", "layout": "full_canvas"})
    gen = StreamingLessonGenerator.__new__(StreamingLessonGenerator)
    gen.board_server = srv

    ev = gen._recap_event("极限", "zh")
    assert ev.event_type == "comprehension_check"
    assert "你" in ev.data["question"]
    assert ev.data["segment_summary"] == "极限"
