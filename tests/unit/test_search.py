"""Unit tests for LessonStorageSQL.search_lessons()."""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime
from database.models.lesson import Lesson, LessonStatus


class TestSearchLessons:
    """Tests for the search_lessons method on LessonStorageSQL."""

    @pytest.fixture
    def storage(self):
        from database.storage import LessonStorageSQL
        return LessonStorageSQL()

    @pytest.fixture
    def mock_session(self):
        sess = MagicMock()
        return sess

    def _make_lesson(self, lesson_id="abc", topic="Python Basics", title="Intro to Python",
                     description="Learn Python programming", language="en",
                     student_level="beginner", quality_score=4.5,
                     difficulty_level="easy", duration_minutes=10):
        lesson = MagicMock(spec=Lesson)
        lesson.id = lesson_id
        lesson.topic = topic
        lesson.title = title
        lesson.description = description
        lesson.language = language
        lesson.student_level = student_level
        lesson.difficulty_level = difficulty_level
        lesson.quality_score = quality_score
        lesson.duration_minutes = duration_minutes
        lesson.created_at = datetime(2026, 1, 1)
        return lesson

    def test_search_matches_topic(self, storage, mock_session):
        storage.SessionLocal = lambda: mock_session
        lesson = self._make_lesson(topic="Python Programming")
        mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [lesson]

        results = storage.search_lessons("Python")
        assert len(results) == 1
        assert results[0]["topic"] == "Python Programming"

    def test_search_matches_title(self, storage, mock_session):
        storage.SessionLocal = lambda: mock_session
        lesson = self._make_lesson(title="Advanced Calculus")
        mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [lesson]

        results = storage.search_lessons("Calculus")
        assert len(results) == 1
        assert results[0]["title"] == "Advanced Calculus"

    def test_search_matches_description(self, storage, mock_session):
        storage.SessionLocal = lambda: mock_session
        lesson = self._make_lesson(description="Deep dive into machine learning algorithms")
        mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [lesson]

        results = storage.search_lessons("machine learning")
        assert len(results) == 1

    def test_search_case_insensitive(self, storage, mock_session):
        storage.SessionLocal = lambda: mock_session
        lesson = self._make_lesson(topic="PYTHON programming")
        mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [lesson]

        results = storage.search_lessons("python")
        assert len(results) == 1

    def test_search_no_results(self, storage, mock_session):
        storage.SessionLocal = lambda: mock_session
        mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []

        results = storage.search_lessons("zzzznonexistent")
        assert results == []

    def test_search_with_language_filter(self, storage, mock_session):
        storage.SessionLocal = lambda: mock_session
        lesson = self._make_lesson(language="zh")
        mock_session.query.return_value.filter.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [lesson]

        results = storage.search_lessons("数学", language="zh")
        assert len(results) == 1
        assert results[0]["language"] == "zh"

    def test_search_unicode_cjk(self, storage, mock_session):
        storage.SessionLocal = lambda: mock_session
        lesson = self._make_lesson(topic="三角函数", title="三角学基础")
        mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [lesson]

        results = storage.search_lessons("三角")
        assert len(results) == 1

    def test_search_description_truncation(self, storage, mock_session):
        storage.SessionLocal = lambda: mock_session
        long_desc = "x" * 300
        lesson = self._make_lesson(description=long_desc)
        mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [lesson]

        results = storage.search_lessons("xxx")
        assert len(results) == 1
        assert len(results[0]["description"]) <= 203  # 200 + "..."

    def test_search_result_structure(self, storage, mock_session):
        storage.SessionLocal = lambda: mock_session
        lesson = self._make_lesson()
        mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [lesson]

        results = storage.search_lessons("Python")
        assert len(results) == 1
        r = results[0]
        assert "id" in r
        assert "title" in r
        assert "topic" in r
        assert "description" in r
        assert "language" in r
        assert "student_level" in r
        assert "difficulty_level" in r
        assert "quality_score" in r
        assert "duration_minutes" in r
        assert "created_at" in r
