from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any, AsyncGenerator, Dict, List, Optional

from core.board.models import BoardEvent
from core.board.state_manager import BoardStateManager
from mcp.agent_tools import AgentToolsServer
from mcp.board_server import BoardMCPServer
from services.api_client import DeepSeekClient, StreamChunk, get_language_instruction
from prompts.loader import render_prompt

logger = logging.getLogger(__name__)


# Tool names dispatched to the AgentToolsServer instead of the board server.
AGENT_TOOL_NAMES = {
    "invoke_researcher",
    "invoke_coder",
    "invoke_writer",
    "invoke_critic",
}


def _repair_tool_arguments(raw: str) -> Optional[Dict[str, Any]]:
    """Best-effort recovery of malformed tool-call JSON from streaming LLM output.

    Handles: trailing commas, truncated closing brackets, unescaped control
    characters inside string values. Returns None if repair cannot produce
    valid JSON.
    """
    if not raw or not raw.strip():
        return None

    candidate = raw.strip()

    # Strip markdown code fences that some models wrap arguments in
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*", "", candidate)
        candidate = re.sub(r"\s*```$", "", candidate)

    # Remove trailing commas before } or ]
    cleaned = re.sub(r",(\s*[}\]])", r"\1", candidate)

    # Repair stray `[` inserted before a quoted key inside an object, e.g.
    # `{"headers": [...], ["rows": [...]}` — observed in LLM tool calls.
    cleaned = re.sub(r"([{,]\s*)\[\s*(\"[^\"]+\"\s*:)", r"\1\2", cleaned)

    # Balance brackets if the stream was truncated mid-object
    open_braces = cleaned.count("{") - cleaned.count("}")
    open_brackets = cleaned.count("[") - cleaned.count("]")
    if open_brackets > 0:
        cleaned += "]" * open_brackets
    if open_braces > 0:
        cleaned += "}" * open_braces

    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    # Last resort: escape stray control chars (literal \n, \t) inside strings
    try:
        escaped = re.sub(
            r"([\x00-\x1f])",
            lambda m: f"\\u{ord(m.group(1)):04x}",
            cleaned,
        )
        parsed = json.loads(escaped)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


class StreamingLessonGenerator:
    """Orchestrates LLM streaming with board tool calls to generate lessons.

    Flow:
        1. Render the board system prompt with topic/language/level
        2. Stream LLM response with board + agent tool definitions
        3. For each complete tool call, dispatch through the appropriate server
        4. Yield resulting BoardEvents to the caller
        5. Send tool results back to LLM and continue the conversation
    """

    def __init__(
        self,
        llm_client: Optional[DeepSeekClient] = None,
        board_server: Optional[BoardMCPServer] = None,
        agent_tools_server: Optional[AgentToolsServer] = None,
        model: str = "Pro/zai-org/GLM-5.1",
        follow_up_timeout_s: float = 60.0,
    ) -> None:
        self.llm_client = llm_client or DeepSeekClient()
        self.board_server = board_server or BoardMCPServer()
        self.agent_tools_server = agent_tools_server
        self.model = model
        self.follow_up_timeout_s = follow_up_timeout_s
        self.user_message_queue: "asyncio.Queue[str]" = asyncio.Queue()

    def enqueue_user_message(self, text: str) -> None:
        """Push a mid-lesson student message into the orchestrator conversation.

        The message is injected as a ``role: user`` turn at the start of the
        next LLM round, so the orchestrator can acknowledge and answer before
        resuming the planned lesson flow.
        """
        if not text or not text.strip():
            return
        self.user_message_queue.put_nowait(text.strip())

    async def generate_lesson(
        self,
        topic: str,
        language: str = "zh",
        student_level: str = "beginner",
        duration_minutes: int = 10,
        custom_requirements: Optional[str] = None,
    ) -> AsyncGenerator[BoardEvent, None]:
        """Stream board events for a lesson on the given topic."""

        req_section = ""
        if custom_requirements:
            req_section = f"\n## Additional Requirements\n\n{custom_requirements}\n"

        system_prompt = render_prompt(
            "board/board_lesson",
            topic=topic,
            student_level=student_level,
            language_instruction=get_language_instruction(language),
            duration_minutes=str(duration_minutes),
            custom_requirements_section=req_section,
        )

        user_content = f"Please teach a lesson on: {topic}"
        if custom_requirements:
            user_content += f"\n\nAdditional requirements: {custom_requirements}"

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        tools = list(BoardMCPServer.get_tool_definitions())
        if self.agent_tools_server is not None:
            tools = tools + list(AgentToolsServer.get_tool_definitions())

        max_rounds = 50  # safety limit on conversation turns

        for _round in range(max_rounds):
            # Drain any student questions that arrived between rounds and
            # inject them as user turns so the orchestrator sees them before
            # producing the next round of tool calls.
            while not self.user_message_queue.empty():
                try:
                    pending = self.user_message_queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
                messages.append(
                    {"role": "user", "content": f"[Student question] {pending}"}
                )

            tool_calls_in_round: List[Dict[str, Any]] = []
            follow_up_injected = False

            async for chunk in self.llm_client.chat_completion_stream(
                messages=messages,
                tools=tools,
                model=self.model,
                temperature=0.7,
                max_tokens=4000,
            ):
                if chunk.chunk_type == "tool_call_complete":
                    try:
                        arguments = json.loads(chunk.tool_arguments)
                    except json.JSONDecodeError as err:
                        arguments = _repair_tool_arguments(chunk.tool_arguments)
                        if arguments is None:
                            logger.warning(
                                "Invalid JSON in tool arguments for %s (%s): %s",
                                chunk.tool_name,
                                err,
                                chunk.tool_arguments[:400],
                            )
                            event = BoardEvent(
                                event_type="error",
                                timestamp=time.time(),
                                data={
                                    "error": "Invalid tool call JSON",
                                    "tool_name": chunk.tool_name,
                                    "raw_preview": chunk.tool_arguments[:200],
                                },
                            )
                            yield event
                            continue
                        logger.info(
                            "Recovered malformed tool arguments for %s via repair",
                            chunk.tool_name,
                        )

                    is_agent_tool = (
                        chunk.tool_name in AGENT_TOOL_NAMES
                        and self.agent_tools_server is not None
                    )

                    if is_agent_tool:
                        agent_events = await self.agent_tools_server.handle_tool_call_safe(
                            chunk.tool_name, arguments, language
                        )
                        final_event: Optional[BoardEvent] = None
                        for ev in agent_events:
                            yield ev
                            final_event = ev
                        # Send the final (result or error) event back to the LLM
                        result_payload: Dict[str, Any] = (
                            final_event.to_dict() if final_event else {}
                        )
                        tool_calls_in_round.append(
                            {
                                "id": chunk.tool_call_id,
                                "name": chunk.tool_name,
                                "arguments": arguments,
                                "result": result_payload,
                            }
                        )
                    else:
                        event = self.board_server.handle_tool_call_safe(
                            chunk.tool_name, arguments
                        )
                        yield event

                        tool_calls_in_round.append(
                            {
                                "id": chunk.tool_call_id,
                                "name": chunk.tool_name,
                                "arguments": arguments,
                                "result": event.to_dict(),
                            }
                        )

                elif chunk.chunk_type == "error":
                    logger.error(f"LLM stream error: {chunk.content}")
                    yield BoardEvent(
                        event_type="error",
                        timestamp=time.time(),
                        data={"error": chunk.content},
                    )
                    return

                elif chunk.chunk_type == "done":
                    if not tool_calls_in_round:
                        # LLM finished without tool calls. Give the student a
                        # window to ask a follow-up before we terminate the
                        # session; if one arrives, continue the conversation.
                        if await self._wait_for_follow_up(messages):
                            follow_up_injected = True
                            break  # exit the inner async-for, re-enter the round loop
                        return

            if follow_up_injected:
                # A student question was appended; skip tool-call bookkeeping
                # and go straight to the next round so the LLM sees it.
                continue

            if not tool_calls_in_round:
                # Reached here if the stream didn't emit an explicit done chunk
                # but produced no tool calls. Same follow-up window.
                if await self._wait_for_follow_up(messages):
                    continue
                return

            # Build the assistant message with tool_calls and append tool results
            assistant_tool_calls = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["arguments"]),
                    },
                }
                for tc in tool_calls_in_round
            ]
            messages.append({
                "role": "assistant",
                "tool_calls": assistant_tool_calls,
            })

            for tc in tool_calls_in_round:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(tc["result"]),
                })

        logger.warning("Streaming lesson hit max rounds limit")

    async def _wait_for_follow_up(self, messages: List[Dict[str, Any]]) -> bool:
        """Wait up to ``follow_up_timeout_s`` for a student question.

        Returns True if one arrived and was appended to ``messages``; False if
        the timeout elapsed with no interaction (caller should terminate).
        """
        try:
            text = await asyncio.wait_for(
                self.user_message_queue.get(), timeout=self.follow_up_timeout_s
            )
        except asyncio.TimeoutError:
            return False
        messages.append({"role": "user", "content": f"[Student question] {text}"})
        return True
