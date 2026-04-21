"""Unit tests for backend/core/board/state_manager.py"""
from __future__ import annotations

import pytest

from core.board.state_manager import (
    BoardStateManager,
    MAX_ELEMENTS,
)
from core.board.models import BoardLayout, ElementState, ElementType


@pytest.fixture
def mgr() -> BoardStateManager:
    return BoardStateManager()


def test_create_board_initializes_state(mgr: BoardStateManager) -> None:
    event = mgr.create_board(title="Calculus 101", layout="split_left_right", background="grid")
    assert event.event_type == "board_created"
    assert mgr.state is not None
    assert mgr.state.title == "Calculus 101"
    assert mgr.state.layout == BoardLayout.split_left_right
    assert mgr.state.elements == {}
    assert event.data["board_id"] == mgr.state.board_id


def test_add_element_appends_and_focuses(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    event = mgr.add_element(element_type="equation", content="E=mc^2", narration="Einstein")
    eid = event.element_id
    assert eid in mgr.state.elements
    assert mgr.state.current_focus == eid
    assert mgr.state.elements[eid].element_type == ElementType.equation
    assert mgr.state.narration_queue[-1].text == "Einstein"


def test_add_element_without_board_raises(mgr: BoardStateManager) -> None:
    with pytest.raises(RuntimeError):
        mgr.add_element(element_type="text_block", content="nope")


def test_add_element_enforces_max_count(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    for i in range(MAX_ELEMENTS):
        mgr.add_element(element_type="text_block", content=f"item {i}")
    with pytest.raises(ValueError):
        mgr.add_element(element_type="text_block", content="overflow")


def test_update_element_highlight_then_dim(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    eid = mgr.add_element(element_type="text_block", content="x").element_id
    mgr.update_element(element_id=eid, action="highlight")
    assert mgr.state.elements[eid].state == ElementState.highlighted
    assert mgr.state.current_focus == eid
    mgr.update_element(element_id=eid, action="dim")
    assert mgr.state.elements[eid].state == ElementState.visible


def test_update_element_update_content(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    eid = mgr.add_element(element_type="equation", content="a").element_id
    mgr.update_element(element_id=eid, action="update_content", new_content="b")
    assert mgr.state.elements[eid].content == "b"


def test_update_element_remove_drops_focus(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    eid = mgr.add_element(element_type="text_block", content="x").element_id
    mgr.update_element(element_id=eid, action="remove")
    assert eid not in mgr.state.elements
    assert mgr.state.current_focus is None


def test_update_element_unknown_action_raises(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    eid = mgr.add_element(element_type="text_block", content="x").element_id
    with pytest.raises(ValueError):
        mgr.update_element(element_id=eid, action="bogus")


def test_update_element_missing_id_raises(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    with pytest.raises(KeyError):
        mgr.update_element(element_id="does-not-exist", action="highlight")


def test_clear_all_empties_board(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    mgr.add_element(element_type="text_block", content="a")
    mgr.add_element(element_type="equation", content="b")
    mgr.clear(scope="all")
    assert mgr.state.elements == {}
    assert mgr.state.current_focus is None


def test_clear_except_title_keeps_title(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    title_id = mgr.add_element(element_type="title", content="Hello").element_id
    body_id = mgr.add_element(element_type="text_block", content="body").element_id
    mgr.clear(scope="except_title")
    assert title_id in mgr.state.elements
    assert body_id not in mgr.state.elements


def test_clear_region_only_removes_that_region(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    left_id = mgr.add_element(
        element_type="text_block", content="l", position={"region": "left"}
    ).element_id
    right_id = mgr.add_element(
        element_type="text_block", content="r", position={"region": "right"}
    ).element_id
    mgr.clear(scope="region", region="left")
    assert left_id not in mgr.state.elements
    assert right_id in mgr.state.elements


def test_set_layout_updates_enum(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    mgr.set_layout(layout="focus_center", transition="smooth")
    assert mgr.state.layout == BoardLayout.focus_center


def test_add_narration_appends(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    mgr.add_narration(text="pause here", pause_after_ms=300)
    assert mgr.state.narration_queue[-1].text == "pause here"


def test_event_log_records_mutations(mgr: BoardStateManager) -> None:
    mgr.create_board(title="t", layout="full_canvas")
    mgr.add_element(element_type="text_block", content="x")
    log = mgr.get_event_log()
    assert [e["event_type"] for e in log] == ["board_created", "element_added"]


def test_get_state_roundtrip_serializable(mgr: BoardStateManager) -> None:
    mgr.create_board(title="Algebra", layout="full_canvas")
    mgr.add_element(element_type="equation", content="x^2")
    state = mgr.get_state()
    import json
    dumped = json.dumps(state)
    reloaded = json.loads(dumped)
    assert reloaded["title"] == "Algebra"
    assert len(reloaded["elements"]) == 1
