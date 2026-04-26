"""F3 — lesson mode preset mapping (T6)."""

from core.lesson_presets import (  # type: ignore
    PRESETS,
    apply_preset,
    default_preset_for_level,
)


def test_speedrun_preset_is_compact_and_fast():
    s = PRESETS["speedrun"]
    assert s["verbosity"] == "compact"
    assert s["showThinkingPath"] is False
    assert s["enableSeminar"] is False
    assert s["enableSimulation"] is False
    assert s["enableOralDefense"] is True
    assert s["addDeliberateError"] is True


def test_guided_preset_is_thorough_and_scaffolded():
    g = PRESETS["guided"]
    assert g["verbosity"] == "thorough"
    assert g["showThinkingPath"] is True
    assert g["enableSeminar"] is True
    assert g["enableSimulation"] is True
    assert g["enableOralDefense"] is False
    assert g["addDeliberateError"] is False


def test_custom_preset_is_empty():
    assert PRESETS["custom"] == {}


def test_apply_preset_returns_independent_copy():
    a = apply_preset("speedrun")
    a["verbosity"] = "thorough"  # mutate caller's copy
    # Original preset must remain untouched
    assert PRESETS["speedrun"]["verbosity"] == "compact"


def test_default_preset_advanced_is_speedrun():
    assert default_preset_for_level("advanced") == "speedrun"


def test_default_preset_beginner_is_guided():
    assert default_preset_for_level("beginner") == "guided"


def test_default_preset_intermediate_is_custom():
    assert default_preset_for_level("intermediate") == "custom"


def test_default_preset_unknown_is_custom():
    assert default_preset_for_level("") == "custom"
    assert default_preset_for_level(None) == "custom"  # type: ignore
