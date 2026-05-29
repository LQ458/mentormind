"""Agent-tools MCP server: exposes specialist sub-agents as tool calls.

Mirrors :class:`mcp.board_server.BoardMCPServer` but dispatches tool calls to
async sub-agents (researcher, coder, writer, critic) and returns a list of
:class:`core.board.models.BoardEvent` objects (``agent_start``,
``agent_result`` or ``agent_error``) so the orchestrator can stream progress.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional

from core.agents.subagents import coder, critic, researcher, writer
from core.board.models import BoardEvent
from mcp.validator import ToolCallValidationError, ToolCallValidator, default_validator

logger = logging.getLogger(__name__)


# Type alias for sub-agent run functions
SubAgentRunner = Callable[[str, Dict[str, Any], str], Awaitable[Dict[str, Any]]]


class AgentToolsServer:
    """In-process MCP-style tool dispatcher for specialist sub-agents."""

    TOOL_DEFINITIONS: List[Dict[str, Any]] = [
        {
            "type": "function",
            "function": {
                "name": "invoke_researcher",
                "description": (
                    "Invoke the researcher sub-agent to gather factual background, "
                    "definitions, and key terms before teaching a concept. Returns "
                    "facts, key_terms, and source_hints."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task": {"type": "string", "maxLength": 500},
                        "context_hint": {"type": "string", "maxLength": 500},
                    },
                    "required": ["task"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "invoke_coder",
                "description": (
                    "Invoke the coder sub-agent to produce a runnable code snippet "
                    "for a programming task. Returns language, code, and a short "
                    "explanation."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task": {"type": "string", "maxLength": 500},
                        "language_preference": {
                            "type": "string",
                            "enum": [
                                "python",
                                "javascript",
                                "typescript",
                                "java",
                                "c++",
                                "other",
                            ],
                        },
                    },
                    "required": ["task"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "invoke_writer",
                "description": (
                    "Invoke the writer sub-agent to draft polished explanatory prose "
                    "for a concept at a target audience level."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "concept": {"type": "string", "maxLength": 200},
                        "audience_level": {
                            "type": "string",
                            "enum": ["beginner", "intermediate", "advanced"],
                            "default": "intermediate",
                        },
                        "target_length": {
                            "type": "integer",
                            "minimum": 20,
                            "maximum": 300,
                            "default": 100,
                        },
                    },
                    "required": ["concept"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "invoke_critic",
                "description": (
                    "Invoke the critic sub-agent to evaluate draft content against a "
                    "rubric. Returns pass/fail plus issues and suggestions."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {"type": "string", "maxLength": 2000},
                        "rubric": {"type": "string", "maxLength": 500},
                    },
                    "required": ["content", "rubric"],
                    "additionalProperties": False,
                },
            },
        },
    ]

    # Map tool name -> (role label, runner, kwargs-to-task-context adapter)
    _AGENT_MAP: Dict[str, str] = {
        "invoke_researcher": "researcher",
        "invoke_coder": "coder",
        "invoke_writer": "writer",
        "invoke_critic": "critic",
    }

    def __init__(self, validator: Optional[ToolCallValidator] = None) -> None:
        self.validator = validator or default_validator
        self._runners: Dict[str, SubAgentRunner] = {
            "invoke_researcher": researcher.run,
            "invoke_coder": coder.run,
            "invoke_writer": writer.run,
            "invoke_critic": critic.run,
        }

    @classmethod
    def get_tool_definitions(cls) -> List[Dict[str, Any]]:
        """Return OpenAI-compatible tool definitions for LLM API calls."""
        return cls.TOOL_DEFINITIONS

    @staticmethod
    def _extract_task_and_context(
        name: str, arguments: Dict[str, Any]
    ) -> tuple[str, Dict[str, Any], str]:
        """Normalize tool arguments to ``(task, context, task_summary)``."""
        if name == "invoke_researcher":
            task = arguments.get("task", "")
            context = {"context_hint": arguments.get("context_hint")}
        elif name == "invoke_coder":
            task = arguments.get("task", "")
            context = {"language_preference": arguments.get("language_preference")}
        elif name == "invoke_writer":
            task = arguments.get("concept", "")
            context = {
                "audience_level": arguments.get("audience_level", "intermediate"),
                "target_length": arguments.get("target_length", 100),
            }
        elif name == "invoke_critic":
            task = arguments.get("content", "")
            context = {"rubric": arguments.get("rubric", "")}
        else:
            raise ToolCallValidationError(name, [f"Unknown tool: '{name}'"])

        task_summary = (task or "")[:120]
        return task, context, task_summary

    async def handle_tool_call(
        self, name: str, arguments: Dict[str, Any], language: str
    ) -> List[BoardEvent]:
        """Validate and dispatch a tool call, returning agent events.

        Emits an ``agent_start`` event, awaits the sub-agent, then emits
        either an ``agent_result`` or ``agent_error`` event.
        """
        self.validator.validate(name, arguments)

        role = self._AGENT_MAP.get(name)
        runner = self._runners.get(name)
        if not role or runner is None:
            raise ToolCallValidationError(name, [f"Unknown tool: '{name}'"])

        task, context, task_summary = self._extract_task_and_context(name, arguments)

        events: List[BoardEvent] = [
            BoardEvent(
                event_type="agent_start",
                timestamp=time.time(),
                data={"agent": role, "task": task_summary},
            )
        ]

        result = await runner(task, context, language)

        if isinstance(result, dict) and "error" in result and len(result) <= 2:
            events.append(
                BoardEvent(
                    event_type="agent_error",
                    timestamp=time.time(),
                    data={"agent": role, "error": result.get("error", "unknown error")},
                )
            )
        else:
            events.append(
                BoardEvent(
                    event_type="agent_result",
                    timestamp=time.time(),
                    data={"agent": role, "result": result},
                )
            )
        return events

    async def handle_tool_call_safe(
        self, name: str, arguments: Dict[str, Any], language: str
    ) -> List[BoardEvent]:
        """Like :meth:`handle_tool_call` but converts exceptions into events."""
        try:
            return await self.handle_tool_call(name, arguments, language)
        except (ToolCallValidationError, ValueError, KeyError, RuntimeError) as e:
            logger.warning("Agent tool call '%s' failed: %s", name, e)
            role = self._AGENT_MAP.get(name, "unknown")
            now = time.time()
            return [
                BoardEvent(
                    event_type="agent_error",
                    timestamp=now,
                    data={
                        "agent": role,
                        "tool_name": name,
                        "error": str(e),
                        "arguments": arguments,
                    },
                )
            ]
