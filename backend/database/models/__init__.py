"""
Database Models
Exports all SQLAlchemy models and enums for use throughout the application
"""

from .enums import (
    Language,
    StudentLevel,
    DifficultyLevel,
    ResourceType,
    ExerciseType,
    LessonStatus,
    AIProvider,
    Subject,
    ExamFramework,
    ContentType,
    UnitStatus,
    PlanStatus,
)

from .user import User, SubjectProficiency
from .lesson import Lesson, LessonObjective, LessonResource, LessonExercise
from .analytics import AnalyticsEventType
from .study_plan import StudyPlan, StudyPlanUnit, GaokaoSession

__all__ = [
    # Enums
    "Language",
    "StudentLevel",
    "DifficultyLevel",
    "ResourceType",
    "ExerciseType",
    "LessonStatus",
    "AIProvider",
    "Subject",
    "ExamFramework",
    "ContentType",
    "UnitStatus",
    "PlanStatus",
    # User models
    "User",
    "SubjectProficiency",
    # Lesson models
    "Lesson",
    "LessonObjective",
    "LessonResource",
    "LessonExercise",
    # Analytics
    "AnalyticsEventType",
    # Study plan models
    "StudyPlan",
    "StudyPlanUnit",
    "GaokaoSession",
]
