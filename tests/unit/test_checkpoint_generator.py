"""F2 — CheckpointGenerator placement heuristics (T4)."""

from core.modules.checkpoint_generator import CheckpointGenerator  # type: ignore


def test_suppresses_checks_before_min_interval():
    gen = CheckpointGenerator(min_seconds=90.0, max_seconds=180.0)
    d = gen.should_insert_checkpoint(
        elapsed_seconds_since_last=30.0, at_section_boundary=True
    )
    assert d.insert is False
    assert "min" in d.reason


def test_inserts_at_section_boundary_after_min_elapsed():
    gen = CheckpointGenerator(min_seconds=90.0, max_seconds=180.0)
    d = gen.should_insert_checkpoint(
        elapsed_seconds_since_last=95.0, at_section_boundary=True
    )
    assert d.insert is True


def test_force_inserts_once_max_interval_reached():
    gen = CheckpointGenerator(min_seconds=90.0, max_seconds=180.0)
    d = gen.should_insert_checkpoint(
        elapsed_seconds_since_last=200.0, at_section_boundary=False
    )
    assert d.insert is True
    assert "max" in d.reason


def test_waits_between_min_and_max_without_boundary():
    gen = CheckpointGenerator(min_seconds=90.0, max_seconds=180.0)
    d = gen.should_insert_checkpoint(
        elapsed_seconds_since_last=120.0, at_section_boundary=False
    )
    assert d.insert is False


def test_never_inserts_on_last_segment():
    gen = CheckpointGenerator()
    d = gen.should_insert_checkpoint(
        elapsed_seconds_since_last=300.0, at_section_boundary=True, is_last_segment=True
    )
    assert d.insert is False


def test_generate_checkpoint_emoji_only_by_default():
    gen = CheckpointGenerator()
    payload = gen.generate_checkpoint(topic="derivatives", segment_summary="chain rule")
    assert payload["allow_emoji"] is True
    assert "question" not in payload


def test_generate_checkpoint_with_mcq():
    gen = CheckpointGenerator()
    payload = gen.generate_checkpoint(
        topic="calc",
        segment_summary="chain rule",
        include_mcq=True,
        question="d/dx sin(x^2)?",
        options=["cos(x^2)", "2x cos(x^2)", "2x sin(x^2)", "x^2 cos(x^2)"],
    )
    assert payload["question"] == "d/dx sin(x^2)?"
    assert len(payload["options"]) == 4
