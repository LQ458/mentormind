"""
Analytics Models
Tracking usage, metrics, and system performance
"""

import uuid
from datetime import datetime, date
from typing import Dict, Any
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Date, 
    Text, Boolean, JSON, ForeignKey, Index, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..base import Base


class AnalyticsEventType(str):
    """Analytics event type constants."""
    LESSON_CREATED = "lesson_created"
    LESSON_VIEWED = "lesson_viewed"
    LESSON_COMPLETED = "lesson_completed"
    LESSON_RATED = "lesson_rated"
    USER_SIGNUP = "user_signup"
    USER_LOGIN = "user_login"
    API_CALL = "api_call"
    ERROR = "error"
    SYSTEM = "system"


class AnalyticsEvent(Base):
    """
    Analytics events table.
    
    Tracks system events for analytics and monitoring.
    
    Attributes:
        id (UUID): Primary key, automatically generated
        event_type (str): Type of event
        user_id (UUID): Optional foreign key to users table
        lesson_id (UUID): Optional foreign key to lessons table
        session_id (str): Browser/device session ID
        ip_address (str): Client IP address
        user_agent (str): Browser/device user agent
        metadata (JSON): Event-specific metadata
        created_at (datetime): Event timestamp
    """
    __tablename__ = "analytics_events"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Event information
    event_type = Column(String(50), nullable=False, index=True)
    user_id = Column(String(255), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True)
    
    # Client information
    session_id = Column(String(255))
    ip_address = Column(String(45))  # Supports IPv6
    user_agent = Column(Text)
    
    # Event data
    event_metadata = Column(JSON, default=dict)
    
    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User")
    lesson = relationship("Lesson")
    
    # Indexes
    __table_args__ = (
        Index('idx_analytics_event_type', 'event_type'),
        Index('idx_analytics_user_id', 'user_id'),
        Index('idx_analytics_lesson_id', 'lesson_id'),
        Index('idx_analytics_created_at', 'created_at'),
        Index('idx_analytics_session', 'session_id'),
    )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": str(self.id),
            "event_type": self.event_type,
            "user_id": str(self.user_id) if self.user_id else None,
            "lesson_id": str(self.lesson_id) if self.lesson_id else None,
            "session_id": self.session_id,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "metadata": self.event_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
    
    def __repr__(self) -> str:
        return f"<AnalyticsEvent(id={self.id}, type='{self.event_type}', created_at={self.created_at})>"


class DailyMetrics(Base):
    """
    Daily aggregated metrics table.
    
    Pre-aggregated daily metrics for fast reporting.
    
    Attributes:
        id (int): Primary key
        date (date): Metrics date
        total_lessons (int): Total lessons created
        total_users (int): Total users registered
        active_users (int): Users active on this day
        lessons_created (int): Lessons created on this day
        lessons_completed (int): Lessons completed on this day
        total_api_calls (int): Total API calls
        total_cost_usd (float): Total cost in USD
        average_quality (float): Average lesson quality
        metadata (JSON): Additional metrics
        updated_at (datetime): Last update timestamp
    """
    __tablename__ = "daily_metrics"
    
    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False, unique=True, index=True)
    
    # User metrics
    total_users = Column(Integer, default=0)
    active_users = Column(Integer, default=0)
    new_users = Column(Integer, default=0)
    
    # Lesson metrics
    total_lessons = Column(Integer, default=0)
    lessons_created = Column(Integer, default=0)
    lessons_viewed = Column(Integer, default=0)
    lessons_completed = Column(Integer, default=0)
    
    # System metrics
    total_api_calls = Column(Integer, default=0)
    successful_api_calls = Column(Integer, default=0)
    failed_api_calls = Column(Integer, default=0)
    
    # Cost and quality
    total_cost_usd = Column(Float, default=0.0)
    average_quality = Column(Float, default=0.0)
    
    # Language distribution (stored as JSON)
    language_distribution = Column(JSON, default=dict)
    
    # Metadata
    metrics_metadata = Column(JSON, default=dict)
    
    # Timestamp
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Indexes
    __table_args__ = (
        Index('idx_daily_metrics_date', 'date'),
        UniqueConstraint('date', name='uq_daily_metrics_date'),
    )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "date": self.date.isoformat() if self.date else None,
            "total_users": self.total_users,
            "active_users": self.active_users,
            "new_users": self.new_users,
            "total_lessons": self.total_lessons,
            "lessons_created": self.lessons_created,
            "lessons_viewed": self.lessons_viewed,
            "lessons_completed": self.lessons_completed,
            "total_api_calls": self.total_api_calls,
            "successful_api_calls": self.successful_api_calls,
            "failed_api_calls": self.failed_api_calls,
            "total_cost_usd": self.total_cost_usd,
            "average_quality": self.average_quality,
            "language_distribution": self.language_distribution,
            "metadata": self.metrics_metadata,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
    
    def __repr__(self) -> str:
        return f"<DailyMetrics(id={self.id}, date={self.date}, lessons_created={self.lessons_created})>"


class APILog(Base):
    """
    API call logging table.
    
    Detailed logging of API requests and responses.
    
    Attributes:
        id (UUID): Primary key, automatically generated
        endpoint (str): API endpoint path
        method (str): HTTP method (GET, POST, etc.)
        status_code (int): HTTP status code
        user_id (UUID): Optional foreign key to users table
        request_body (JSON): Request body (truncated if large)
        response_body (JSON): Response body (truncated if large)
        duration_ms (int): Request duration in milliseconds
        ip_address (str): Client IP address
        user_agent (str): Browser/device user agent
        error_message (str): Error message if any
        created_at (datetime): Request timestamp
    """
    __tablename__ = "api_logs"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Request information
    endpoint = Column(String(255), nullable=False, index=True)
    method = Column(String(10), nullable=False)
    status_code = Column(Integer, nullable=False)
    user_id = Column(String(255), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Request/response data
    request_body = Column(JSON)
    response_body = Column(JSON)
    
    # Performance
    duration_ms = Column(Integer)
    
    # Client information
    ip_address = Column(String(45))
    user_agent = Column(Text)
    
    # Error information
    error_message = Column(Text)
    
    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User")
    
    # Indexes
    __table_args__ = (
        Index('idx_api_logs_endpoint', 'endpoint'),
        Index('idx_api_logs_method', 'method'),
        Index('idx_api_logs_status', 'status_code'),
        Index('idx_api_logs_user_id', 'user_id'),
        Index('idx_api_logs_created_at', 'created_at'),
    )
    
    def to_dict(self, include_bodies: bool = False) -> Dict[str, Any]:
        result = {
            "id": str(self.id),
            "endpoint": self.endpoint,
            "method": self.method,
            "status_code": self.status_code,
            "user_id": str(self.user_id) if self.user_id else None,
            "duration_ms": self.duration_ms,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        
        if include_bodies:
            result["request_body"] = self.request_body
            result["response_body"] = self.response_body
        
        return result
    
    def __repr__(self) -> str:
        return f"<APILog(id={self.id}, endpoint='{self.endpoint}', status={self.status_code}, duration={self.duration_ms}ms)>"