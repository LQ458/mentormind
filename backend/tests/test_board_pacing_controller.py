"""Phase 2 tests — BoardPacingController action routing + invite cadence.

Pure logic, exercised with a fake generator that records enqueue calls. No
asyncio / server dependencies.
"""

from config import config
from core.board.pacing import BoardPacingController


class FakeGenerator:
    """Records calls so tests can assert which queue an action routes to."""

    def __init__(self) -> None:
        self.user_messages = []
        self.continues = []

    def enqueue_user_message(self, text):
        self.user_messages.append(text)

    def enqueue_continue(self, payload):
        self.continues.append(payload)


def _controller():
    gen = FakeGenerator()
    return BoardPacingController(gen), gen


# ---- handle_inbound_action routing ----


def test_user_message_routes_to_user_queue():
    ctrl, gen = _controller()
    result = ctrl.handle_inbound_action("user_message", {"text": "hi"})
    assert result == {"handled": True, "action": "user_message"}
    assert gen.user_messages == ["hi"]
    assert gen.continues == []


def test_continue_routes_to_continue_queue_with_signals():
    ctrl, gen = _controller()
    result = ctrl.handle_inbound_action(
        "continue",
        {"text": "got it", "answer_correct": True, "skipped": False, "dwell_ms": 1200},
    )
    assert result == {"handled": True, "action": "continue"}
    assert gen.user_messages == []
    assert gen.continues == [
        {"text": "got it", "answer_correct": True, "skipped": False, "dwell_ms": 1200}
    ]


def test_answer_routes_to_continue_queue():
    ctrl, gen = _controller()
    ctrl.handle_inbound_action(
        "answer", {"text": "B", "answer_correct": False, "skipped": False}
    )
    assert gen.continues == [
        {"text": "B", "answer_correct": False, "skipped": False}
    ]


def test_checkpoint_response_uses_response_field():
    ctrl, gen = _controller()
    ctrl.handle_inbound_action(
        "checkpoint_response", {"response": "green", "answer_correct": True}
    )
    # skipped is forwarded so downstream skip tracking has a data source.
    assert gen.continues == [
        {"text": "green", "answer_correct": True, "skipped": None}
    ]


def test_why_this_step_routes_to_user_queue_bilingual():
    ctrl, gen = _controller()
    ctrl.handle_inbound_action("why_this_step", {"language": "en"})
    ctrl.handle_inbound_action("why_this_step", {"language": "zh"})
    assert len(gen.user_messages) == 2
    assert "Why this step" in gen.user_messages[0]
    assert "为什么" in gen.user_messages[1]
    assert gen.continues == []


def test_explain_differently_uses_style():
    ctrl, gen = _controller()
    ctrl.handle_inbound_action(
        "explain_differently", {"language": "en", "style": "with an analogy"}
    )
    assert len(gen.user_messages) == 1
    assert "re-explain" in gen.user_messages[0]
    assert "with an analogy" in gen.user_messages[0]


def test_explain_differently_without_style():
    ctrl, gen = _controller()
    ctrl.handle_inbound_action("explain_differently", {"language": "zh"})
    assert "重新解释" in gen.user_messages[0]


def test_unknown_action_is_not_handled():
    ctrl, gen = _controller()
    result = ctrl.handle_inbound_action("frobnicate", {"x": 1})
    assert result == {"handled": False, "action": "frobnicate"}
    assert gen.user_messages == []
    assert gen.continues == []


def test_none_msg_is_tolerated():
    ctrl, gen = _controller()
    result = ctrl.handle_inbound_action("user_message", None)
    assert result["handled"] is True
    assert gen.user_messages == [""]


# ---- should_invite_next cadence ----


def test_should_invite_next_sparse_default():
    ctrl, _ = _controller()
    adaptive = {"wrong_streak": 0, "skip_streak": 0}
    every = config.BOARD_ADAPTIVE_INVITE_EVERY_N_SEGMENTS  # default 3
    # Sparse: only fires on the Nth segment.
    assert ctrl.should_invite_next(0, adaptive) is False
    assert ctrl.should_invite_next(every - 2, adaptive) is False
    assert ctrl.should_invite_next(every - 1, adaptive) is True


def test_should_invite_next_struggle_more_frequent():
    ctrl, _ = _controller()
    adaptive = {"wrong_streak": 1, "skip_streak": 0}
    # Struggle cadence (default every 1) -> invite at every boundary.
    assert ctrl.should_invite_next(0, adaptive) is True
    assert ctrl.should_invite_next(1, adaptive) is True


def test_should_invite_next_fades_when_skipping():
    ctrl, _ = _controller()
    fade = config.BOARD_ADAPTIVE_FADE_AFTER_OK  # default 2
    adaptive = {"wrong_streak": 0, "skip_streak": fade}
    # Even on an otherwise-inviting segment, fade suppresses the invite.
    every = config.BOARD_ADAPTIVE_INVITE_EVERY_N_SEGMENTS
    assert ctrl.should_invite_next(every - 1, adaptive) is False


def test_should_invite_next_tolerates_missing_adaptive():
    ctrl, _ = _controller()
    every = config.BOARD_ADAPTIVE_INVITE_EVERY_N_SEGMENTS
    assert ctrl.should_invite_next(every - 1, None) is True
