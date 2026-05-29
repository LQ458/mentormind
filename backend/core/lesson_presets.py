"""F3 — lesson mode presets (Speedrun / Guided / Custom).

Single source of truth for the preset→LessonDesignSettings mapping. The
backend reads this to validate incoming lesson-create payloads; the FE
component LessonModePresets.tsx mirrors it.

`verbosity` also gets persisted on the Lesson row (see Lesson.verbosity column).
"""

from typing import Dict, Literal, TypedDict

PresetName = Literal["speedrun", "guided", "custom"]


class LessonDesignSettings(TypedDict, total=False):
    showThinkingPath: bool
    enableSeminar: bool
    enableSimulation: bool
    enableOralDefense: bool
    addDeliberateError: bool
    verbosity: Literal["compact", "standard", "thorough"]


PRESETS: Dict[PresetName, LessonDesignSettings] = {
    "speedrun": {
        "showThinkingPath": False,
        "enableSeminar": False,
        "enableSimulation": False,
        "enableOralDefense": True,
        "addDeliberateError": True,
        "verbosity": "compact",
    },
    "guided": {
        "showThinkingPath": True,
        "enableSeminar": True,
        "enableSimulation": True,
        "enableOralDefense": False,
        "addDeliberateError": False,
        "verbosity": "thorough",
    },
    # "custom" is intentionally empty — the UI lets the user pick every toggle.
    "custom": {},
}


def default_preset_for_level(level: str) -> PresetName:
    """Map diagnostic proficiency_level to a sensible default preset.

    - advanced → speedrun (they want to move fast)
    - beginner → guided (they need scaffolding)
    - intermediate or unknown → custom (user picks)
    """
    if level == "advanced":
        return "speedrun"
    if level == "beginner":
        return "guided"
    return "custom"


def apply_preset(preset: PresetName) -> LessonDesignSettings:
    """Return a shallow copy of the preset's settings."""
    return dict(PRESETS[preset])
