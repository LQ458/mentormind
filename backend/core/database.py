"""
Database Models for MentorMind
PostgreSQL with SQLAlchemy ORM
"""

import os
import uuid
from datetime import datetime
from typing import Dict, List, Any, Optional
from enum import Enum

from sqlalchemy import (
    create_engine, Column, String, Integer, Float, 
    DateTime, Text, Boolean, JSON, ForeignKey, Index
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from config import config

# Database configuration from config
db_config = config.get_databases().get("postgres")
if not db_config:
    raise ValueError("PostgreSQL configuration not found in config")

# Construct database URL
DB_URL = f"postgresql://{db_config.username}:{db_config.password}@{db_config.host}:{db_config.port}/{db_config.database}"

# Create engine with connection pooling
engine = create_engine(
    DB_URL,
    pool_size=db_config.max_connections,
    max_overflow=10,
    pool_pre_ping=True,
    echo=False  # Set to True for SQL debugging
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


class Language(str, Enum):
    """Supported languages"""
    CHINESE = "zh"
    ENGLISH = "en"
    JAPANESE = "ja"
    KOREAN = "ko"


class StudentLevel(str, Enum):
    """Student proficiency levels"""
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class DifficultyLevel(str, Enum):
    """Lesson difficulty levels"""
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class Lesson(Base):
    """Main lesson table"""
    __tablename__ = "lessons"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Core lesson information
    title = Column(String(255), nullable=False)
    description = Column(Text)
    topic = Column(String(255), nullable=False)
    
    # Metadata
    language = Column(String(10), nullable=False, default=Language.CHINESE.value)
    student_level = Column(String(20), nullable=False, default=StudentLevel.BEGINNER.value)
    difficulty_level = Column(String(20), default=DifficultyLevel.MEDIUM.value)
    duration_minutes = Column(Integer, nullable=False, default=30)
    
    # Quality and cost metrics
    quality_score = Column(Float, default=0.0)  # 0.0 to 1.0
    cost_usd = Column(Float, default=0.0)
    
    # AI insights (stored as JSON for flexibility)
    ai_insights = Column(JSON, nullable=False, default=dict)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    objectives = relationship("LessonObjective", back_populates="lesson", cascade="all, delete-orphan")
    resources = relationship("LessonResource", back_populates="lesson", cascade="all, delete-orphan")
    exercises = relationship("LessonExercise", back_populates="lesson", cascade="all, delete-orphan")
    
    # Indexes for common queries
    __table_args__ = (
        Index('idx_lessons_language', 'language'),
        Index('idx_lessons_student_level', 'student_level'),
        Index('idx_lessons_created_at', 'created_at'),
        Index('idx_lessons_quality_score', 'quality_score'),
        Index('idx_lessons_topic', 'topic'),
    )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert lesson to dictionary"""
        return {
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
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "objectives": [obj.objective for obj in self.objectives],
            "resources": [res.to_dict() for res in self.resources],
            "exercises": [ex.to_dict() for ex in self.exercises]
        }


class LessonObjective(Base):
    """Learning objectives for lessons"""
    __tablename__ = "lesson_objectives"
    
    id = Column(Integer, primary_key=True)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    objective = Column(Text, nullable=False)
    order_index = Column(Integer, default=0)
    
    # Relationship
    lesson = relationship("Lesson", back_populates="objectives")
    
    __table_args__ = (
        Index('idx_objectives_lesson_id', 'lesson_id'),
    )


class LessonResource(Base):
    """Teaching resources for lessons"""
    __tablename__ = "lesson_resources"
    
    id = Column(Integer, primary_key=True)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    resource_type = Column(String(50), nullable=False)  # video, document, link, etc.
    title = Column(String(255))
    url = Column(Text)
    description = Column(Text)
    
    # Relationship
    lesson = relationship("Lesson", back_populates="resources")
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.resource_type,
            "title": self.title,
            "url": self.url,
            "description": self.description
        }


class LessonExercise(Base):
    """Exercises and assessments for lessons"""
    __tablename__ = "lesson_exercises"
    
    id = Column(Integer, primary_key=True)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    exercise_type = Column(String(50), nullable=False)  # quiz, coding, discussion, etc.
    question = Column(Text, nullable=False)
    answer = Column(Text)
    difficulty = Column(String(20))
    
    # Relationship
    lesson = relationship("Lesson", back_populates="exercises")
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.exercise_type,
            "question": self.question,
            "answer": self.answer,
            "difficulty": self.difficulty
        }


class DatabaseManager:
    """Manager for database operations"""
    
    def __init__(self):
        self.engine = engine
        self.SessionLocal = SessionLocal
        
    def init_db(self):
        """Initialize database tables"""
        Base.metadata.create_all(bind=self.engine)
        print("✅ Database tables created")
    
    def drop_db(self):
        """Drop all tables (for testing)"""
        Base.metadata.drop_all(bind=self.engine)
        print("🗑️ Database tables dropped")
    
    def get_session(self) -> Session:
        """Get database session"""
        return self.SessionLocal()
    
    def test_connection(self) -> bool:
        """Test database connection"""
        try:
            with self.engine.connect() as conn:
                conn.execute("SELECT 1")
            return True
        except Exception as e:
            print(f"❌ Database connection failed: {e}")
            return False


# Global database manager instance
db_manager = DatabaseManager()


def init_database():
    """Initialize database on startup"""
    print("🔧 Initializing database...")
    
    # Test connection
    if not db_manager.test_connection():
        print("⚠️  Database connection failed. Using fallback mode.")
        return False
    
    # Create tables
    try:
        db_manager.init_db()
        print("✅ Database initialized successfully")
        return True
    except Exception as e:
        print(f"❌ Failed to initialize database: {e}")
        return False


def get_db():
    """Dependency for FastAPI to get database session"""
    db = db_manager.get_session()
    try:
        yield db
    finally:
        db.close()


if __name__ == "__main__":
    # Test database initialization
    print("🧪 Testing database setup...")
    
    if init_database():
        print("🎉 Database setup successful!")
        
        # Test a simple query
        with db_manager.get_session() as session:
            count = session.query(Lesson).count()
            print(f"📊 Total lessons in database: {count}")
    else:
        print("❌ Database setup failed")