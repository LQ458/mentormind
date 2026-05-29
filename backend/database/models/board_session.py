"""
Board Session Model
Persistent storage for in-progress streaming board lessons so users can resume
after navigating away or closing the browser.
"""

from datetime import datetime
from typing import Dict, Any

from sqlalchemy import (
    Column, String, Integer, DateTime, Text, JSON, Index
)

from ..base import Base


class BoardSession(Base):
    """
    Board session table.

    Persists in-progress streaming board lessons so a re-visit to
    /board/{session_id} can hydrate elements, audio queue, narration log, and
    chat history before the WebSocket reconnects.

    Attributes:
        id (str): Primary key — session_id (UUID-ish, matches in-memory key)
        user_id (str): Owner's user id (FK conceptually to users.id; nullable)
        plan_id (str): Optional FK to study_plans.id
        unit_id (str): Optional FK to study_plan_units.id
        topic (Text): Lesson topic / prompt
        title (Text): Display title
        status (str): generating | paused | done | error
        elements (JSON): Map of element_id → element data
        element_order (JSON): Ordered list of element ids
        narration_log (JSON): List of narration segments delivered
        audio_queue (JSON): List of pending/played audio entries
        chat_history (JSON): Q&A turns from the in-lesson chat
        last_event_seq (int): Sequence number of most recent persisted event
        config (JSON): Original session configuration (topic, language, level…)
        created_at (datetime): Created timestamp
        updated_at (datetime): Last update timestamp
    """
    __tablename__ = "board_sessions"

    id = Column(String(255), primary_key=True)
    user_id = Column(String(255), index=True, nullable=True)
    plan_id = Column(String(255), index=True, nullable=True)
    unit_id = Column(String(255), index=True, nullable=True)
    topic = Column(Text, nullable=True)
    title = Column(Text, nullable=True)
    status = Column(String(32), default="generating")
    elements = Column(JSON, default=dict)
    element_order = Column(JSON, default=list)
    narration_log = Column(JSON, default=list)
    audio_queue = Column(JSON, default=list)
    chat_history = Column(JSON, default=list)
    last_event_seq = Column(Integer, default=0)
    config = Column(JSON, default=dict)
    board_metadata = Column(JSON, default=dict)
    conversation_state = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_board_sessions_user_id', 'user_id'),
        Index('idx_board_sessions_plan_id', 'plan_id'),
        Index('idx_board_sessions_unit_id', 'unit_id'),
        Index('idx_board_sessions_user_plan_unit', 'user_id', 'plan_id', 'unit_id'),
        Index('idx_board_sessions_updated_at', 'updated_at'),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "plan_id": self.plan_id,
            "unit_id": self.unit_id,
            "topic": self.topic,
            "title": self.title,
            "status": self.status,
            "elements": self.elements or {},
            "element_order": self.element_order or [],
            "narration_log": self.narration_log or [],
            "audio_queue": self.audio_queue or [],
            "chat_history": self.chat_history or [],
            "last_event_seq": self.last_event_seq or 0,
            "config": self.config or {},
            "board_metadata": self.board_metadata or {},
            "conversation_state": self.conversation_state or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_summary(self) -> Dict[str, Any]:
        """Compact summary for list views."""
        return {
            "id": self.id,
            "topic": self.topic,
            "title": self.title,
            "status": self.status,
            "plan_id": self.plan_id,
            "unit_id": self.unit_id,
            "last_event_seq": self.last_event_seq or 0,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<BoardSession(id={self.id}, status='{self.status}', user_id='{self.user_id}')>"
