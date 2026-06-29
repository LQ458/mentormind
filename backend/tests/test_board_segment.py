"""Phase 0 tests for learner-paced segmentation in BoardStateManager.

Covers the additive `end_segment()` boundary emitter and per-element
`metadata.segment_index` stamping. Pure state-layer (no server/celery imports).
"""

import pytest

from core.board.state_manager import BoardStateManager
from mcp.board_server import BoardMCPServer
from mcp.validator import ToolCallValidationError, default_validator


def test_end_segment_marks_boundary_and_resets():
    m = BoardStateManager()
    m.create_board(title="Limits", topic="calc")
    e1 = m.add_element("text_block", "a", narration="say a")
    e2 = m.add_element("equation", "b")  # no narration -> not an audio element

    ev = m.end_segment(invite={"kind": "predict", "prompt": "what next?"})

    assert ev.event_type == "segment_boundary"
    assert ev.element_id == e2.element_id  # last element, top-level (shape rule)
    assert ev.data["segment_index"] == 0
    assert ev.data["element_ids"] == [e1.element_id, e2.element_id]
    assert ev.data["audio_element_ids"] == [e1.element_id]  # only the narrated one
    assert ev.data["expected_audio_count"] == 1
    assert ev.data["invite"]["kind"] == "predict"

    # Next segment starts fresh and the index advances.
    e3 = m.add_element("text_block", "c", narration="say c")
    assert m.state.elements[e3.element_id].metadata["segment_index"] == 1
    ev2 = m.end_segment()
    assert ev2.data["segment_index"] == 1
    assert ev2.data["element_ids"] == [e3.element_id]


def test_segment_index_stamped_on_elements():
    m = BoardStateManager()
    m.create_board(title="T")
    e1 = m.add_element("text_block", "a")
    assert m.state.elements[e1.element_id].metadata["segment_index"] == 0


def test_empty_segment_boundary_is_safe():
    m = BoardStateManager()
    m.create_board(title="T")
    ev = m.end_segment()
    assert ev.element_id is None
    assert ev.data["element_ids"] == []
    assert ev.data["expected_audio_count"] == 0


def test_to_dict_keeps_element_id_top_level():
    m = BoardStateManager()
    m.create_board(title="T")
    m.add_element("text_block", "a", narration="n")
    d = m.end_segment().to_dict()
    assert "element_id" in d  # top-level, not nested in data
    assert "segment_index" in d["data"]


# ---- board_server / validator integration (the LLM-facing end_segment tool) ----


def test_end_segment_tool_is_registered():
    names = [t["function"]["name"] for t in BoardMCPServer.get_tool_definitions()]
    assert "end_segment" in names
    assert "end_segment" in default_validator._schemas


def test_board_server_end_segment_dispatch():
    srv = BoardMCPServer()
    srv.handle_tool_call("board_create", {"title": "T", "layout": "full_canvas"})
    srv.handle_tool_call(
        "board_add_element",
        {"element_type": "text_block", "content": "a", "narration": "say a"},
    )
    ev = srv.handle_tool_call(
        "end_segment", {"invite": {"kind": "predict", "prompt": "what next?"}}
    )
    assert ev.event_type == "segment_boundary"
    assert ev.data["expected_audio_count"] == 1
    assert ev.data["invite"]["kind"] == "predict"


def test_board_server_end_segment_no_args_ok():
    srv = BoardMCPServer()
    srv.handle_tool_call("board_create", {"title": "T", "layout": "full_canvas"})
    ev = srv.handle_tool_call("end_segment", {})
    assert ev.event_type == "segment_boundary"


def test_validator_rejects_bad_invite_kind():
    with pytest.raises(ToolCallValidationError):
        default_validator.validate(
            "end_segment", {"invite": {"kind": "bogus", "prompt": "x"}}
        )
