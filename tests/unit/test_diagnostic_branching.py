"""F1 — adaptive diagnostic branching (T3)."""

from core.diagnostic_branching import (  # type: ignore
    Response,
    compute_proficiency,
    select_next_question,
)
from prompts.diagnostic.questions import QUESTION_BANK  # type: ignore


def test_first_question_is_difficulty_2_when_no_history():
    q = select_next_question(history=[], current_difficulty=2)
    assert q is not None
    assert q.difficulty == 2


def test_correct_answer_steps_difficulty_up():
    last = next(q for q in QUESTION_BANK if q.difficulty == 2)
    history = [Response(question_id=last.id, difficulty=2, correct=True)]
    q = select_next_question(history, current_difficulty=2)
    assert q is not None
    assert q.difficulty == 3


def test_wrong_answer_steps_difficulty_down():
    last = next(q for q in QUESTION_BANK if q.difficulty == 2)
    history = [Response(question_id=last.id, difficulty=2, correct=False)]
    q = select_next_question(history, current_difficulty=2)
    assert q is not None
    assert q.difficulty == 1


def test_correct_at_max_difficulty_stays_at_3():
    last3 = next(q for q in QUESTION_BANK if q.difficulty == 3)
    history = [Response(question_id=last3.id, difficulty=3, correct=True)]
    q = select_next_question(history, current_difficulty=3)
    assert q is not None
    assert q.difficulty == 3


def test_wrong_at_min_difficulty_stays_at_1():
    last1 = next(q for q in QUESTION_BANK if q.difficulty == 1)
    history = [Response(question_id=last1.id, difficulty=1, correct=False)]
    q = select_next_question(history, current_difficulty=1)
    assert q is not None
    assert q.difficulty == 1


def test_subject_filter_prefers_same_subject():
    q = select_next_question(history=[], current_difficulty=2, subject="math")
    assert q is not None
    assert q.subject == "math"


def test_does_not_repeat_seen_questions():
    math_qs = [q for q in QUESTION_BANK if q.subject == "math" and q.difficulty == 2]
    history = [Response(question_id=q.id, difficulty=2, correct=True) for q in math_qs]
    q = select_next_question(history, current_difficulty=2, subject="math")
    # Walked up to difficulty 3 because all answers were correct
    assert q is not None
    assert q.id not in {r.question_id for r in history}


def test_compute_proficiency_all_correct_advanced():
    responses = [
        Response("q1", 2, True),
        Response("q2", 3, True),
        Response("q3", 3, True),
    ]
    assert compute_proficiency(responses) == "advanced"


def test_compute_proficiency_all_wrong_beginner():
    responses = [
        Response("q1", 2, False),
        Response("q2", 1, False),
        Response("q3", 1, False),
    ]
    assert compute_proficiency(responses) == "beginner"


def test_compute_proficiency_mixed_intermediate():
    responses = [
        Response("q1", 2, True),
        Response("q2", 2, False),
        Response("q3", 2, True),
    ]
    # earned = 4, possible = 6, ratio = 0.67 → intermediate
    assert compute_proficiency(responses) == "intermediate"


def test_compute_proficiency_empty_returns_beginner():
    assert compute_proficiency([]) == "beginner"
