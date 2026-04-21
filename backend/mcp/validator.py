import json
import os
from pathlib import Path
from typing import Any

import jsonschema
from jsonschema import ValidationError


class ToolCallValidationError(Exception):
    """Raised when a tool call fails JSON Schema validation."""

    def __init__(self, tool_name: str, errors: list[str]) -> None:
        self.tool_name = tool_name
        self.errors = errors
        super().__init__(f"Validation failed for tool '{tool_name}': {'; '.join(errors)}")


class ToolCallValidator:
    """Validates MCP tool call arguments against JSON Schemas."""

    SCHEMA_MAP = {
        "board_create": "board_create.json",
        "board_add_element": "board_add_element.json",
        "board_update_element": "board_update_element.json",
        "board_clear": "board_clear.json",
        "board_set_layout": "board_set_layout.json",
        "narrate": "narrate.json",
        "invoke_researcher": "invoke_researcher.json",
        "invoke_coder": "invoke_coder.json",
        "invoke_writer": "invoke_writer.json",
        "invoke_critic": "invoke_critic.json",
    }

    def __init__(self) -> None:
        schemas_dir = Path(__file__).parent / "schemas"
        self._schemas: dict[str, Any] = {}
        for tool_name, filename in self.SCHEMA_MAP.items():
            schema_path = schemas_dir / filename
            with open(schema_path, "r", encoding="utf-8") as f:
                self._schemas[tool_name] = json.load(f)

    def validate(self, tool_name: str, arguments: dict) -> None:
        """Validate arguments against the schema for the given tool name.

        Raises:
            ToolCallValidationError: if validation fails or tool_name is unknown.
        """
        if tool_name not in self._schemas:
            raise ToolCallValidationError(tool_name, [f"Unknown tool: '{tool_name}'"])

        schema = self._schemas[tool_name]
        validator = jsonschema.Draft7Validator(schema)
        validation_errors = sorted(validator.iter_errors(arguments), key=lambda e: list(e.path))

        if validation_errors:
            errors = [e.message for e in validation_errors]
            raise ToolCallValidationError(tool_name, errors)


default_validator = ToolCallValidator()
