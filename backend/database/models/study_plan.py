"""
Study Plan Models
Adaptive learning study plans and units for STEM subjects
"""

import uuid
from typing import Dict, List, Any, Optional
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Text,
    Boolean, JSON, ForeignKey, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..base import Base
from .enums import Language, UnitStatus, PlanStatus


class StudyPlan(Base):
    """
    Study plan table.

    Stores AI-generated study plans for STEM subjects, linked to a user.

    Attributes:
        id (UUID): Primary key, automatically generated
        user_id (UUID): Foreign key to users table
        subject (str): Subject area (math, physics, chemistry, biology, cs)
        framework (str): Exam framework (ap, a_level, gaokao, ib)
        course_name (str): Specific course name (e.g. "AP Calculus BC")
        title (str): Plan title
        description (Text): Detailed description
        language (str): Language code, default "zh"
        total_units (int): Number of units in the plan
        estimated_hours (float): Estimated total hours
        diagnostic_context (JSON): Chat history summary from diagnostic
        status (str): Plan status (draft, active, completed, archived)
        progress_percentage (float): Completion percentage 0.0-100.0
        ai_metadata (JSON): AI generation metadata
        created_at (datetime): Creation timestamp
        updated_at (datetime): Last update timestamp
    """
    __tablename__ = "study_plans"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Owner
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Subject and framework
    subject = Column(String(50), nullable=False)
    framework = Column(String(50), nullable=True)
    course_name = Column(String(255), nullable=True)

    # Core plan info
    title = Column(String(255), nullable=False)
    description = Column(Text)
    language = Column(String(10), default=Language.CHINESE.value)

    # Stats
    total_units = Column(Integer, default=0)
    estimated_hours = Column(Float, default=0.0)

    # Adaptive difficulty — updated based on quiz scores
    difficulty_level = Column(String(20), default="intermediate")

    # Diagnostic chat history summary
    diagnostic_context = Column(JSON, default=dict)

    # Status and progress
    status = Column(String(20), default=PlanStatus.DRAFT.value)
    progress_percentage = Column(Float, default=0.0)

    # AI metadata
    ai_metadata = Column(JSON, default=dict)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    units = relationship(
        "StudyPlanUnit",
        back_populates="plan",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="StudyPlanUnit.order_index"
    )
    gaokao_sessions = relationship(
        "GaokaoSession",
        back_populates="plan",
        cascade="all, delete-orphan",
        lazy="selectin"
    )

    __table_args__ = (
        Index('idx_study_plans_user_id', 'user_id'),
        Index('idx_study_plans_subject', 'subject'),
        Index('idx_study_plans_status', 'status'),
        Index('idx_study_plans_created_at', 'created_at'),
    )

    def to_dict(self, include_units: bool = True, include_relationships: bool = True) -> Dict[str, Any]:
        """Convert study plan to dictionary for API responses."""
        result = {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "subject": self.subject,
            "framework": self.framework,
            "course_name": self.course_name,
            "title": self.title,
            "description": self.description,
            "language": self.language,
            "total_units": self.total_units,
            "estimated_hours": self.estimated_hours,
            "difficulty_level": self.difficulty_level,
            "diagnostic_context": self.diagnostic_context,
            "status": self.status,
            "progress_percentage": self.progress_percentage,
            "ai_metadata": self.ai_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_units and include_relationships:
            result["units"] = [unit.to_dict() for unit in self.units]

        if include_relationships and self.framework == "gaokao":
            result["gaokao_sessions"] = [s.to_dict() for s in self.gaokao_sessions]

        return result

    def __repr__(self) -> str:
        return f"<StudyPlan(id={self.id}, title='{self.title}', subject='{self.subject}')>"


class StudyPlanUnit(Base):
    """
    Study plan unit table.

    Represents an individual unit within a study plan, containing
    content such as study guides, quizzes, and flashcards.

    Attributes:
        id (UUID): Primary key, automatically generated
        plan_id (UUID): Foreign key to study_plans table
        order_index (int): Display order within the plan
        title (str): Unit title
        description (Text): Unit description
        topics (JSON): List of topics covered
        learning_objectives (JSON): List of learning objectives
        prerequisites (JSON): List of prerequisite unit ids
        estimated_minutes (int): Estimated time in minutes
        content_status (str): Content generation status
        study_guide (JSON): Generated study guide content
        quiz (JSON): Generated quiz content
        flashcards (JSON): Generated flashcard content
        formula_sheet (JSON): Generated formula sheet content
        mock_exam (JSON): Generated mock exam content
        is_completed (bool): Whether the unit is completed by the user
        score (float): User score for this unit
        lesson_id (UUID): FK to lessons table (optional video link)
        created_at (datetime): Creation timestamp
        updated_at (datetime): Last update timestamp
    """
    __tablename__ = "study_plan_units"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Parent plan
    plan_id = Column(UUID(as_uuid=True), ForeignKey("study_plans.id", ondelete="CASCADE"), nullable=False)

    # Ordering
    order_index = Column(Integer, nullable=False, default=0)

    # Core unit info
    title = Column(String(255), nullable=False)
    description = Column(Text)

    # Structured content metadata
    topics = Column(JSON, default=list)
    learning_objectives = Column(JSON, default=list)
    prerequisites = Column(JSON, default=list)

    # Timing
    estimated_minutes = Column(Integer, default=60)

    # Content generation status
    content_status = Column(String(20), default=UnitStatus.PENDING.value)

    # Generated content blobs
    study_guide = Column(JSON, nullable=True)
    quiz = Column(JSON, nullable=True)
    flashcards = Column(JSON, nullable=True)
    formula_sheet = Column(JSON, nullable=True)
    mock_exam = Column(JSON, nullable=True)

    # User progress
    is_completed = Column(Boolean, default=False)
    score = Column(Float, nullable=True)

    # Optional link to a generated lesson video
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    plan = relationship("StudyPlan", back_populates="units")

    __table_args__ = (
        Index('idx_study_plan_units_plan_id', 'plan_id'),
        Index('idx_study_plan_units_order', 'plan_id', 'order_index'),
        Index('idx_study_plan_units_content_status', 'content_status'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert unit to dictionary for API responses."""
        return {
            "id": str(self.id),
            "plan_id": str(self.plan_id),
            "order_index": self.order_index,
            "title": self.title,
            "description": self.description,
            "topics": self.topics,
            "learning_objectives": self.learning_objectives,
            "prerequisites": self.prerequisites,
            "estimated_minutes": self.estimated_minutes,
            "content_status": self.content_status,
            "study_guide": self.study_guide,
            "quiz": self.quiz,
            "flashcards": self.flashcards,
            "formula_sheet": self.formula_sheet,
            "mock_exam": self.mock_exam,
            "is_completed": self.is_completed,
            "score": self.score,
            "lesson_id": str(self.lesson_id) if self.lesson_id else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<StudyPlanUnit(id={self.id}, title='{self.title}', order_index={self.order_index})>"


class GaokaoSession(Base):
    """
    Gaokao session table.

    Tracks interactive AI tutoring sessions focused on Gaokao exam prep,
    optionally linked to a study plan.

    Attributes:
        id (UUID): Primary key, automatically generated
        user_id (UUID): Foreign key to users table
        plan_id (UUID): Optional foreign key to study_plans table
        subject (str): Subject area for this session
        topic_focus (str): Specific topic being studied
        chat_history (JSON): Full chat message history
        resources_found (JSON): List of resources surfaced during session
        status (str): Session status (active, completed, etc.)
        created_at (datetime): Creation timestamp
        updated_at (datetime): Last update timestamp
    """
    __tablename__ = "gaokao_sessions"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Owner
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Optional plan link
    plan_id = Column(UUID(as_uuid=True), ForeignKey("study_plans.id", ondelete="SET NULL"), nullable=True)

    # Session context
    subject = Column(String(50), nullable=False)
    topic_focus = Column(String(255))

    # Session data
    chat_history = Column(JSON, default=list)
    resources_found = Column(JSON, default=list)

    # Status
    status = Column(String(20), default="active")

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    plan = relationship("StudyPlan", back_populates="gaokao_sessions")

    __table_args__ = (
        Index('idx_gaokao_sessions_user_id', 'user_id'),
        Index('idx_gaokao_sessions_plan_id', 'plan_id'),
        Index('idx_gaokao_sessions_subject', 'subject'),
        Index('idx_gaokao_sessions_status', 'status'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert session to dictionary for API responses."""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "plan_id": str(self.plan_id) if self.plan_id else None,
            "subject": self.subject,
            "topic_focus": self.topic_focus,
            "chat_history": self.chat_history,
            "resources_found": self.resources_found,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<GaokaoSession(id={self.id}, subject='{self.subject}', status='{self.status}')>"
