"""BoardEvent schema assertions for comprehension_check (T2).

Critical invariant: element_id is TOP-LEVEL on BoardEvent, NEVER under data.
This is a known bug in prior code (project memory: feedback_board_event_shape).
"""

from core.board.state_manager import BoardStateManager  # type: ignore


def _fresh_manager():
    sm = BoardStateManager()
    sm.create_board(title="test-board", topic="demo")
    return sm


def test_emit_comprehension_check_element_id_is_top_level():
    sm = _fresh_manager()
    ev = sm.emit_comprehension_check(
        element_id="el-xyz",
        question="Did that make sense?",
        options=["yes", "sort of", "no"],
        segment_summary="Defined derivatives.",
    )
    assert ev.event_type == "comprehension_check"
    assert ev.element_id == "el-xyz"
    # The critical rule: element_id must NOT be inside data.
    assert "element_id" not in ev.data


def test_emit_comprehension_check_populates_data_fields():
    sm = _fresh_manager()
    ev = sm.emit_comprehension_check(
        question="Clear?",
        options=["yes", "no"],
        segment_summary="Bayes' rule.",
    )
    assert ev.data.get("question") == "Clear?"
    assert ev.data.get("options") == ["yes", "no"]
    assert ev.data.get("segment_summary") == "Bayes' rule."
    assert ev.data.get("allow_emoji") is True


def test_emit_comprehension_check_defaults():
    sm = _fresh_manager()
    ev = sm.emit_comprehension_check()
    assert ev.event_type == "comprehension_check"
    assert ev.element_id is None
    assert ev.data.get("options") == []
    assert ev.data.get("allow_emoji") is True


def test_emit_comprehension_check_appended_to_event_log():
    sm = _fresh_manager()
    before = len(sm.state.event_log)
    sm.emit_comprehension_check(question="Still with me?")
    assert len(sm.state.event_log) == before + 1
    assert sm.state.event_log[-1].event_type == "comprehension_check"
