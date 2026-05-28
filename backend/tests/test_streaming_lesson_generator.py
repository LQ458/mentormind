import os
import sys

import pytest


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from core.streaming.lesson_generator import StreamingLessonGenerator
from services.api_client import StreamChunk


class FakeStreamingLLM:
    def __init__(self):
        self.calls = 0

    async def chat_completion_stream(self, *args, **kwargs):
        self.calls += 1
        if self.calls == 1:
            yield StreamChunk(chunk_type="reasoning_delta", content="Need to create the board first. ")
            yield StreamChunk(chunk_type="reasoning_delta", content="Then add content.")
            yield StreamChunk(chunk_type="content_delta", content="I will set up the board.")
            yield StreamChunk(
                chunk_type="tool_call_complete",
                tool_call_id="call_1",
                tool_name="board_create",
                tool_arguments='{"title":"Limits","layout":"full_canvas","background":"dark_board","topic":"limits"}',
            )
            yield StreamChunk(chunk_type="done")
            return
        yield StreamChunk(chunk_type="done")


class CapturingStreamingLLM:
    def __init__(self):
        self.messages = None

    async def chat_completion_stream(self, *args, **kwargs):
        self.messages = kwargs["messages"]
        yield StreamChunk(chunk_type="done")


@pytest.mark.asyncio
async def test_streaming_generator_preserves_tool_call_reasoning_content():
    llm = FakeStreamingLLM()
    generator = StreamingLessonGenerator(llm_client=llm, follow_up_timeout_s=0.01)

    events = [
        event
        async for event in generator.generate_lesson(
            topic="limits",
            language="en",
            duration_minutes=1,
        )
    ]

    assert events
    assistant_messages = [
        message
        for message in (generator._current_messages or [])
        if message.get("role") == "assistant" and message.get("tool_calls")
    ]
    assert assistant_messages
    assert assistant_messages[-1]["reasoning_content"] == (
        "Need to create the board first. Then add content."
    )
    assert assistant_messages[-1]["content"] == "I will set up the board."


@pytest.mark.asyncio
async def test_resumed_lesson_does_not_replay_saved_tool_history():
    llm = CapturingStreamingLLM()
    generator = StreamingLessonGenerator(llm_client=llm, follow_up_timeout_s=0.01)
    resume_messages = [
        {"role": "system", "content": "old system"},
        {"role": "user", "content": "Please teach a lesson on: limits"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "board_create", "arguments": "{}"},
                }
            ],
        },
        {"role": "tool", "tool_call_id": "call_1", "content": "{}"},
    ]

    events = [
        event
        async for event in generator.generate_lesson(
            topic="limits",
            language="en",
            duration_minutes=1,
            resume_messages=resume_messages,
        )
    ]

    assert events == []
    assert llm.messages
    assert not any(message.get("role") == "tool" for message in llm.messages)
    assert not any("tool_calls" in message for message in llm.messages)
    assert "Continue the existing board lesson" in llm.messages[-1]["content"]
