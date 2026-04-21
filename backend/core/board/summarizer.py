"""Post-lesson summarization of a board session."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from core.agents.subagents import extract_json
from core.board.state_manager import BoardStateManager
from services.api_client import DeepSeekClient, get_language_instruction

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "Pro/deepseek-ai/DeepSeek-V3"

_CONTENT_TRUNC = 300  # chars per element when building the compact digest
_MAX_NARRATIONS = 40   # cap narrations fed to the summarizer (and fallback)


def _build_digest(state: Dict[str, Any]) -> tuple[str, List[str]]:
    """Build a compact textual representation and also return raw narrations."""
    title = state.get("title", "")
    elements: Dict[str, Any] = state.get("elements", {})
    narration_queue = state.get("narration_queue", [])

    lines: List[str] = [f"Title: {title}"]
    if elements:
        lines.append("Elements:")
        for el in elements.values():
            el_type = el.get("element_type", "?")
            content = (el.get("content") or "").strip().replace("\n", " ")
            if len(content) > _CONTENT_TRUNC:
                content = content[:_CONTENT_TRUNC] + "..."
            lines.append(f"- [{el_type}] {content}")

    narrations: List[str] = []
    if narration_queue:
        lines.append("Narrations:")
        for seg in narration_queue[:_MAX_NARRATIONS]:
            text = (seg.get("text") or "").strip().replace("\n", " ")
            if not text:
                continue
            narrations.append(text)
            if len(text) > _CONTENT_TRUNC:
                text = text[:_CONTENT_TRUNC] + "..."
            lines.append(f"- {text}")

    return "\n".join(lines), narrations


async def summarize_session(
    state_manager: BoardStateManager, language: str = "zh"
) -> Dict[str, Any]:
    """Summarize a board session into a structured lesson recap.

    On success returns a dict like::

        {title, key_concepts, formulas, next_steps, summary_markdown}

    On failure returns ``{error, fallback_summary}`` where ``fallback_summary``
    is a joined excerpt of the first narrations captured in the session.
    """
    state = state_manager.get_state()
    if state is None:
        return {
            "error": "no board state available",
            "fallback_summary": "",
        }

    digest, narrations = _build_digest(state)
    fallback_summary = "\n".join(narrations[:10])

    lang_instr = get_language_instruction(language)
    system_prompt = (
        "You are a lesson-summary assistant for MentorMind.\n"
        "Given a compact description of what appeared on the board and the "
        "narrations spoken, produce a structured recap.\n"
        f"{lang_instr}\n\n"
        "Return ONLY a JSON object (no markdown, no prose around it):\n"
        "{\n"
        '  "title": "...",                          // short title of the lesson\n'
        '  "key_concepts": ["..."],                 // 3-6 core concepts covered\n'
        '  "formulas": ["..."],                     // important formulas (LaTeX ok; may be empty)\n'
        '  "next_steps": ["..."],                   // 2-4 suggested follow-up actions\n'
        '  "summary_markdown": "..."                // markdown recap, 3-6 short paragraphs\n'
        "}"
    )
    user_prompt = f"Board session digest:\n{digest}"

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
        logger.warning("summarize_session chat_completion raised: %s", e)
        return {"error": f"chat_completion raised: {e}", "fallback_summary": fallback_summary}

    if not getattr(response, "success", False):
        return {
            "error": getattr(response, "error", "unknown error"),
            "fallback_summary": fallback_summary,
        }

    raw = (
        response.data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    try:
        parsed = extract_json(raw)
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("summarize_session parse failed: %s", e)
        return {
            "error": f"parse failed: {e}",
            "fallback_summary": fallback_summary,
            "raw": raw,
        }

    return {
        "title": str(parsed.get("title", state.get("title", ""))),
        "key_concepts": list(parsed.get("key_concepts", [])),
        "formulas": list(parsed.get("formulas", [])),
        "next_steps": list(parsed.get("next_steps", [])),
        "summary_markdown": str(parsed.get("summary_markdown", "")),
    }
