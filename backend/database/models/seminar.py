"""
Seminar room models

Persistent storage for MentorMind's social debate/seminar mode.
"""

import uuid
from typing import Any, Dict

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..base import Base


class SeminarRoom(Base):
    __tablename__ = "seminar_rooms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(160), nullable=False)
    topic = Column(Text, nullable=False)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("study_plans.id", ondelete="SET NULL"), nullable=True)
    subject = Column(String(50), nullable=True)
    framework = Column(String(50), nullable=True)
    language = Column(String(10), default="zh", nullable=False)

    status = Column(String(20), default="open", nullable=False)
    phase = Column(String(20), default="prep", nullable=False)
    max_participants = Column(Integer, default=4, nullable=False)
    created_by = Column(String(255), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    review = Column(JSON, nullable=True)
    aggregate_scores = Column(JSON, default=dict)
    ai_metadata = Column(JSON, default=dict)
    is_matchmaking_visible = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    participants = relationship(
        "SeminarParticipant",
        back_populates="room",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="SeminarParticipant.joined_at",
    )
    turns = relationship(
        "SeminarTurn",
        back_populates="room",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="SeminarTurn.created_at",
    )

    __table_args__ = (
        Index("idx_seminar_rooms_status", "status"),
        Index("idx_seminar_rooms_subject_framework", "subject", "framework"),
        Index("idx_seminar_rooms_plan_id", "plan_id"),
        Index("idx_seminar_rooms_created_at", "created_at"),
    )


class SeminarParticipant(Base):
    __tablename__ = "seminar_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("seminar_rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(255), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    participant_key = Column(String(255), nullable=False)
    name = Column(String(80), nullable=False)
    kind = Column(String(30), nullable=False)  # human | ai_facilitator | ai_participant

    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    total_score = Column(Float, default=0.0)
    ability_snapshot = Column(JSON, default=dict)

    room = relationship("SeminarRoom", back_populates="participants")

    __table_args__ = (
        Index("idx_seminar_participants_room", "room_id"),
        Index("idx_seminar_participants_user", "user_id"),
        UniqueConstraint("room_id", "participant_key", name="uq_seminar_room_participant_key"),
    )


class SeminarTurn(Base):
    __tablename__ = "seminar_turns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("seminar_rooms.id", ondelete="CASCADE"), nullable=False)
    participant_id = Column(UUID(as_uuid=True), ForeignKey("seminar_participants.id", ondelete="SET NULL"), nullable=True)
    participant_key = Column(String(255), nullable=False)
    participant_name = Column(String(80), nullable=False)
    kind = Column(String(30), nullable=False)

    message = Column(Text, nullable=False)
    question = Column(Text, nullable=True)
    stance = Column(String(80), nullable=True)
    scores = Column(JSON, default=dict)
    source = Column(String(20), default="text", nullable=False)  # text | voice | ai
    audio_metadata = Column(JSON, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    room = relationship("SeminarRoom", back_populates="turns")

    __table_args__ = (
        Index("idx_seminar_turns_room", "room_id"),
        Index("idx_seminar_turns_created_at", "created_at"),
        Index("idx_seminar_turns_participant_key", "participant_key"),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": str(self.id),
            "participant_id": str(self.participant_id) if self.participant_id else self.participant_key,
            "participant_key": self.participant_key,
            "participant_name": self.participant_name,
            "kind": self.kind,
            "message": self.message,
            "question": self.question,
            "stance": self.stance,
            "scores": self.scores or {},
            "source": self.source,
            "audio_metadata": self.audio_metadata or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SeminarProfile(Base):
    __tablename__ = "seminar_profiles"

    user_id = Column(String(255), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    rating = Column(Integer, default=1000, nullable=False)
    rooms_completed = Column(Integer, default=0, nullable=False)
    turns_count = Column(Integer, default=0, nullable=False)
    ability_graph = Column(JSON, default=dict)
    last_room_id = Column(UUID(as_uuid=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_seminar_profiles_rating", "rating"),
        Index("idx_seminar_profiles_updated_at", "updated_at"),
    )
