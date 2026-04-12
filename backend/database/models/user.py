"""
User Models
User authentication and profile management
"""

import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Text, 
    Boolean, JSON, ForeignKey, Index, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..base import Base


class UserRole(str):
    """User role constants."""
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN = "admin"
    SYSTEM = "system"


class User(Base):
    """
    User account table.
    
    Stores user authentication and profile information.
    
    Attributes:
        id (UUID): Primary key, automatically generated
        email (str): User email (unique)
        username (str): Username (unique)
        hashed_password (str): Hashed password
        full_name (str): User's full name
        role (str): User role (student, teacher, admin, system)
        language_preference (str): Preferred language
        is_active (bool): Whether account is active
        is_verified (bool): Whether email is verified
        subscription_tier (str): Subscription level
        metadata (JSON): Additional user metadata
        created_at (datetime): Account creation timestamp
        updated_at (datetime): Last update timestamp
        last_login_at (datetime): Last login timestamp
    """
    __tablename__ = "users"

    # Primary key — VARCHAR(255) in DB after UUID→VARCHAR migration (migrate_db.py)
    id = Column(String(255), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Authentication
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    
    # Profile
    full_name = Column(String(255))
    role = Column(String(20), nullable=False, default=UserRole.STUDENT)
    language_preference = Column(String(10), default="zh")
    
    # Account status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    subscription_tier = Column(String(50), default="free")
    
    # Metadata
    user_metadata = Column(JSON, default=dict)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True))
    
    # Relationships
    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    user_lessons = relationship("UserLesson", back_populates="user", cascade="all, delete-orphan")
    performance_records = relationship("StudentPerformance", back_populates="user", cascade="all, delete-orphan")
    memory_reviews = relationship("MemoryReview", back_populates="user", cascade="all, delete-orphan")
    agent_interactions = relationship("AgentInteractionTurn", back_populates="user", cascade="all, delete-orphan")
    proactive_notifications = relationship("ProactiveNotification", back_populates="user", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index('idx_users_email', 'email'),
        Index('idx_users_username', 'username'),
        Index('idx_users_role', 'role'),
        Index('idx_users_created_at', 'created_at'),
        Index('idx_users_subscription', 'subscription_tier'),
        UniqueConstraint('email', name='uq_users_email'),
        UniqueConstraint('username', name='uq_users_username'),
    )
    
    def to_dict(self, include_sensitive: bool = False) -> Dict[str, Any]:
        """
        Convert user to dictionary.
        
        Args:
            include_sensitive: Whether to include sensitive fields
            
        Returns:
            Dictionary representation of user
        """
        result = {
            "id": str(self.id),
            "email": self.email,
            "username": self.username,
            "full_name": self.full_name,
            "role": self.role,
            "language_preference": self.language_preference,
            "is_active": self.is_active,
            "is_verified": self.is_verified,
            "subscription_tier": self.subscription_tier,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
        }
        
        if include_sensitive:
            result["metadata"] = self.user_metadata
        
        return result
    
    def get_public_profile(self) -> Dict[str, Any]:
        """Get public user profile (safe for sharing)."""
        return {
            "id": str(self.id),
            "username": self.username,
            "full_name": self.full_name,
            "role": self.role,
            "language_preference": self.language_preference,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, username='{self.username}', email='{self.email}')>"


class UserLesson(Base):
    """
    User-lesson relationship table.
    
    Tracks user interactions with lessons (progress, completion, ratings).
    
    Attributes:
        id (int): Primary key
        user_id (UUID): Foreign key to users table
        lesson_id (UUID): Foreign key to lessons table
        progress_percentage (float): Completion percentage 0.0-100.0
        is_completed (bool): Whether lesson is completed
        rating (int): User rating 1-5
        review (str): User review text
        time_spent_minutes (int): Total time spent on lesson
        last_accessed_at (datetime): Last access timestamp
        created_at (datetime): Relationship creation timestamp
        updated_at (datetime): Last update timestamp
    """
    __tablename__ = "user_lessons"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    
    # Progress tracking
    progress_percentage = Column(Float, default=0.0)
    is_completed = Column(Boolean, default=False)
    
    # Feedback
    rating = Column(Integer)  # 1-5 stars
    review = Column(Text)
    
    # Usage tracking
    time_spent_minutes = Column(Integer, default=0)
    last_accessed_at = Column(DateTime(timezone=True))
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="user_lessons")
    lesson = relationship("Lesson")
    
    # Indexes and constraints
    __table_args__ = (
        Index('idx_user_lessons_user_id', 'user_id'),
        Index('idx_user_lessons_lesson_id', 'lesson_id'),
        Index('idx_user_lessons_completed', 'user_id', 'is_completed'),
        Index('idx_user_lessons_progress', 'user_id', 'progress_percentage'),
        UniqueConstraint('user_id', 'lesson_id', name='uq_user_lesson'),
    )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": str(self.user_id),
            "lesson_id": str(self.lesson_id),
            "progress_percentage": self.progress_percentage,
            "is_completed": self.is_completed,
            "rating": self.rating,
            "review": self.review,
            "time_spent_minutes": self.time_spent_minutes,
            "last_accessed_at": self.last_accessed_at.isoformat() if self.last_accessed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
    
    def __repr__(self) -> str:
        return f"<UserLesson(id={self.id}, user_id={self.user_id}, lesson_id={self.lesson_id}, progress={self.progress_percentage}%)>"


class UserProfile(Base):
    """
    Structured learner profile captured during onboarding.

    This profile is used to personalize topic analysis and future lesson generation.
    """
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(255), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)

    grade_level = Column(String(100))
    subject_interests = Column(JSON, default=list)
    current_challenges = Column(Text)
    long_term_goals = Column(Text)
    preferred_learning_style = Column(String(50))
    weekly_study_hours = Column(String(50))
    onboarding_completed = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="profile")

    __table_args__ = (
        Index('idx_user_profiles_user_id', 'user_id'),
        Index('idx_user_profiles_grade_level', 'grade_level'),
        UniqueConstraint('user_id', name='uq_user_profiles_user_id'),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": str(self.user_id),
            "grade_level": self.grade_level,
            "subject_interests": self.subject_interests or [],
            "current_challenges": self.current_challenges,
            "long_term_goals": self.long_term_goals,
            "preferred_learning_style": self.preferred_learning_style,
            "weekly_study_hours": self.weekly_study_hours,
            "onboarding_completed": self.onboarding_completed,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_ai_context_lines(self) -> List[str]:
        interests = ", ".join(self.subject_interests or [])
        context_lines = []
        if self.grade_level:
            context_lines.append(f"Grade level: {self.grade_level}")
        if interests:
            context_lines.append(f"Subject interests: {interests}")
        if self.current_challenges:
            context_lines.append(f"Current challenges: {self.current_challenges}")
        if self.long_term_goals:
            context_lines.append(f"Long-term goals: {self.long_term_goals}")
        if self.preferred_learning_style:
            context_lines.append(f"Preferred learning style: {self.preferred_learning_style}")
        if self.weekly_study_hours:
            context_lines.append(f"Weekly study time: {self.weekly_study_hours}")
        return context_lines

    def __repr__(self) -> str:
        return f"<UserProfile(user_id={self.user_id}, grade_level={self.grade_level}, onboarding_completed={self.onboarding_completed})>"


class StudentPerformance(Base):
    """
    Fine-grained records of how a learner performed during quizzes, seminars, or oral defenses.
    """
    __tablename__ = "student_performance"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    assessment_type = Column(String(50), nullable=False, default="reflection")
    score = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    strengths = Column(JSON, default=list)
    struggles = Column(JSON, default=list)
    reflection = Column(Text)
    performance_metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="performance_records")
    lesson = relationship("Lesson")

    __table_args__ = (
        Index('idx_student_performance_user_id', 'user_id'),
        Index('idx_student_performance_lesson_id', 'lesson_id'),
        Index('idx_student_performance_assessment_type', 'assessment_type'),
        Index('idx_student_performance_created_at', 'created_at'),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": str(self.user_id),
            "lesson_id": str(self.lesson_id),
            "assessment_type": self.assessment_type,
            "score": self.score,
            "confidence": self.confidence,
            "strengths": self.strengths or [],
            "struggles": self.struggles or [],
            "reflection": self.reflection,
            "metadata": self.performance_metadata or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class MemoryReview(Base):
    """
    Spaced-review queue using a simple forgetting-curve schedule.
    """
    __tablename__ = "memory_reviews"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    review_type = Column(String(50), nullable=False, default="memory_challenge")
    status = Column(String(20), nullable=False, default="scheduled")
    review_count = Column(Integer, nullable=False, default=0)
    ease_factor = Column(Float, nullable=False, default=2.0)
    interval_hours = Column(Float, nullable=False, default=48.0)
    due_at = Column(DateTime(timezone=True), nullable=False)
    last_presented_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    review_metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="memory_reviews")
    lesson = relationship("Lesson")

    __table_args__ = (
        Index('idx_memory_reviews_user_id', 'user_id'),
        Index('idx_memory_reviews_lesson_id', 'lesson_id'),
        Index('idx_memory_reviews_due_at', 'due_at'),
        Index('idx_memory_reviews_status', 'status'),
        UniqueConstraint('user_id', 'lesson_id', 'review_type', name='uq_memory_reviews_user_lesson_type'),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": str(self.user_id),
            "lesson_id": str(self.lesson_id),
            "review_type": self.review_type,
            "status": self.status,
            "review_count": self.review_count,
            "ease_factor": self.ease_factor,
            "interval_hours": self.interval_hours,
            "due_at": self.due_at.isoformat() if self.due_at else None,
            "last_presented_at": self.last_presented_at.isoformat() if self.last_presented_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "metadata": self.review_metadata or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AgentInteractionTurn(Base):
    """
    Lightweight process log for seminar, simulation, and oral-defense turns.
    """
    __tablename__ = "agent_interaction_turns"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    interaction_type = Column(String(50), nullable=False)
    user_input = Column(Text, nullable=False)
    agent_output = Column(JSON, default=dict)
    turn_metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="agent_interactions")
    lesson = relationship("Lesson")

    __table_args__ = (
        Index('idx_agent_interaction_turns_user_id', 'user_id'),
        Index('idx_agent_interaction_turns_lesson_id', 'lesson_id'),
        Index('idx_agent_interaction_turns_type', 'interaction_type'),
        Index('idx_agent_interaction_turns_created_at', 'created_at'),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": str(self.user_id),
            "lesson_id": str(self.lesson_id),
            "interaction_type": self.interaction_type,
            "user_input": self.user_input,
            "agent_output": self.agent_output or {},
            "metadata": self.turn_metadata or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ProactiveNotification(Base):
    """
    Lightweight in-app notification record for review nudges and process interventions.
    """
    __tablename__ = "proactive_notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"))
    notification_type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text)
    action_url = Column(String(500))
    status = Column(String(20), nullable=False, default="unread")
    delivery_channel = Column(String(20), nullable=False, default="in_app")
    scheduled_for = Column(DateTime(timezone=True))
    read_at = Column(DateTime(timezone=True))
    notification_metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="proactive_notifications")
    lesson = relationship("Lesson")

    __table_args__ = (
        Index('idx_proactive_notifications_user_id', 'user_id'),
        Index('idx_proactive_notifications_status', 'status'),
        Index('idx_proactive_notifications_scheduled_for', 'scheduled_for'),
        Index('idx_proactive_notifications_type', 'notification_type'),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": str(self.user_id),
            "lesson_id": str(self.lesson_id) if self.lesson_id else None,
            "notification_type": self.notification_type,
            "title": self.title,
            "body": self.body,
            "action_url": self.action_url,
            "status": self.status,
            "delivery_channel": self.delivery_channel,
            "scheduled_for": self.scheduled_for.isoformat() if self.scheduled_for else None,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "metadata": self.notification_metadata or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
