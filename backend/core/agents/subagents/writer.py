"""Writer sub-agent: drafts polished explanatory prose for a concept."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from core.agents.subagents import extract_json
from services.api_client import DeepSeekClient, get_language_instruction

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "Pro/deepseek-ai/DeepSeek-V3"


async def run(task: str, context: Dict[str, Any], language: str) -> Dict[str, Any]:
    """Draft 2-4 sentences of explanatory prose about the concept.

    ``task`` is the concept string. ``context`` may include
    ``audience_level`` and ``target_length``. Returns
    ``{text, readability_level}`` on success or ``{error, raw?}``.
    """
    lang_instr = get_language_instruction(language)
    audience = (context or {}).get("audience_level") or "intermediate"
    target_length = int((context or {}).get("target_length", 100))

    system_prompt = (
        "You are a writing sub-agent.\n"
        "Given a concept and an audience level, produce 2-4 sentences of clear explanation.\n"
        f"Audience level: {audience}. Target length ~{target_length} words.\n"
        f"{lang_instr}\n\n"
        "Return ONLY a JSON object (no markdown, no prose around it):\n"
        "{\n"
        '  "text": "...",                      // the 2-4 sentence explanation\n'
        '  "readability_level": "beginner"    // one of: beginner | intermediate | advanced\n'
        "}"
    )
    user_prompt = f"Concept: {task}"

    client = DeepSeekClient()
    try:
        response = await client.chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=DEFAULT_MODEL,
            temperature=0.3,
            max_tokens=1500,
        )
    except Exception as e:  # pragma: no cover - defensive
        logger.warning("writer chat_completion raised: %s", e)
        return {"error": f"chat_completion raised: {e}"}

    if not getattr(response, "success", False):
        return {"error": getattr(response, "error", "unknown error")}

    raw = (
        response.data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    try:
        parsed = extract_json(raw)
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("writer JSON parse failed: %s", e)
        return {"error": f"parse failed: {e}", "raw": raw}

    return {
        "text": str(parsed.get("text", "")),
        "readability_level": str(parsed.get("readability_level", audience)),
    }
