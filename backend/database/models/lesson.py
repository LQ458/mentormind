"""
Lesson Models
Core models for lesson storage and management
"""

import uuid
from datetime import datetime
from typing import Dict, List, Any, Optional
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Text, 
    Boolean, JSON, ForeignKey, Index, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..base import Base
from .enums import (
    Language, StudentLevel, DifficultyLevel, 
    ResourceType, ExerciseType, LessonStatus, AIProvider
)


class Lesson(Base):
    """
    Main lesson table.
    
    Stores all information about AI-generated lessons including:
    - Core content (title, description, topic)
    - Metadata (language, difficulty, duration)
    - Quality metrics and costs
    - AI generation insights
    - Relationships to objectives, resources, and exercises
    
    Attributes:
        id (UUID): Primary key, automatically generated
        title (str): Lesson title (max 255 chars)
        description (Text): Detailed lesson description
        topic (str): Main topic/subject (max 255 chars)
        language (str): Language code (zh, en, ja, ko)
        student_level (str): Target student level (beginner, intermediate, advanced)
        difficulty_level (str): Lesson difficulty (easy, medium, hard)
        duration_minutes (int): Estimated duration in minutes
        quality_score (float): Quality rating 0.0-1.0
        cost_usd (float): Estimated cost in USD
        ai_insights (JSON): AI generation metadata
        status (str): Lesson status (draft, published, archived, deleted)
        created_at (datetime): Creation timestamp
        updated_at (datetime): Last update timestamp
    """
    __tablename__ = "lessons"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Core lesson information
    title = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    topic = Column(String(255), nullable=False, index=True)
    
    # Metadata
    language = Column(String(10), nullable=False, default=Language.CHINESE.value)
    student_level = Column(String(20), nullable=False, default=StudentLevel.BEGINNER.value)
    difficulty_level = Column(String(20), default=DifficultyLevel.MEDIUM.value)
    duration_minutes = Column(Integer, nullable=False, default=30)
    # Narration verbosity: compact | standard | thorough (set by F3 lesson mode presets)
    verbosity = Column(String(20), default="standard", nullable=True)
    
    # Quality and cost metrics
    quality_score = Column(Float, default=0.0)  # 0.0 to 1.0
    cost_usd = Column(Float, default=0.0)
    
    # AI insights (stored as JSON for flexibility)
    ai_insights = Column(JSON, nullable=False, default=dict)
    
    # Status
    status = Column(String(20), default=LessonStatus.PUBLISHED.value)
    
    # Owner — nullable so anonymous lessons remain valid; VARCHAR to match users.id
    user_id = Column(String(255), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    objectives = relationship(
        "LessonObjective", 
        back_populates="lesson", 
        cascade="all, delete-orphan",
        lazy="selectin"  # Load with lesson for efficiency
    )
    resources = relationship(
        "LessonResource", 
        back_populates="lesson", 
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    exercises = relationship(
        "LessonExercise", 
        back_populates="lesson", 
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    
    # Indexes for common queries
    __table_args__ = (
        Index('idx_lessons_language', 'language'),
        Index('idx_lessons_student_level', 'student_level'),
        Index('idx_lessons_difficulty', 'difficulty_level'),
        Index('idx_lessons_created_at', 'created_at'),
        Index('idx_lessons_updated_at', 'updated_at'),
        Index('idx_lessons_quality_score', 'quality_score'),
        Index('idx_lessons_status', 'status'),
        Index('idx_lessons_topic_language', 'topic', 'language'),
    )
    
    def to_dict(self, include_relationships: bool = True) -> Dict[str, Any]:
        """
        Convert lesson to dictionary for API responses.
        
        Args:
            include_relationships: Whether to include related objects
            
        Returns:
            Dictionary representation of lesson
        """
        result = {
            "id": str(self.id),
            "title": self.title,
            "description": self.description,
            "topic": self.topic,
            "language": self.language,
            "student_level": self.student_level,
            "difficulty_level": self.difficulty_level,
            "duration_minutes": self.duration_minutes,
            "quality_score": self.quality_score,
            "cost_usd": self.cost_usd,
            "ai_insights": self.ai_insights,
            "status": self.status,
            "user_id": str(self.user_id) if self.user_id else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "video_url": self.ai_insights.get("video_url") if isinstance(self.ai_insights, dict) else None,
            "audio_url": self.ai_insights.get("audio_url") if isinstance(self.ai_insights, dict) else None,
        }
        
        if include_relationships:
            result["objectives"] = [obj.to_dict() for obj in self.objectives]
            result["resources"] = [res.to_dict() for res in self.resources]
            result["exercises"] = [ex.to_dict() for ex in self.exercises]
        
        return result
    
    def get_summary(self) -> Dict[str, Any]:
        """Get a summary view of the lesson (for lists)."""
        return {
            "id": str(self.id),
            "title": self.title,
            "topic": self.topic,
            "language": self.language,
            "student_level": self.student_level,
            "duration_minutes": self.duration_minutes,
            "quality_score": self.quality_score,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
    
    def __repr__(self) -> str:
        return f"<Lesson(id={self.id}, title='{self.title}', language='{self.language}')>"


class LessonObjective(Base):
    """
    Learning objectives for lessons.
    
    Stores individual learning objectives associated with a lesson.
    
    Attributes:
        id (int): Primary key
        lesson_id (UUID): Foreign key to lessons table
        objective (str): Learning objective text
        order_index (int): Display order (0-based)
    """
    __tablename__ = "lesson_objectives"
    
    id = Column(Integer, primary_key=True)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    objective = Column(Text, nullable=False)
    order_index = Column(Integer, default=0)
    
    # Relationship
    lesson = relationship("Lesson", back_populates="objectives")
    
    # Indexes
    __table_args__ = (
        Index('idx_objectives_lesson_id', 'lesson_id'),
        Index('idx_objectives_order', 'lesson_id', 'order_index'),
    )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "objective": self.objective,
            "order_index": self.order_index
        }
    
    def __repr__(self) -> str:
        return f"<LessonObjective(id={self.id}, lesson_id={self.lesson_id})>"


class LessonResource(Base):
    """
    Teaching resources for lessons.
    
    Stores various types of resources (videos, documents, links) associated with a lesson.
    
    Attributes:
        id (int): Primary key
        lesson_id (UUID): Foreign key to lessons table
        resource_type (str): Type of resource (video, document, link, etc.)
        title (str): Resource title
        url (str): Resource URL or path
        description (str): Resource description
        resource_metadata (JSON): Additional resource metadata
    """
    __tablename__ = "lesson_resources"
    
    id = Column(Integer, primary_key=True)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    resource_type = Column(String(50), nullable=False, default=ResourceType.DOCUMENT.value)
    title = Column(String(255))
    url = Column(Text)
    description = Column(Text)
    resource_metadata = Column(JSON, default=dict)
    
    # Relationship
    lesson = relationship("Lesson", back_populates="resources")
    
    # Indexes
    __table_args__ = (
        Index('idx_resources_lesson_id', 'lesson_id'),
        Index('idx_resources_type', 'resource_type'),
    )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.resource_type,
            "title": self.title,
            "url": self.url,
            "description": self.description,
            "metadata": self.resource_metadata
        }
    
    def __repr__(self) -> str:
        return f"<LessonResource(id={self.id}, type='{self.resource_type}', title='{self.title}')>"


class LessonExercise(Base):
    """
    Exercises and assessments for lessons.
    
    Stores various types of exercises (quizzes, coding, discussions) associated with a lesson.
    
    Attributes:
        id (int): Primary key
        lesson_id (UUID): Foreign key to lessons table
        exercise_type (str): Type of exercise (quiz, coding, discussion, etc.)
        question (str): Exercise question or prompt
        answer (str): Suggested answer or solution
        difficulty (str): Exercise difficulty
        exercise_metadata (JSON): Additional exercise metadata
    """
    __tablename__ = "lesson_exercises"
    
    id = Column(Integer, primary_key=True)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    exercise_type = Column(String(50), nullable=False, default=ExerciseType.QUIZ.value)
    question = Column(Text, nullable=False)
    answer = Column(Text)
    difficulty = Column(String(20))
    exercise_metadata = Column(JSON, default=dict)
    
    # Relationship
    lesson = relationship("Lesson", back_populates="exercises")
    
    # Indexes
    __table_args__ = (
        Index('idx_exercises_lesson_id', 'lesson_id'),
        Index('idx_exercises_type', 'exercise_type'),
        Index('idx_exercises_difficulty', 'difficulty'),
    )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.exercise_type,
            "question": self.question,
            "answer": self.answer,
            "difficulty": self.difficulty,
            "metadata": self.exercise_metadata
        }
    
    def __repr__(self) -> str:
        return f"<LessonExercise(id={self.id}, type='{self.exercise_type}', difficulty='{self.difficulty}')>"