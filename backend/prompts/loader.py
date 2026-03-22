"""
Prompt Loader for MentorMind

Loads prompt markdown files from backend/prompts/ at runtime.

Usage:
    from prompts.loader import load_prompt, render_prompt

    # Raw file content
    raw = load_prompt("video/video_director_base")

    # Rendered with variables (replaces {{key}} placeholders)
    rendered = render_prompt("learning/seminar", lesson_title="Calculus", language_instruction="Reply in English.")
"""

import os
import re
from functools import lru_cache
from typing import Any

_PROMPTS_DIR = os.path.dirname(__file__)


@lru_cache(maxsize=64)
def load_prompt(name: str) -> str:
    """
    Load a prompt file by relative name (without .md extension).

    Example:
        load_prompt("video/video_director_base")
        load_prompt("learning/seminar")
    """
    path = os.path.join(_PROMPTS_DIR, f"{name}.md")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Prompt file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


def render_prompt(name: str, **variables: Any) -> str:
    """
    Load and render a prompt, replacing {{variable}} placeholders with values.

    Example:
        render_prompt("learning/seminar",
                      language_instruction="Reply in English.",
                      lesson_title="Calculus",
                      role_lines="- Mentor: ...",
                      ...)
    """
    template = load_prompt(name)
    for key, value in variables.items():
        template = template.replace(f"{{{{{key}}}}}", str(value) if value is not None else "")
    # Warn about any unfilled placeholders
    unfilled = re.findall(r"\{\{(\w+)\}\}", template)
    if unfilled:
        import warnings
        warnings.warn(f"render_prompt('{name}'): unfilled placeholders: {unfilled}", stacklevel=2)
    return template
