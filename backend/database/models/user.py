"""
User Models
User authentication and profile management
"""

import uuid
from datetime import datetime
from typing import Dict, Any, Optional
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
    
    # Primary key
    id = Column(String(255), primary_key=True)
    
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
    user_lessons = relationship("UserLesson", back_populates="user", cascade="all, delete-orphan")
    
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
    user_id = Column(String(255), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
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