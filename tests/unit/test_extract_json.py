"""Unit tests for backend/core/agents/subagents/__init__.py::extract_json."""
from __future__ import annotations

import json

import pytest

from core.agents.subagents import extract_json


def test_plain_json_object() -> None:
    assert extract_json('{"a": 1, "b": "x"}') == {"a": 1, "b": "x"}


def test_strips_markdown_json_fence() -> None:
    raw = '```json\n{"k": "v"}\n```'
    assert extract_json(raw) == {"k": "v"}


def test_strips_bare_fence_without_language_tag() -> None:
    raw = '```\n{"k": 2}\n```'
    assert extract_json(raw) == {"k": 2}


def test_extracts_object_embedded_in_prose() -> None:
    raw = 'Sure, here you go: {"ok": true, "n": 3} — hope that helps!'
    assert extract_json(raw) == {"ok": True, "n": 3}


def test_raises_on_non_json_text() -> None:
    with pytest.raises(json.JSONDecodeError):
        extract_json("no json here")


def test_handles_empty_string() -> None:
    with pytest.raises(json.JSONDecodeError):
        extract_json("")


def test_preserves_nested_structures() -> None:
    raw = '```json\n{"list": [1, 2, {"deep": true}]}\n```'
    assert extract_json(raw) == {"list": [1, 2, {"deep": True}]}
