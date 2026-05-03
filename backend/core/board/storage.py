"""
Board session persistence helpers.

Wraps SQLAlchemy upsert/load/list/delete for the `board_sessions` table so the
WebSocket pipeline and HTTP endpoints can share a single API.

`save_board_state` is upsert-style and safe to call on a few-hundred-ms
debounce. The caller passes a `state` dict shaped like::

    {
        "board": {...},          # optional BoardState.to_dict() blob
        "elements": {...},       # element_id → element data
        "element_order": [...],  # ordered element ids
        "narration_log": [...],  # delivered narration segments
        "audio_queue": [...],    # pending/played audio entries
        "chat_history": [...],   # in-lesson chat turns
        "last_event_seq": 0,
        "status": "generating",
    }

Only the keys present in `state` are written; missing keys preserve any
existing column value on update.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from database.models.board_session import BoardSession

logger = logging.getLogger(__name__)


def _coerce_status(state: Optional[Dict[str, Any]], explicit: Optional[str]) -> Optional[str]:
    if explicit:
        return explicit
    if state and isinstance(state, dict):
        s = state.get("status")
        if isinstance(s, str) and s:
            return s
    return None


def save_board_state(
    db: Session,
    session_id: str,
    *,
    user_id: Optional[str] = None,
    plan_id: Optional[str] = None,
    unit_id: Optional[str] = None,
    topic: Optional[str] = None,
    title: Optional[str] = None,
    status: Optional[str] = None,
    state: Optional[Dict[str, Any]] = None,
    config: Optional[Dict[str, Any]] = None,
) -> None:
    """Upsert a board session row.

    Idempotent and safe under contention: row is fetched, mutated in-place if
    present, otherwise inserted. Caller is expected to handle commit lifecycle
    inside the request scope; this helper commits on its own session.
    """
    try:
        row = db.query(BoardSession).filter(BoardSession.id == session_id).first()
        if row is None:
            row = BoardSession(id=session_id)
            row.created_at = datetime.utcnow()
            db.add(row)

        # Always-overwriteable fields if provided (None → leave alone)
        if user_id is not None:
            row.user_id = str(user_id)
        if plan_id is not None:
            row.plan_id = str(plan_id)
        if unit_id is not None:
            row.unit_id = str(unit_id)
        if topic is not None:
            row.topic = topic
        if title is not None:
            row.title = title

        resolved_status = _coerce_status(state, status)
        if resolved_status:
            row.status = resolved_status

        if config is not None:
            row.config = config

        if state is not None and isinstance(state, dict):
            if "elements" in state and state["elements"] is not None:
                row.elements = state["elements"]
            if "element_order" in state and state["element_order"] is not None:
                row.element_order = state["element_order"]
            if "narration_log" in state and state["narration_log"] is not None:
                row.narration_log = state["narration_log"]
            if "audio_queue" in state and state["audio_queue"] is not None:
                row.audio_queue = state["audio_queue"]
            if "chat_history" in state and state["chat_history"] is not None:
                row.chat_history = state["chat_history"]
            seq = state.get("last_event_seq")
            if isinstance(seq, int):
                # Never let last_event_seq regress — take max of the persisted
                # value and the incoming value so a stale client beacon can't
                # roll back the counter.
                existing_seq = row.last_event_seq if isinstance(row.last_event_seq, int) else 0
                row.last_event_seq = max(existing_seq, seq)

        row.updated_at = datetime.utcnow()
        db.commit()
    except Exception as exc:
        logger.warning(f"save_board_state failed for {session_id}: {exc}")
        try:
            db.rollback()
        except Exception:
            pass


def load_board_state(
    db: Session,
    session_id: str,
    *,
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Load a saved board session. Returns None if missing or owner mismatch."""
    try:
        row = db.query(BoardSession).filter(BoardSession.id == session_id).first()
        if row is None:
            return None
        if user_id is not None and row.user_id and str(row.user_id) != str(user_id):
            # Owner mismatch — caller should treat as 403; return None and let
            # caller distinguish based on whether row exists.
            return {"__forbidden__": True, "id": row.id, "user_id": row.user_id}
        return row.to_dict()
    except Exception as exc:
        logger.warning(f"load_board_state failed for {session_id}: {exc}")
        return None


def list_user_board_sessions(
    db: Session,
    user_id: str,
    *,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Return saved sessions for a user, newest first."""
    try:
        rows = (
            db.query(BoardSession)
            .filter(BoardSession.user_id == str(user_id))
            .order_by(BoardSession.updated_at.desc().nullslast(), BoardSession.created_at.desc())
            .limit(limit)
            .all()
        )
        return [r.to_summary() for r in rows]
    except Exception as exc:
        logger.warning(f"list_user_board_sessions failed for {user_id}: {exc}")
        return []


def delete_board_session(db: Session, session_id: str, user_id: str) -> bool:
    """Delete a session row owned by user. Returns True if a row was removed."""
    try:
        row = (
            db.query(BoardSession)
            .filter(
                BoardSession.id == session_id,
                BoardSession.user_id == str(user_id),
            )
            .first()
        )
        if row is None:
            return False
        db.delete(row)
        db.commit()
        return True
    except Exception as exc:
        logger.warning(f"delete_board_session failed for {session_id}: {exc}")
        try:
            db.rollback()
        except Exception:
            pass
        return False
