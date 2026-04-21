"""Unit tests for backend/mcp/board_server.py"""
from __future__ import annotations

import pytest

from mcp.board_server import BoardMCPServer


@pytest.fixture
def server() -> BoardMCPServer:
    return BoardMCPServer()


def test_get_tool_definitions_has_all_six_tools(server: BoardMCPServer) -> None:
    tool_names = {t["function"]["name"] for t in BoardMCPServer.get_tool_definitions()}
    assert tool_names == {
        "board_create",
        "board_add_element",
        "board_update_element",
        "board_clear",
        "board_set_layout",
        "narrate",
    }


def test_valid_create_dispatch(server: BoardMCPServer) -> None:
    event = server.handle_tool_call(
        "board_create",
        {"title": "Test", "layout": "full_canvas"},
    )
    assert event.event_type == "board_created"
    assert event.data["title"] == "Test"


def test_add_element_after_create(server: BoardMCPServer) -> None:
    server.handle_tool_call("board_create", {"title": "t", "layout": "full_canvas"})
    event = server.handle_tool_call(
        "board_add_element",
        {"element_type": "equation", "content": "x+1", "narration": "hello"},
    )
    assert event.event_type == "element_added"
    assert event.element_id is not None


def test_invalid_tool_name_emits_error_safe(server: BoardMCPServer) -> None:
    event = server.handle_tool_call_safe("bogus_tool", {})
    assert event.event_type == "error"


def test_validation_error_in_safe_mode(server: BoardMCPServer) -> None:
    # `layout` is required; omit it to trigger schema validation failure
    event = server.handle_tool_call_safe("board_create", {"title": "nope"})
    assert event.event_type == "error"
    assert event.data["tool_name"] == "board_create"


def test_update_element_before_create_errors_safely(server: BoardMCPServer) -> None:
    event = server.handle_tool_call_safe(
        "board_update_element",
        {"element_id": "x", "action": "highlight"},
    )
    assert event.event_type == "error"


def test_narrate_without_create_fails_safely(server: BoardMCPServer) -> None:
    event = server.handle_tool_call_safe("narrate", {"text": "hi"})
    assert event.event_type == "error"


def test_full_lesson_sequence_integration(server: BoardMCPServer) -> None:
    server.handle_tool_call("board_create", {"title": "Lesson", "layout": "full_canvas"})
    add_event = server.handle_tool_call(
        "board_add_element",
        {"element_type": "title", "content": "Welcome"},
    )
    eid = add_event.element_id
    server.handle_tool_call(
        "board_update_element",
        {"element_id": eid, "action": "highlight"},
    )
    server.handle_tool_call("board_clear", {"scope": "all"})
    server.handle_tool_call("board_set_layout", {"layout": "focus_center"})
    server.handle_tool_call("narrate", {"text": "done"})
    assert server.state_manager.state.layout.value == "focus_center"
