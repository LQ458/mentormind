import os
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import server


class LessonStorageStub:
    def __init__(self, lessons=None, lesson=None):
        self.lessons = lessons or []
        self.lesson = lesson
        self.deleted_ids = []

    def get_lessons_by_user(self, user_id, limit=100):
        return [lesson for lesson in self.lessons if lesson.get("user_id") == user_id][:limit]

    def get_lesson(self, lesson_id, include_relationships=True):
        return self.lesson

    def get_lesson_state(self, user_id, lesson_id):
        return None

    def delete_lesson(self, lesson_id):
        self.deleted_ids.append(lesson_id)
        return True


def test_get_lessons_returns_only_current_user_lessons():
    user = SimpleNamespace(id="user-1")
    storage = LessonStorageStub(
        lessons=[
            {"id": "owned", "user_id": "user-1", "title": "AP Calculus", "topic": "Limits", "language": "en"},
            {"id": "other", "user_id": "user-2", "title": "Private", "topic": "Hidden", "language": "en"},
        ]
    )

    result = server.get_lessons(current_user=user, lesson_storage=storage)

    assert result["total"] == 1
    assert result["lessons"][0]["id"] == "owned"


def test_get_lessons_search_filters_within_current_user_only():
    user = SimpleNamespace(id="user-1")
    storage = LessonStorageStub(
        lessons=[
            {"id": "owned-match", "user_id": "user-1", "title": "AP Calculus", "topic": "Limits", "language": "en"},
            {"id": "owned-miss", "user_id": "user-1", "title": "Biology", "topic": "Cells", "language": "en"},
            {"id": "other-match", "user_id": "user-2", "title": "AP Calculus", "topic": "Derivatives", "language": "en"},
        ]
    )

    result = server.get_lessons(search="calculus", current_user=user, lesson_storage=storage)

    assert result["total"] == 1
    assert result["lessons"][0]["id"] == "owned-match"


def test_get_lesson_detail_rejects_cross_user_lessons():
    user = SimpleNamespace(id="user-1")
    storage = LessonStorageStub(lesson={"id": "lesson-1", "user_id": "user-2"})

    with pytest.raises(HTTPException) as exc_info:
        server.get_lesson_detail("lesson-1", current_user=user, db=None, lesson_storage=storage)

    assert exc_info.value.status_code == 403


def test_delete_lesson_rejects_unowned_or_anonymous_lessons():
    user = SimpleNamespace(id="user-1")
    storage = LessonStorageStub(lesson={"id": "lesson-1", "user_id": None})

    with pytest.raises(HTTPException) as exc_info:
        server.delete_lesson("lesson-1", current_user=user, lesson_storage=storage)

    assert exc_info.value.status_code == 403
    assert storage.deleted_ids == []
