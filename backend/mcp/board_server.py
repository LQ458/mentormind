from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from core.board.models import BoardEvent
from core.board.state_manager import BoardStateManager
from mcp.validator import ToolCallValidationError, ToolCallValidator, default_validator

logger = logging.getLogger(__name__)


class BoardMCPServer:
    """In-process MCP-style tool dispatcher for board operations.

    Validates incoming tool calls against JSON Schemas, dispatches them to
    the BoardStateManager, and returns BoardEvent results.
    """

    TOOL_DEFINITIONS: List[Dict[str, Any]] = [
        {
            "type": "function",
            "function": {
                "name": "board_create",
                "description": "Create a new board with a title, layout, and background style.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "maxLength": 100},
                        "layout": {"type": "string", "enum": ["full_canvas", "split_left_right", "split_top_bottom", "focus_center"]},
                        "background": {"type": "string", "enum": ["dark_board", "light_board", "grid", "plain"], "default": "dark_board"},
                        "topic": {"type": "string"},
                    },
                    "required": ["title", "layout"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "board_add_element",
                "description": "Add a typed visual element to the board with optional narration.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "element_type": {"type": "string", "enum": ["title", "text_block", "equation", "graph", "shape", "transform", "code_block", "image", "definition_box", "theorem_box", "step_list", "arrow", "highlight", "table"]},
                        "content": {"type": "string", "maxLength": 2000},
                        "position": {
                            "type": "object",
                            "properties": {
                                "region": {"type": "string", "enum": ["center", "top", "bottom", "left", "right", "top_left", "top_right", "bottom_left", "bottom_right"]},
                                "offset_x": {"type": "number", "minimum": -1, "maximum": 1},
                                "offset_y": {"type": "number", "minimum": -1, "maximum": 1},
                            },
                            "required": ["region"],
                        },
                        "style": {
                            "type": "object",
                            "properties": {
                                "color": {"type": "string", "enum": ["accent", "heading", "text", "green", "mauve", "yellow", "red"]},
                                "size": {"type": "string", "enum": ["small", "medium", "large", "xlarge"]},
                                "animation": {"type": "string", "enum": ["fade_in", "write", "grow", "slide_in", "none"]},
                            },
                        },
                        "narration": {"type": "string", "maxLength": 500},
                        "metadata": {"type": "object"},
                    },
                    "required": ["element_type", "content"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "board_update_element",
                "description": "Modify, highlight, or remove an existing element on the board.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "element_id": {"type": "string"},
                        "action": {"type": "string", "enum": ["highlight", "dim", "update_content", "move", "animate_transform", "remove"]},
                        "new_content": {"type": "string", "maxLength": 2000},
                        "narration": {"type": "string", "maxLength": 500},
                    },
                    "required": ["element_id", "action"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "board_clear",
                "description": "Clear the board entirely, a specific region, or everything except the title.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "scope": {"type": "string", "enum": ["all", "region", "except_title"]},
                        "region": {"type": "string", "enum": ["center", "top", "bottom", "left", "right"]},
                        "animation": {"type": "string", "enum": ["fade_out", "slide_out", "instant"]},
                        "narration": {"type": "string", "maxLength": 500},
                    },
                    "required": ["scope"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "board_set_layout",
                "description": "Change the board layout with an optional transition animation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "layout": {"type": "string", "enum": ["full_canvas", "split_left_right", "split_top_bottom", "focus_center"]},
                        "transition": {"type": "string", "enum": ["smooth", "instant"]},
                    },
                    "required": ["layout"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "narrate",
                "description": "Add spoken narration without a visual element, for transitions or emphasis.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string", "maxLength": 500},
                        "pause_after_ms": {"type": "integer", "minimum": 0, "maximum": 5000},
                    },
                    "required": ["text"],
                    "additionalProperties": False,
                },
            },
        },
    ]

    def __init__(
        self,
        state_manager: Optional[BoardStateManager] = None,
        validator: Optional[ToolCallValidator] = None,
    ) -> None:
        self.state_manager = state_manager or BoardStateManager()
        self.validator = validator or default_validator
        self._dispatch_map = {
            "board_create": self._handle_create,
            "board_add_element": self._handle_add_element,
            "board_update_element": self._handle_update_element,
            "board_clear": self._handle_clear,
            "board_set_layout": self._handle_set_layout,
            "narrate": self._handle_narrate,
        }

    def handle_tool_call(self, name: str, arguments: Dict[str, Any]) -> BoardEvent:
        """Validate and dispatch a tool call, returning the resulting BoardEvent."""
        self.validator.validate(name, arguments)

        handler = self._dispatch_map.get(name)
        if handler is None:
            raise ToolCallValidationError(name, [f"Unknown tool: '{name}'"])

        return handler(arguments)

    def handle_tool_call_safe(self, name: str, arguments: Dict[str, Any]) -> BoardEvent:
        """Like handle_tool_call but catches errors and returns error events."""
        try:
            return self.handle_tool_call(name, arguments)
        except (ToolCallValidationError, ValueError, KeyError, RuntimeError) as e:
            logger.warning(f"Tool call '{name}' failed: {e}")
            import time
            return BoardEvent(
                event_type="error",
                timestamp=time.time(),
                data={"tool_name": name, "error": str(e), "arguments": arguments},
            )

    @classmethod
    def get_tool_definitions(cls) -> List[Dict[str, Any]]:
        """Return OpenAI-compatible tool definitions for LLM API calls."""
        return cls.TOOL_DEFINITIONS

    def _handle_create(self, args: Dict[str, Any]) -> BoardEvent:
        return self.state_manager.create_board(
            title=args["title"],
            layout=args["layout"],
            background=args.get("background", "dark_board"),
            topic=args.get("topic", ""),
        )

    def _handle_add_element(self, args: Dict[str, Any]) -> BoardEvent:
        return self.state_manager.add_element(
            element_type=args["element_type"],
            content=args["content"],
            position=args.get("position"),
            style=args.get("style"),
            narration=args.get("narration"),
            metadata=args.get("metadata"),
        )

    def _handle_update_element(self, args: Dict[str, Any]) -> BoardEvent:
        return self.state_manager.update_element(
            element_id=args["element_id"],
            action=args["action"],
            new_content=args.get("new_content"),
            narration=args.get("narration"),
        )

    def _handle_clear(self, args: Dict[str, Any]) -> BoardEvent:
        return self.state_manager.clear(
            scope=args["scope"],
            region=args.get("region"),
            animation=args.get("animation", "fade_out"),
            narration=args.get("narration"),
        )

    def _handle_set_layout(self, args: Dict[str, Any]) -> BoardEvent:
        return self.state_manager.set_layout(
            layout=args["layout"],
            transition=args.get("transition", "smooth"),
        )

    def _handle_narrate(self, args: Dict[str, Any]) -> BoardEvent:
        return self.state_manager.add_narration(
            text=args["text"],
            pause_after_ms=args.get("pause_after_ms", 500),
        )
