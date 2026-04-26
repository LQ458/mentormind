"""Schema-level assertions for the skill-adaptive learning additions (T1)."""

from sqlalchemy import inspect

from database.models import Lesson, SubjectProficiency  # type: ignore
from database.models.user import StudentPerformance, UserProfile  # type: ignore


def _cols(model):
    return {c.name for c in inspect(model).columns}


def test_user_profile_has_diagnostic_fields():
    cols = _cols(UserProfile)
    assert "proficiency_level" in cols
    assert "diagnostic_completed" in cols
    assert "diagnostic_results" in cols


def test_student_performance_has_subject_column():
    assert "subject" in _cols(StudentPerformance)


def test_lesson_has_verbosity_column():
    assert "verbosity" in _cols(Lesson)


def test_subject_proficiency_shape():
    expected = {
        "id",
        "user_id",
        "subject",
        "proficiency_0_to_1",
        "sample_size",
        "last_updated",
        "trend",
    }
    assert expected.issubset(_cols(SubjectProficiency))


def test_subject_proficiency_unique_constraint_on_user_subject():
    table = SubjectProficiency.__table__
    constraint_cols = [
        sorted(c.name for c in uc.columns)
        for uc in table.constraints
        if uc.__class__.__name__ == "UniqueConstraint"
    ]
    assert ["subject", "user_id"] in constraint_cols
