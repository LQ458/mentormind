"""Integration: 10 simulated whole-class runs verifying board↔voice pacing.

Each scenario streams a fake sequence of ``tool_call_complete`` chunks through
the real ``StreamingLessonGenerator`` → ``BoardTTSSync`` pipeline, then checks:

1. ``element_added`` is emitted BEFORE its matching ``audio_ready`` (board
   first, voice second).
2. A ``narration_pending`` marker lands between them so the UI can surface
   the "writing the board" indicator.
3. Elements accumulate — no destructive ``board_cleared`` with ``scope=all``.
4. Every narrated element has a corresponding audio_ready event.

TTS is mocked (instant, deterministic duration) and the pacing sleep is
patched out so the suite runs in seconds.
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict, List, Optional

import pytest

from core.board.models import BoardEvent
from core.streaming.lesson_generator import StreamingLessonGenerator
from core.streaming.tts_sync import BoardTTSSync
from services.api_client import StreamChunk


# ── Fakes ───────────────────────────────────────────────────────────────────


@dataclass
class _FakeTTSResult:
    audio_path: str
    duration: float


class _FakeTTSService:
    """Records every narration; returns deterministic audio metadata."""

    def __init__(self) -> None:
        self.calls: List[str] = []

    async def text_to_speech(self, **kwargs: Any) -> _FakeTTSResult:
        text = kwargs.get("text", "")
        self.calls.append(text)
        return _FakeTTSResult(
            audio_path=f"/tmp/{abs(hash(text)) & 0xffff}.mp3",
            duration=0.05,  # tiny so pacing sleep is near-zero
        )


class _FakeLLMClient:
    """Replays a scripted sequence of tool-call chunks for one lesson round."""

    def __init__(self, scripts: List[List[Dict[str, Any]]]) -> None:
        # scripts[i] is the chunk list for the i-th generator round
        self._scripts = list(scripts)

    async def chat_completion_stream(
        self, **_: Any
    ) -> AsyncGenerator[StreamChunk, None]:
        if not self._scripts:
            yield StreamChunk(chunk_type="done", content="")
            return
        current = self._scripts.pop(0)
        for call in current:
            yield StreamChunk(
                chunk_type="tool_call_complete",
                tool_call_id=call["id"],
                tool_name=call["name"],
                tool_arguments=json.dumps(call["arguments"]),
                content="",
            )
        yield StreamChunk(chunk_type="done", content="")


def _add_element(
    element_id: str,
    element_type: str,
    content: str,
    narration: Optional[str] = None,
) -> Dict[str, Any]:
    args: Dict[str, Any] = {
        "element_id": element_id,
        "element_type": element_type,
        "content": content,
        "position": {"region": "center"},
        "style": {"animation": "fade_in", "size": "medium", "color": "text"},
    }
    if narration:
        args["narration"] = narration
    return {"id": f"tc-{element_id}", "name": "board_add_element", "arguments": args}


# Ten distinct class-like tool-call scripts covering different element mixes.
SCENARIOS: List[Dict[str, Any]] = [
    {
        "topic": "Derivatives in motion",
        "calls": [
            {"id": "bc1", "name": "board_create",
             "arguments": {"title": "Derivatives", "layout": "focus_center",
                           "background": "dark_board", "topic": "Derivatives"}},
            _add_element("t1", "title", "Derivatives", "Let's learn derivatives."),
            _add_element("e1", "equation", "f'(x) = lim", "This is the limit form."),
            _add_element("g1", "graph", "x^2", "A parabola."),
        ],
    },
    {
        "topic": "Python operators",
        "calls": [
            {"id": "bc2", "name": "board_create",
             "arguments": {"title": "Operators", "layout": "split_left_right",
                           "background": "dark_board", "topic": "Operators"}},
            _add_element("t2", "title", "Operators", "Six operators coming up."),
            _add_element("c1", "code_block", "a + b", "Addition."),
            _add_element("c2", "code_block", "a - b", "Subtraction."),
            _add_element("c3", "code_block", "a * b", "Multiplication."),
            _add_element("c4", "code_block", "a / b", "Division."),
            _add_element("c5", "code_block", "a % b", "Modulo."),
            _add_element("c6", "code_block", "a ** b", "Exponent."),
        ],
    },
    {
        "topic": "Newton's laws",
        "calls": [
            {"id": "bc3", "name": "board_create",
             "arguments": {"title": "Newton", "layout": "focus_center",
                           "background": "dark_board", "topic": "Newton"}},
            _add_element("n1", "title", "Newton's laws", "Three laws to discuss."),
            _add_element("n2", "text_block", "Law 1: inertia", "First law."),
            _add_element("n3", "text_block", "Law 2: F=ma", "Second law."),
            _add_element("n4", "text_block", "Law 3: reaction", "Third law."),
        ],
    },
    {
        "topic": "Chemistry basics",
        "calls": [
            {"id": "bc4", "name": "board_create",
             "arguments": {"title": "Chemistry", "layout": "full_canvas",
                           "background": "dark_board", "topic": "Atoms"}},
            _add_element("a1", "title", "Atoms", "An atom has three parts."),
            _add_element("a2", "definition_box", "Proton", "Positive particle."),
            _add_element("a3", "definition_box", "Neutron", "Neutral particle."),
            _add_element("a4", "definition_box", "Electron", "Negative particle."),
        ],
    },
    {
        "topic": "SQL joins",
        "calls": [
            {"id": "bc5", "name": "board_create",
             "arguments": {"title": "Joins", "layout": "split_left_right",
                           "background": "dark_board", "topic": "SQL"}},
            _add_element("s1", "title", "SQL Joins", "Four join types."),
            _add_element("s2", "code_block", "INNER JOIN", "Inner join."),
            _add_element("s3", "code_block", "LEFT JOIN", "Left outer join."),
            _add_element("s4", "code_block", "RIGHT JOIN", "Right outer join."),
            _add_element("s5", "code_block", "FULL JOIN", "Full outer join."),
        ],
    },
    {
        "topic": "Probability intro",
        "calls": [
            {"id": "bc6", "name": "board_create",
             "arguments": {"title": "Probability", "layout": "focus_center",
                           "background": "dark_board", "topic": "Probability"}},
            _add_element("p1", "title", "Probability", "Start with fractions."),
            _add_element("p2", "equation", "P(A)=n/N", "Basic formula."),
            _add_element("p3", "table", "Events", "A table of outcomes."),
        ],
    },
    {
        "topic": "Graphs and trees",
        "calls": [
            {"id": "bc7", "name": "board_create",
             "arguments": {"title": "Graphs", "layout": "full_canvas",
                           "background": "dark_board", "topic": "Graphs"}},
            _add_element("tr1", "title", "Graphs", "Nodes and edges."),
            _add_element("tr2", "shape", "Circle node", "A node."),
            _add_element("tr3", "arrow", "A->B", "An edge."),
            _add_element("tr4", "theorem_box", "Tree is acyclic", "Key property."),
        ],
    },
    {
        "topic": "Music scales",
        "calls": [
            {"id": "bc8", "name": "board_create",
             "arguments": {"title": "Music", "layout": "split_top_bottom",
                           "background": "dark_board", "topic": "Scales"}},
            _add_element("m1", "title", "Major Scale", "Seven notes."),
            _add_element("m2", "text_block", "C D E F G A B", "Ordered notes."),
            _add_element("m3", "highlight", "E F semitone", "A half-step."),
        ],
    },
    {
        "topic": "World history",
        "calls": [
            {"id": "bc9", "name": "board_create",
             "arguments": {"title": "History", "layout": "focus_center",
                           "background": "dark_board", "topic": "History"}},
            _add_element("h1", "title", "Renaissance", "Brief overview."),
            _add_element("h2", "text_block", "14th-17th c.", "Timeline."),
            _add_element("h3", "image", "/art.jpg", "A famous piece."),
        ],
    },
    {
        "topic": "Linear algebra",
        "calls": [
            {"id": "bc10", "name": "board_create",
             "arguments": {"title": "Linear Algebra", "layout": "full_canvas",
                           "background": "dark_board", "topic": "Vectors"}},
            _add_element("la1", "title", "Vectors", "A quick tour."),
            _add_element("la2", "equation", "v = (x, y)", "2D vector."),
            _add_element("la3", "transform", "Rotate", "A rotation."),
            _add_element("la4", "step_list", "Steps", "Add, scale, dot."),
        ],
    },
]


async def _run_scenario(scenario: Dict[str, Any]) -> Dict[str, Any]:
    """Run one scenario and collect the event stream it produces."""
    llm = _FakeLLMClient(scripts=[scenario["calls"], []])
    tts_service = _FakeTTSService()
    generator = StreamingLessonGenerator(
        llm_client=llm,
        model="fake-model",
        follow_up_timeout_s=0.05,
    )
    sync = BoardTTSSync(tts_service=tts_service, language="zh-CN")

    board_stream = generator.generate_lesson(
        topic=scenario["topic"], language="zh", duration_minutes=1
    )
    events: List[BoardEvent] = []
    async for ev in sync.stream_with_tts(board_stream):
        events.append(ev)
    return {"events": events, "tts_calls": tts_service.calls}


def _assert_invariants(scenario: Dict[str, Any], result: Dict[str, Any]) -> None:
    events: List[BoardEvent] = result["events"]
    types = [e.event_type for e in events]

    element_added_ids = [
        e.element_id for e in events if e.event_type == "element_added"
    ]
    audio_ready_ids = [
        e.element_id for e in events if e.event_type == "audio_ready"
    ]

    # No destructive clears
    assert not any(
        e.event_type == "board_cleared" and e.data.get("scope") == "all"
        for e in events
    ), f"{scenario['topic']}: destructive board_cleared detected"

    # Each narrated element should have exactly one audio_ready.
    narrated = [
        c for c in scenario["calls"]
        if c["name"] == "add_element" and c["arguments"].get("narration")
    ]
    assert len(audio_ready_ids) >= len(narrated), (
        f"{scenario['topic']}: missing audio_ready "
        f"(got {len(audio_ready_ids)}, expected >= {len(narrated)})"
    )

    # Ordering: for each element_added with narration, the matching
    # audio_ready must come AFTER it (board-first, voice-second).
    seen_element: Dict[str, int] = {}
    for idx, ev in enumerate(events):
        if ev.event_type == "element_added" and ev.element_id:
            seen_element[ev.element_id] = idx
        if ev.event_type == "audio_ready" and ev.element_id:
            assert ev.element_id in seen_element, (
                f"{scenario['topic']}: audio_ready for {ev.element_id} "
                f"preceded its element_added"
            )
            assert idx > seen_element[ev.element_id]

    # A narration_pending event must land between element_added and audio_ready
    # for every narrated element.
    for narration_id in [
        c["arguments"]["element_id"] for c in narrated
    ]:
        sub = [
            (i, e) for i, e in enumerate(events)
            if e.element_id == narration_id
        ]
        kinds = [e.event_type for _, e in sub]
        assert "element_added" in kinds, (
            f"{scenario['topic']}/{narration_id}: no element_added"
        )
        assert "narration_pending" in kinds, (
            f"{scenario['topic']}/{narration_id}: no narration_pending marker"
        )
        ea = next(i for i, e in sub if e.event_type == "element_added")
        np_ = next(i for i, e in sub if e.event_type == "narration_pending")
        ar = next(
            (i for i, e in sub if e.event_type == "audio_ready"), None
        )
        assert np_ > ea
        if ar is not None:
            assert ar > np_

    # Elements accumulate — IDs from add_element calls all appear.
    expected_ids = [
        c["arguments"]["element_id"]
        for c in scenario["calls"]
        if c["name"] == "add_element"
    ]
    assert element_added_ids == expected_ids, (
        f"{scenario['topic']}: element order drifted — "
        f"got {element_added_ids}, expected {expected_ids}"
    )


@pytest.fixture(autouse=True)
def _skip_pacing_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    """Neutralize the pacing sleep so the suite runs fast."""
    real_sleep = asyncio.sleep

    async def _fast_sleep(seconds: float) -> None:
        # Preserve task switching but skip the wall-clock wait.
        await real_sleep(0)

    monkeypatch.setattr("core.streaming.tts_sync.asyncio.sleep", _fast_sleep)


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario", SCENARIOS, ids=[s["topic"] for s in SCENARIOS])
async def test_whole_class_board_voice_pacing(scenario: Dict[str, Any]) -> None:
    result = await _run_scenario(scenario)
    _assert_invariants(scenario, result)
