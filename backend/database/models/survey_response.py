"""
Survey Response Model
First-party storage for in-app feedback surveys. Replaces a Google-Forms
approach so mainland-China testers (where Google Forms is blocked) can submit
and so submissions auto-correlate to telemetry.
"""

import uuid
from datetime import datetime
from typing import Dict, Any

from sqlalchemy import (
    Column, String, Integer, DateTime, Text, JSON, Index
)

from ..base import Base


class SurveyResponse(Base):
    """
    Survey responses table.

    Stores the full payload of an in-app feedback survey: demographics,
    quantitative ratings (likert + PMF + NPS), and free-text fields.
    `derived_*` columns are auto-attached server-side from telemetry_events
    keyed on `session_id` so each response is correlated to behaviour.
    """
    __tablename__ = "survey_responses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), index=True, nullable=True)
    session_id = Column(String(255), index=True, nullable=True)

    # Demographics
    exam = Column(String(64), nullable=True, index=True)
    school_year = Column(String(64), nullable=True)
    prior_tools = Column(JSON, default=list)

    # Quantitative
    likert = Column(JSON, default=dict)
    pmf_score = Column(String(32), nullable=True)
    nps = Column(Integer, nullable=True)

    # Open feedback (free text)
    pain_point = Column(Text, nullable=True)
    feature_request = Column(Text, nullable=True)
    other_feedback = Column(Text, nullable=True)

    # Optional contact
    contact_email = Column(String(255), nullable=True)

    # Context auto-attached server-side
    language = Column(String(8), nullable=True)
    derived_session_minutes = Column(Integer, nullable=True)
    derived_board_lessons = Column(Integer, nullable=True)
    derived_plans_created = Column(Integer, nullable=True)
    user_agent = Column(String(512), nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index('idx_survey_responses_user_id', 'user_id'),
        Index('idx_survey_responses_session_id', 'session_id'),
        Index('idx_survey_responses_created_at', 'created_at'),
        Index('idx_survey_responses_exam', 'exam'),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "exam": self.exam,
            "school_year": self.school_year,
            "prior_tools": self.prior_tools or [],
            "likert": self.likert or {},
            "pmf_score": self.pmf_score,
            "nps": self.nps,
            "pain_point": self.pain_point,
            "feature_request": self.feature_request,
            "other_feedback": self.other_feedback,
            "contact_email": self.contact_email,
            "language": self.language,
            "derived_session_minutes": self.derived_session_minutes,
            "derived_board_lessons": self.derived_board_lessons,
            "derived_plans_created": self.derived_plans_created,
            "user_agent": self.user_agent,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<SurveyResponse(id={self.id}, exam='{self.exam}', pmf='{self.pmf_score}')>"
