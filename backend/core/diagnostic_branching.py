"""Adaptive branching for the onboarding diagnostic quiz (F1).

Start at difficulty 2. Correct → step up (cap 3). Wrong → step down (cap 1).
After N questions, compute proficiency from the mix of correct/wrong answers
and the difficulty of each.
"""

from dataclasses import dataclass
from typing import List, Literal, Optional

from prompts.diagnostic.questions import QUESTION_BANK, Question

Level = Literal["beginner", "intermediate", "advanced"]


@dataclass(frozen=True)
class Response:
    question_id: str
    difficulty: int  # 1..3
    correct: bool


def _unseen_with_difficulty(
    bank: List[Question],
    difficulty: int,
    seen_ids: set,
    subject: Optional[str] = None,
) -> Optional[Question]:
    candidates = [
        q
        for q in bank
        if q.difficulty == difficulty
        and q.id not in seen_ids
        and (subject is None or q.subject == subject)
    ]
    return candidates[0] if candidates else None


def _next_difficulty(history: List[Response], current: int) -> int:
    if not history:
        return current
    last = history[-1]
    if last.correct:
        return min(current + 1, 3)
    return max(current - 1, 1)


def select_next_question(
    history: List[Response],
    current_difficulty: int = 2,
    subject: Optional[str] = None,
    bank: Optional[List[Question]] = None,
) -> Optional[Question]:
    """Pick the next question by walking difficulty up/down from the last result.

    Falls back to any difficulty (with subject filter, if provided), then to
    any unseen question if the target difficulty has nothing left.
    """
    bank = bank or QUESTION_BANK
    seen = {r.question_id for r in history}
    target = _next_difficulty(history, current_difficulty)

    q = _unseen_with_difficulty(bank, target, seen, subject)
    if q is not None:
        return q

    # Degrade: try adjacent difficulties in the same subject, then any subject
    for d in (target, target - 1, target + 1, 1, 2, 3):
        if d < 1 or d > 3:
            continue
        q = _unseen_with_difficulty(bank, d, seen, subject)
        if q is not None:
            return q
    for d in (target, target - 1, target + 1, 1, 2, 3):
        if d < 1 or d > 3:
            continue
        q = _unseen_with_difficulty(bank, d, seen, None)
        if q is not None:
            return q
    return None


def compute_proficiency(responses: List[Response]) -> Level:
    """Score each response by difficulty (correct → +d, wrong → 0),
    divide by theoretical max, threshold into {beginner, intermediate, advanced}.
    """
    if not responses:
        return "beginner"
    earned = sum(r.difficulty for r in responses if r.correct)
    possible = sum(r.difficulty for r in responses)
    # possible is guaranteed >= 1 because responses is non-empty and each
    # Response carries a real difficulty (1..3); sum cannot be zero.
    ratio = earned / possible if possible > 0 else 0.0

    if ratio >= 0.75:
        return "advanced"
    if ratio >= 0.4:
        return "intermediate"
    return "beginner"
