"""Unit tests for backend/core/board/models.py"""
from __future__ import annotations

import pytest

from core.board.models import (
    AnimationType,
    BoardElementFactory,
    BoardEvent,
    BoardLayout,
    BoardState,
    BackgroundStyle,
    ColorStyle,
    ElementState,
    ElementStyle,
    ElementType,
    Position,
    SizeStyle,
)


def test_element_factory_defaults() -> None:
    el = BoardElementFactory.create(element_type=ElementType.text_block, content="hi")
    assert el.element_id
    assert el.element_type == ElementType.text_block
    assert el.position.region == "main"
    assert el.style.color == ColorStyle.text
    assert el.state == ElementState.visible


def test_element_factory_rejects_non_enum() -> None:
    with pytest.raises(ValueError):
        BoardElementFactory.create(element_type="text_block", content="hi")  # type: ignore[arg-type]


def test_element_factory_custom_position_and_style() -> None:
    el = BoardElementFactory.create(
        element_type=ElementType.equation,
        content="E=mc^2",
        position=Position(region="top_left", offset_x=0.2, offset_y=-0.1),
        style=ElementStyle(
            color=ColorStyle.accent,
            size=SizeStyle.large,
            animation=AnimationType.grow,
        ),
        metadata={"graph_expression": "x^2"},
    )
    assert el.position.region == "top_left"
    assert el.style.color == ColorStyle.accent
    assert el.metadata["graph_expression"] == "x^2"


def test_board_state_to_dict_and_from_dict_roundtrip() -> None:
    state = BoardState(
        board_id="b1",
        title="Test",
        layout=BoardLayout.split_top_bottom,
        background=BackgroundStyle.light_board,
    )
    el = BoardElementFactory.create(element_type=ElementType.title, content="X")
    state.elements[el.element_id] = el
    state.current_focus = el.element_id

    dumped = state.to_dict()
    restored = BoardState.from_dict(dumped)
    assert restored.board_id == "b1"
    assert restored.title == "Test"
    assert restored.layout == BoardLayout.split_top_bottom
    assert restored.background == BackgroundStyle.light_board
    assert el.element_id in restored.elements
    assert restored.current_focus == el.element_id


def test_board_event_to_dict_stable() -> None:
    ev = BoardEvent(
        event_type="element_added",
        timestamp=1234.5,
        element_id="e1",
        data={"k": "v"},
    )
    d = ev.to_dict()
    assert d == {
        "event_type": "element_added",
        "timestamp": 1234.5,
        "element_id": "e1",
        "data": {"k": "v"},
    }


def test_all_fourteen_element_types_present() -> None:
    expected = {
        "title", "text_block", "equation", "graph", "shape", "transform",
        "code_block", "image", "definition_box", "theorem_box", "step_list",
        "arrow", "highlight", "table",
    }
    assert {e.value for e in ElementType} == expected


def test_layout_enum_has_four_values() -> None:
    assert {l.value for l in BoardLayout} == {
        "full_canvas", "split_left_right", "split_top_bottom", "focus_center",
    }
