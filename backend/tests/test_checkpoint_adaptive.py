"""Phase 2 tests — adaptive bias in CheckpointGenerator.should_insert_checkpoint.

Struggling learners raise checkpoint frequency; smooth (repeatedly-skipping)
learners suppress it; the original time-based path is preserved (back-compat).
"""

from core.modules.checkpoint_generator import (
    AdaptiveSignals,
    CheckpointGenerator,
    MAX_SECONDS_BETWEEN_CHECKS,
    MIN_SECONDS_BETWEEN_CHECKS,
)


# A mid-window elapsed: past min, before max. Baseline (no boundary) waits here.
_MID = (MIN_SECONDS_BETWEEN_CHECKS + MAX_SECONDS_BETWEEN_CHECKS) / 2


# ---- back-compat: time-based path unchanged when adaptive is None ----


def test_backcompat_below_min_holds():
    gen = CheckpointGenerator()
    d = gen.should_insert_checkpoint(MIN_SECONDS_BETWEEN_CHECKS - 1, False)
    assert d.insert is False
    assert d.reason == "below min interval"


def test_backcompat_section_boundary_inserts():
    gen = CheckpointGenerator()
    d = gen.should_insert_checkpoint(_MID, True)
    assert d.insert is True
    assert d.reason == "section boundary"


def test_backcompat_max_interval_inserts():
    gen = CheckpointGenerator()
    d = gen.should_insert_checkpoint(MAX_SECONDS_BETWEEN_CHECKS + 1, False)
    assert d.insert is True
    assert d.reason == "max interval reached"


def test_backcompat_mid_window_waits():
    gen = CheckpointGenerator()
    d = gen.should_insert_checkpoint(_MID, False)
    assert d.insert is False
    assert d.reason == "waiting for boundary or max"


def test_backcompat_last_segment_skips():
    gen = CheckpointGenerator()
    d = gen.should_insert_checkpoint(_MID, True, is_last_segment=True)
    assert d.insert is False


# ---- struggling: raise frequency ----


def test_struggling_wrong_answer_raises_frequency():
    gen = CheckpointGenerator()
    # Without adaptive signals this mid-window/no-boundary case would WAIT.
    baseline = gen.should_insert_checkpoint(_MID, False)
    assert baseline.insert is False

    adaptive = AdaptiveSignals(last_answer_correct=False)
    d = gen.should_insert_checkpoint(_MID, False, adaptive=adaptive)
    assert d.insert is True
    assert d.reason == "struggling; raise frequency"


def test_struggling_repeated_questions_raises_frequency():
    gen = CheckpointGenerator()
    adaptive = AdaptiveSignals(repeated_questions=2)
    d = gen.should_insert_checkpoint(_MID, False, adaptive=adaptive)
    assert d.insert is True


def test_struggling_long_dwell_raises_frequency():
    gen = CheckpointGenerator()
    adaptive = AdaptiveSignals(dwell_seconds=MAX_SECONDS_BETWEEN_CHECKS)
    d = gen.should_insert_checkpoint(_MID, False, adaptive=adaptive)
    assert d.insert is True


def test_struggling_still_respects_min_interval():
    gen = CheckpointGenerator()
    adaptive = AdaptiveSignals(last_answer_correct=False)
    d = gen.should_insert_checkpoint(
        MIN_SECONDS_BETWEEN_CHECKS - 1, False, adaptive=adaptive
    )
    assert d.insert is False
    assert d.reason == "below min interval"


# ---- smooth: suppress ----


def test_smooth_suppresses_at_section_boundary():
    gen = CheckpointGenerator()
    # Without adaptive this boundary case would INSERT.
    baseline = gen.should_insert_checkpoint(_MID, True)
    assert baseline.insert is True

    adaptive = AdaptiveSignals(consecutive_skipped_checks=2)
    d = gen.should_insert_checkpoint(_MID, True, adaptive=adaptive)
    assert d.insert is False
    assert d.reason == "smooth; suppress"


def test_struggling_overrides_smooth_when_simultaneous():
    """Priority: a struggling signal must NEVER be suppressed by a smooth one.

    last_answer_correct=False (struggling) AND consecutive_skipped_checks>=2
    (smooth) at once -> the check is inserted, not suppressed.
    """
    gen = CheckpointGenerator()
    adaptive = AdaptiveSignals(
        last_answer_correct=False,
        consecutive_skipped_checks=2,
    )
    d = gen.should_insert_checkpoint(_MID, False, adaptive=adaptive)
    assert d.insert is True
    assert d.reason == "struggling; raise frequency"


def test_smooth_still_forced_at_max_interval():
    gen = CheckpointGenerator()
    adaptive = AdaptiveSignals(consecutive_skipped_checks=3)
    d = gen.should_insert_checkpoint(
        MAX_SECONDS_BETWEEN_CHECKS + 1, False, adaptive=adaptive
    )
    assert d.insert is True
    assert d.reason == "max interval reached"


def test_neutral_adaptive_is_noop():
    gen = CheckpointGenerator()
    # An empty AdaptiveSignals must behave exactly like the time-based path.
    neutral = AdaptiveSignals()
    assert gen.should_insert_checkpoint(_MID, False, adaptive=neutral).reason == (
        "waiting for boundary or max"
    )
    assert gen.should_insert_checkpoint(_MID, True, adaptive=neutral).reason == (
        "section boundary"
    )
