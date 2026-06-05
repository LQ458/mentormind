"""
Telemetry Event Model
Lightweight client-side telemetry capture for product analytics.
"""

import uuid
from datetime import datetime
from typing import Dict, Any, Set

from sqlalchemy import (
    Column, String, Integer, DateTime, JSON, Index
)

from ..base import Base


# Allowlist of event types accepted by the POST /telemetry/event endpoint.
# Unknown types are rejected to keep the table from filling with garbage.
ALLOWED_EVENT_TYPES: Set[str] = {
    "page_view",
    "page_unload",
    "generation_latency",
    "element_paint",
    "ws_close",
    "long_task",
    "error_console",
    "error_network",
    "interaction",
    "board_lesson_open",
    "study_plan_chat_rtt",
    "survey_response",
    "feedback_click",
    "feedback_moment",
}


class TelemetryEvent(Base):
    """
    Telemetry events table.

    Stores lightweight, no-auth-required client telemetry: page views, latency
    samples, error fingerprints, and survey responses. Aggregated server-side
    via /admin/telemetry/aggregate.

    Attributes:
        id (UUID): Primary key, automatically generated
        user_id (str): Optional owner (set if request is authenticated)
        session_id (str): Browser/device session id, indexed for grouping
        event_type (str): Allowlisted event type, indexed
        page (str): Logical page name, e.g. "dashboard", "board"
        url (str): Full URL where event fired
        latency_ms (int): Optional latency measurement
        payload (JSON): Free-form payload (capped 8KB at endpoint)
        viewport_w (int): Optional viewport width in CSS pixels
        viewport_h (int): Optional viewport height in CSS pixels
        user_agent (str): Captured from request header
        ip_address (str): Client IP captured from request
        created_at (datetime): Event timestamp, indexed
    """
    __tablename__ = "telemetry_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), index=True, nullable=True)
    session_id = Column(String(255), index=True)
    event_type = Column(String(64), index=True)
    page = Column(String(64), nullable=True, index=True)
    url = Column(String(512), nullable=True)
    latency_ms = Column(Integer, nullable=True)
    payload = Column(JSON, default=dict)
    viewport_w = Column(Integer, nullable=True)
    viewport_h = Column(Integer, nullable=True)
    user_agent = Column(String(512), nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index('idx_telemetry_events_user_id', 'user_id'),
        Index('idx_telemetry_events_session_id', 'session_id'),
        Index('idx_telemetry_events_event_type', 'event_type'),
        Index('idx_telemetry_events_page', 'page'),
        Index('idx_telemetry_events_created_at', 'created_at'),
        Index('idx_telemetry_events_type_created', 'event_type', 'created_at'),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "event_type": self.event_type,
            "page": self.page,
            "url": self.url,
            "latency_ms": self.latency_ms,
            "payload": self.payload or {},
            "viewport_w": self.viewport_w,
            "viewport_h": self.viewport_h,
            "user_agent": self.user_agent,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<TelemetryEvent(id={self.id}, type='{self.event_type}', session_id='{self.session_id}')>"
