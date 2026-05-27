"""
Stable cache keys for generated study-plan unit content.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List


def build_unit_content_cache_key(
    *,
    plan_data: Dict[str, Any],
    unit_data: Dict[str, Any],
    content_types: List[str],
    language: str,
) -> str:
    payload = {
        "subject": plan_data.get("subject"),
        "framework": plan_data.get("framework"),
        "course_name": plan_data.get("course_name"),
        "difficulty_level": plan_data.get("difficulty_level"),
        "unit_title": unit_data.get("title"),
        "unit_description": unit_data.get("description"),
        "topics": unit_data.get("topics") or [],
        "learning_objectives": unit_data.get("learning_objectives") or [],
        "content_types": sorted(set(content_types or [])),
        "language": language,
        "version": 1,
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
