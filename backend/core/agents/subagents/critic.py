"""Critic sub-agent: evaluates draft content against a rubric."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from core.agents.subagents import extract_json
from services.api_client import DeepSeekClient, get_language_instruction

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "Pro/deepseek-ai/DeepSeek-V3"


async def run(task: str, context: Dict[str, Any], language: str) -> Dict[str, Any]:
    """Review content against a rubric.

    ``task`` is the content to review. ``context`` must include ``rubric``.
    Returns ``{"pass": bool, "issues": [...], "suggestions": [...]}`` on
    success or ``{error, raw?}`` on failure.
    """
    lang_instr = get_language_instruction(language)
    rubric = (context or {}).get("rubric", "")

    system_prompt = (
        "You are a critic sub-agent.\n"
        "Evaluate the supplied content against the rubric honestly and concisely.\n"
        f"{lang_instr}\n\n"
        "Return ONLY a JSON object (no markdown, no prose around it):\n"
        "{\n"
        '  "pass": true,                  // boolean: does content meet rubric?\n'
        '  "issues": ["..."],             // concrete problems found (possibly empty)\n'
        '  "suggestions": ["..."]         // specific improvements (possibly empty)\n'
        "}"
    )
    user_prompt = f"Rubric:\n{rubric}\n\nContent to evaluate:\n{task}"

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
        logger.warning("critic chat_completion raised: %s", e)
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
        logger.warning("critic JSON parse failed: %s", e)
        return {"error": f"parse failed: {e}", "raw": raw}

    return {
        "pass": bool(parsed.get("pass", False)),
        "issues": list(parsed.get("issues", [])),
        "suggestions": list(parsed.get("suggestions", [])),
    }
