"""F5 — roll StudentPerformance samples into a per-subject proficiency score.

Pure math lives at module level so it is DB-free and easy to test.
`rollup_user_subject` is the DB-aware entry point used by the Celery task.

Scoring model:
- Each StudentPerformance sample contributes a normalized score in [0, 1].
- Weights decay exponentially with age (half-life 7 days).
- Final proficiency = weighted mean; bounded to [0, 1].
- Trend: compare mean of the 3 most recent samples vs. the 3 before that.
  > +0.08 → improving;  < -0.08 → declining;  else stable.
"""

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from math import exp, log
from typing import List, Literal, Optional


HALF_LIFE_DAYS = 7.0
# Decay constant λ so that exp(-λ * HALF_LIFE_DAYS) == 0.5
_DECAY_LAMBDA = log(2) / HALF_LIFE_DAYS
_TREND_DELTA = 0.08

Trend = Literal["improving", "stable", "declining"]


@dataclass(frozen=True)
class Sample:
    """A single performance sample used by the rollup.

    `score` is already normalized to [0, 1]. StudentPerformance.score is a
    float in [0, 1] per the existing schema, so mapping is 1-to-1.
    """

    score: float
    created_at: datetime


def _age_days(sample_time: datetime, now: datetime) -> float:
    # Both datetimes are expected to be timezone-aware; fall back to UTC if not.
    if sample_time.tzinfo is None:
        sample_time = sample_time.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    delta = now - sample_time
    return max(delta.total_seconds() / 86400.0, 0.0)


def decayed_weight(sample_time: datetime, now: datetime) -> float:
    return exp(-_DECAY_LAMBDA * _age_days(sample_time, now))


def weighted_proficiency(samples: List[Sample], now: Optional[datetime] = None) -> float:
    if not samples:
        return 0.5  # neutral prior for unknown users
    now = now or datetime.now(timezone.utc)
    weights = [decayed_weight(s.created_at, now) for s in samples]
    total_w = sum(weights)
    if total_w == 0:
        return 0.5
    weighted_sum = sum(w * max(0.0, min(1.0, s.score)) for w, s in zip(weights, samples))
    return max(0.0, min(1.0, weighted_sum / total_w))


def detect_trend(samples: List[Sample]) -> Trend:
    """Compare last 3 vs. previous 3 samples (chronological order assumed)."""
    if len(samples) < 4:
        return "stable"
    sorted_samples = sorted(samples, key=lambda s: s.created_at)
    recent = sorted_samples[-3:]
    prev = sorted_samples[-6:-3] if len(sorted_samples) >= 6 else sorted_samples[:-3]
    if not prev:
        return "stable"
    recent_mean = sum(s.score for s in recent) / len(recent)
    prev_mean = sum(s.score for s in prev) / len(prev)
    diff = recent_mean - prev_mean
    if diff > _TREND_DELTA:
        return "improving"
    if diff < -_TREND_DELTA:
        return "declining"
    return "stable"


def rollup_user_subject(user_id: str, subject: str, session) -> Optional[dict]:
    """DB-aware rollup. Returns a dict snapshot of the upserted row, or None
    if the user has no samples for this subject.

    `session` is a SQLAlchemy session (sync). The Celery task passes one in.
    Import models inside the function so tests that exercise pure math don't
    pay import cost and don't require sqlalchemy to be installed for math-only
    test scenarios.
    """
    from database.models.user import StudentPerformance, SubjectProficiency

    rows = (
        session.query(StudentPerformance)
        .filter(
            StudentPerformance.user_id == user_id,
            StudentPerformance.subject == subject,
        )
        .all()
    )
    if not rows:
        return None

    samples = [Sample(score=r.score or 0.0, created_at=r.created_at) for r in rows]
    proficiency = weighted_proficiency(samples)
    trend = detect_trend(samples)

    existing = (
        session.query(SubjectProficiency)
        .filter(
            SubjectProficiency.user_id == user_id,
            SubjectProficiency.subject == subject,
        )
        .one_or_none()
    )
    if existing is None:
        existing = SubjectProficiency(
            user_id=user_id,
            subject=subject,
            proficiency_0_to_1=proficiency,
            sample_size=len(samples),
            trend=trend,
        )
        session.add(existing)
    else:
        existing.proficiency_0_to_1 = proficiency
        existing.sample_size = len(samples)
        existing.trend = trend

    session.commit()
    session.refresh(existing)
    return existing.to_dict()


def hours_ago(n: float) -> datetime:
    """Test helper: now - n hours."""
    return datetime.now(timezone.utc) - timedelta(hours=n)
