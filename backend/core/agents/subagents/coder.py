"""Coder sub-agent: generates a runnable code snippet for a task."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from core.agents.subagents import extract_json
from services.api_client import DeepSeekClient, get_language_instruction

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "Pro/deepseek-ai/DeepSeek-V3"


async def run(task: str, context: Dict[str, Any], language: str) -> Dict[str, Any]:
    """Generate a single runnable code snippet.

    Returns ``{language, code, explanation}`` on success or ``{error, raw?}``.
    """
    lang_instr = get_language_instruction(language)
    preference = (context or {}).get("language_preference") or "python"

    system_prompt = (
        "You are a code sub-agent.\n"
        "Given a programming task description, output EXACTLY one runnable snippet.\n"
        f"Prefer the language: {preference}.\n"
        f"{lang_instr}\n\n"
        "Return ONLY a JSON object (no markdown, no prose around it):\n"
        "{\n"
        '  "language": "python",         // the chosen language\n'
        '  "code": "...",                 // one self-contained runnable snippet\n'
        '  "explanation": "..."          // 1-3 sentences explaining what the code does\n'
        "}"
    )
    user_prompt = f"Programming task: {task}"

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
        logger.warning("coder chat_completion raised: %s", e)
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
        logger.warning("coder JSON parse failed: %s", e)
        return {"error": f"parse failed: {e}", "raw": raw}

    return {
        "language": str(parsed.get("language", preference)),
        "code": str(parsed.get("code", "")),
        "explanation": str(parsed.get("explanation", "")),
    }
