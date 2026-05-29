"""Sub-agent modules for orchestrator-invoked specialist tasks."""

from __future__ import annotations

import json
import re
from typing import Any, Dict

__all__ = ["researcher", "coder", "writer", "critic", "extract_json"]


def extract_json(text: str) -> Dict[str, Any]:
    """Best-effort JSON extraction from an LLM response.

    Tolerates markdown code fences and leading/trailing prose.
    """
    text = (text or "").strip()
    fence = re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    if not text.startswith("{"):
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            text = m.group(0)
    return json.loads(text)
