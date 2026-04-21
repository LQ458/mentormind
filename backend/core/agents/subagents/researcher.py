"""Researcher sub-agent: produces concise factual background for a topic."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from core.agents.subagents import extract_json
from services.api_client import DeepSeekClient, get_language_instruction

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "Pro/deepseek-ai/DeepSeek-V3"


async def run(task: str, context: Dict[str, Any], language: str) -> Dict[str, Any]:
    """Produce research facts, key terms and source hints for the given task.

    Returns a dict shaped like ``{facts, key_terms, source_hints}`` on success
    or ``{error, raw?}`` on failure.
    """
    lang_instr = get_language_instruction(language)
    context_hint = ""
    if context:
        hint = context.get("context_hint") or context.get("hint")
        if hint:
            context_hint = f"\n\nContext hint from orchestrator: {hint}"

    system_prompt = (
        "You are a research sub-agent helping an educational presenter.\n"
        "Given the topic task, produce concise factual background.\n"
        f"{lang_instr}\n\n"
        "Return ONLY a JSON object with this exact shape (no markdown, no prose around it):\n"
        "{\n"
        '  "facts": ["..."],            // 3-6 concise factual statements\n'
        '  "key_terms": ["..."],         // 3-8 important terminology items\n'
        '  "source_hints": ["..."]       // general references (textbook chapters, topics to search)\n'
        "}"
    )
    user_prompt = f"Topic task: {task}{context_hint}"

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
        logger.warning("researcher chat_completion raised: %s", e)
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
        logger.warning("researcher JSON parse failed: %s", e)
        return {"error": f"parse failed: {e}", "raw": raw}

    return {
        "facts": list(parsed.get("facts", [])),
        "key_terms": list(parsed.get("key_terms", [])),
        "source_hints": list(parsed.get("source_hints", [])),
    }
