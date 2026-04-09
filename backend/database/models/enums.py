"""
Database Enums
Centralized enumeration types for consistent data validation
"""

from enum import Enum


class Language(str, Enum):
    """
    Supported languages for lessons and content.
    
    Attributes:
        CHINESE: Chinese language (简体中文)
        ENGLISH: English language
        JAPANESE: Japanese language (日本語)
        KOREAN: Korean language (한국어)
    """
    CHINESE = "zh"
    ENGLISH = "en"
    JAPANESE = "ja"
    KOREAN = "ko"
    
    @classmethod
    def get_display_name(cls, language_code: str) -> str:
        """Get display name for language code."""
        display_names = {
            "zh": "中文",
            "en": "English",
            "ja": "日本語",
            "ko": "한국어"
        }
        return display_names.get(language_code, language_code)


class StudentLevel(str, Enum):
    """
    Student proficiency levels.
    
    Attributes:
        BEGINNER: No prior knowledge, starting from basics
        INTERMEDIATE: Some experience, can handle intermediate concepts
        ADVANCED: Experienced, ready for advanced topics
    """
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    
    @classmethod
    def get_display_name(cls, level: str) -> str:
        """Get display name for student level."""
        display_names = {
            "beginner": "Beginner",
            "intermediate": "Intermediate",
            "advanced": "Advanced"
        }
        return display_names.get(level, level)


class DifficultyLevel(str, Enum):
    """
    Lesson difficulty levels.
    
    Attributes:
        EASY: Simple concepts, minimal prerequisites
        MEDIUM: Moderate complexity, some prerequisites needed
        HARD: Complex topics, significant background required
    """
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    
    @classmethod
    def get_display_name(cls, difficulty: str) -> str:
        """Get display name for difficulty level."""
        display_names = {
            "easy": "Easy",
            "medium": "Medium",
            "hard": "Hard"
        }
        return display_names.get(difficulty, difficulty)


class ResourceType(str, Enum):
    """
    Types of teaching resources.
    
    Attributes:
        VIDEO: Video content
        DOCUMENT: Text document (PDF, Word, etc.)
        LINK: External web link
        IMAGE: Image or diagram
        AUDIO: Audio recording
        CODE: Code snippet or repository
        QUIZ: Interactive quiz
        EXERCISE: Practice exercise
    """
    VIDEO = "video"
    DOCUMENT = "document"
    LINK = "link"
    IMAGE = "image"
    AUDIO = "audio"
    CODE = "code"
    QUIZ = "quiz"
    EXERCISE = "exercise"


class ExerciseType(str, Enum):
    """
    Types of exercises and assessments.
    
    Attributes:
        QUIZ: Multiple choice or short answer quiz
        CODING: Programming exercise
        DISCUSSION: Discussion question
        PROJECT: Project-based assignment
        ESSAY: Written essay or analysis
        PRACTICE: Practice problems
        REVIEW: Review questions
    """
    QUIZ = "quiz"
    CODING = "coding"
    DISCUSSION = "discussion"
    PROJECT = "project"
    ESSAY = "essay"
    PRACTICE = "practice"
    REVIEW = "review"


class LessonStatus(str, Enum):
    """
    Status of a lesson.
    
    Attributes:
        DRAFT: Lesson is being created/edited
        PUBLISHED: Lesson is available for use
        ARCHIVED: Lesson is no longer active
        DELETED: Lesson is marked for deletion
    """
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    DELETED = "deleted"


class AIProvider(str, Enum):
    """
    AI service providers.
    
    Attributes:
        DEEPSEEK: DeepSeek AI models
        OPENAI: OpenAI models
        ANTHROPIC: Anthropic Claude models
        LOCAL: Local/self-hosted models
    """
    DEEPSEEK = "deepseek"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    LOCAL = "local"


class Subject(str, Enum):
    MATH = "math"
    PHYSICS = "physics"
    CHEMISTRY = "chemistry"
    BIOLOGY = "biology"
    CS = "cs"
    HISTORY = "history"
    ENGLISH = "english"
    ECONOMICS = "economics"
    PSYCHOLOGY = "psychology"
    GOVERNMENT = "government"
    WORLD_LANGUAGES = "world_languages"
    ENVIRONMENTAL_SCIENCE = "environmental_science"
    ART = "art"
    GENERAL = "general"


class ExamFramework(str, Enum):
    AP = "ap"
    A_LEVEL = "a_level"
    GAOKAO = "gaokao"
    IB = "ib"
    GENERAL = "general"


class ContentType(str, Enum):
    STUDY_GUIDE = "study_guide"
    QUIZ = "quiz"
    FLASHCARDS = "flashcards"
    FORMULA_SHEET = "formula_sheet"
    MOCK_EXAM = "mock_exam"


class UnitStatus(str, Enum):
    PENDING = "pending"
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"


class PlanStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"