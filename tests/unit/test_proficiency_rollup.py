"""F5 — proficiency rollup math (T5). DB-free, pure functions only."""

from datetime import datetime, timezone, timedelta
from math import isclose

from core.proficiency_rollup import (  # type: ignore
    HALF_LIFE_DAYS,
    Sample,
    decayed_weight,
    detect_trend,
    hours_ago,
    weighted_proficiency,
)


def test_empty_samples_returns_neutral_prior():
    assert weighted_proficiency([]) == 0.5


def test_single_fresh_sample_equals_its_score():
    now = datetime.now(timezone.utc)
    s = Sample(score=0.83, created_at=now)
    # now=None means "now" inside the function — use a frozen now to avoid
    # sub-millisecond drift.
    assert isclose(weighted_proficiency([s], now=now), 0.83, abs_tol=1e-6)


def test_half_life_decay_matches_7_days():
    now = datetime.now(timezone.utc)
    past = now - timedelta(days=HALF_LIFE_DAYS)
    w = decayed_weight(past, now)
    assert isclose(w, 0.5, abs_tol=1e-6)


def test_recent_samples_dominate_old_ones():
    now = datetime.now(timezone.utc)
    old_low = Sample(score=0.0, created_at=now - timedelta(days=60))  # ~decayed to 0
    fresh_high = Sample(score=1.0, created_at=now)
    p = weighted_proficiency([old_low, fresh_high], now=now)
    assert p > 0.9


def test_scores_clamped_into_unit_interval():
    now = datetime.now(timezone.utc)
    weird = Sample(score=5.0, created_at=now)  # bogus > 1
    neg = Sample(score=-2.0, created_at=now)  # bogus < 0
    # Both get clamped, so 5.0 → 1.0, -2.0 → 0.0 — mean ≈ 0.5
    p = weighted_proficiency([weird, neg], now=now)
    assert 0.0 <= p <= 1.0


def test_trend_improving_when_recent_beats_previous():
    now = datetime.now(timezone.utc)
    prev = [
        Sample(0.3, now - timedelta(hours=72)),
        Sample(0.4, now - timedelta(hours=60)),
        Sample(0.35, now - timedelta(hours=48)),
    ]
    recent = [
        Sample(0.7, now - timedelta(hours=6)),
        Sample(0.8, now - timedelta(hours=3)),
        Sample(0.75, now),
    ]
    assert detect_trend(prev + recent) == "improving"


def test_trend_declining_when_recent_worse():
    now = datetime.now(timezone.utc)
    prev = [
        Sample(0.9, now - timedelta(hours=72)),
        Sample(0.85, now - timedelta(hours=60)),
        Sample(0.8, now - timedelta(hours=48)),
    ]
    recent = [
        Sample(0.3, now - timedelta(hours=6)),
        Sample(0.4, now - timedelta(hours=3)),
        Sample(0.35, now),
    ]
    assert detect_trend(prev + recent) == "declining"


def test_trend_stable_when_similar():
    now = datetime.now(timezone.utc)
    prev = [
        Sample(0.55, now - timedelta(hours=72)),
        Sample(0.60, now - timedelta(hours=60)),
        Sample(0.58, now - timedelta(hours=48)),
    ]
    recent = [
        Sample(0.57, now - timedelta(hours=6)),
        Sample(0.61, now - timedelta(hours=3)),
        Sample(0.59, now),
    ]
    assert detect_trend(prev + recent) == "stable"


def test_trend_stable_when_too_few_samples():
    now = datetime.now(timezone.utc)
    samples = [
        Sample(0.9, now - timedelta(hours=10)),
        Sample(0.9, now),
    ]
    assert detect_trend(samples) == "stable"


def test_weighted_proficiency_is_idempotent_on_same_input():
    now = datetime.now(timezone.utc)
    samples = [
        Sample(0.6, now - timedelta(hours=24)),
        Sample(0.8, now - timedelta(hours=12)),
        Sample(0.9, now),
    ]
    p1 = weighted_proficiency(samples, now=now)
    p2 = weighted_proficiency(samples, now=now)
    assert p1 == p2


def test_hours_ago_helper_returns_past_datetime():
    past = hours_ago(5.0)
    assert past < datetime.now(timezone.utc)
