"""Phase 2 board pacing controller — pure routing + invite-cadence logic.

Translates inbound learner WebSocket actions into generator queue calls and
decides when to surface a low-stakes "continue / predict" invite at segment
boundaries. Intentionally framework-free: NO asyncio, NO server import. It only
holds a reference to a :class:`StreamingLessonGenerator`-shaped object and calls
its ``enqueue_*`` methods. Additive and inert until server.py wires it up (a
separate later step).
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from config import config as _default_config


# Bilingual templates for derived "meta" actions. Kept tiny and inline so the
# controller stays a single self-contained module.
_WHY_THIS_STEP = {
    "zh": "为什么是这一步？请简要解释你刚才这一步背后的原因。",
    "en": "Why this step? Briefly explain the reasoning behind what you just did.",
}


class BoardPacingController:
    """Routes learner actions to the generator and paces boundary invites.

    Pure logic: the caller owns the event loop. Methods return plain dicts/bools
    so they are trivial to unit-test with a fake generator.
    """

    def __init__(self, generator: Any, config_obj: Any = _default_config) -> None:
        self.generator = generator
        self.config = config_obj

    def handle_inbound_action(
        self, action: str, msg: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Dispatch one inbound action to the right generator queue.

        Returns ``{"handled": True, "action": action}`` for recognized actions and
        ``{"handled": False, "action": action}`` for unknown ones (so the caller
        can log/ignore without raising).
        """
        msg = msg or {}

        if action == "user_message":
            self.generator.enqueue_user_message(msg.get("text", ""))
        elif action == "continue":
            self.generator.enqueue_continue(
                {
                    "text": msg.get("text"),
                    "answer_correct": msg.get("answer_correct"),
                    "skipped": msg.get("skipped"),
                    "dwell_ms": msg.get("dwell_ms"),
                }
            )
        elif action in ("answer", "checkpoint_response"):
            self.generator.enqueue_continue(
                {
                    "text": msg.get("text") or msg.get("response"),
                    "answer_correct": msg.get("answer_correct"),
                    "skipped": msg.get("skipped"),
                }
            )
        elif action == "why_this_step":
            language = msg.get("language", "zh")
            self.generator.enqueue_user_message(
                _WHY_THIS_STEP.get(language, _WHY_THIS_STEP["en"])
            )
        elif action == "explain_differently":
            language = msg.get("language", "zh")
            self.generator.enqueue_user_message(
                self._explain_differently_prompt(language, msg.get("style"))
            )
        else:
            return {"handled": False, "action": action}

        return {"handled": True, "action": action}

    @staticmethod
    def _explain_differently_prompt(language: str, style: Any) -> str:
        style_txt = str(style).strip() if style else ""
        if language == "zh":
            base = "请用另一种方式重新解释刚才这一步。"
            return f"{base}（风格：{style_txt}）" if style_txt else base
        base = "Please re-explain the last step in a different way."
        return f"{base} (style: {style_txt})" if style_txt else base

    def should_invite_next(
        self, segment_index: int, adaptive: Optional[Dict[str, int]]
    ) -> bool:
        """Decide whether to surface a boundary invite after ``segment_index``.

        Default-sparse (every Nth segment). More frequent while the learner is
        struggling (``wrong_streak > 0``); faded out once they are repeatedly
        skipping (``skip_streak >= FADE_AFTER_OK``).
        """
        adaptive = adaptive or {}
        skip_streak = adaptive.get("skip_streak", 0)
        wrong_streak = adaptive.get("wrong_streak", 0)

        # Fade: stop inviting once the learner is comfortably skipping ahead.
        # Floor the threshold at 1 so FADE_AFTER_OK=0 doesn't disable all invites.
        fade_threshold = max(1, self.config.BOARD_ADAPTIVE_FADE_AFTER_OK)
        if skip_streak >= fade_threshold:
            return False

        if wrong_streak > 0:
            every = max(1, self.config.BOARD_ADAPTIVE_STRUGGLE_INVITE_EVERY_N)
        else:
            every = max(1, self.config.BOARD_ADAPTIVE_INVITE_EVERY_N_SEGMENTS)

        return (segment_index + 1) % every == 0
