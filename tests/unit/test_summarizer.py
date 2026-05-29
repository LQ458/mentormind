"""Unit tests for backend/core/board/summarizer.py — LLM calls are mocked."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

import pytest

from core.board import summarizer as summarizer_mod
from core.board.state_manager import BoardStateManager


@dataclass
class _FakeResponse:
    success: bool
    data: Dict[str, Any]
    error: str = ""


def _mk_populated_manager() -> BoardStateManager:
    mgr = BoardStateManager()
    mgr.create_board(title="Calculus 101", layout="full_canvas")
    mgr.add_element(element_type="title", content="Derivatives")
    mgr.add_element(element_type="equation", content="f'(x) = 2x", narration="slope")
    mgr.add_narration(text="Welcome to the lesson.")
    mgr.add_narration(text="A derivative measures slope.")
    return mgr


@pytest.mark.asyncio
async def test_no_state_returns_error_without_calling_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    called = {"n": 0}

    class _FakeClient:
        async def chat_completion(self, **kw: Any) -> _FakeResponse:
            called["n"] += 1
            return _FakeResponse(success=True, data={})

    monkeypatch.setattr(summarizer_mod, "DeepSeekClient", _FakeClient)
    mgr = BoardStateManager()  # never created
    result = await summarizer_mod.summarize_session(mgr, language="en")
    assert result["error"] == "no board state available"
    assert called["n"] == 0


@pytest.mark.asyncio
async def test_successful_summary_returns_structured_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FakeClient:
        async def chat_completion(self, **kw: Any) -> _FakeResponse:
            content = (
                '{"title": "Derivatives 101",'
                ' "key_concepts": ["slope", "limit"],'
                ' "formulas": ["f\'(x)=2x"],'
                ' "next_steps": ["practice"],'
                ' "summary_markdown": "# Recap\\n..."}'
            )
            return _FakeResponse(
                success=True,
                data={"choices": [{"message": {"content": content}}]},
            )

    monkeypatch.setattr(summarizer_mod, "DeepSeekClient", _FakeClient)
    result = await summarizer_mod.summarize_session(_mk_populated_manager(), language="zh")
    assert result["title"] == "Derivatives 101"
    assert result["key_concepts"] == ["slope", "limit"]
    assert result["formulas"] == ["f'(x)=2x"]
    assert "Recap" in result["summary_markdown"]


@pytest.mark.asyncio
async def test_llm_failure_falls_back_to_narration_excerpt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FailingClient:
        async def chat_completion(self, **kw: Any) -> _FakeResponse:
            return _FakeResponse(success=False, data={}, error="timeout")

    monkeypatch.setattr(summarizer_mod, "DeepSeekClient", _FailingClient)
    result = await summarizer_mod.summarize_session(_mk_populated_manager(), language="zh")
    assert result["error"] == "timeout"
    assert "derivative" in result["fallback_summary"].lower()


@pytest.mark.asyncio
async def test_parse_failure_returns_raw_for_debugging(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _JunkClient:
        async def chat_completion(self, **kw: Any) -> _FakeResponse:
            return _FakeResponse(
                success=True,
                data={"choices": [{"message": {"content": "not json at all"}}]},
            )

    monkeypatch.setattr(summarizer_mod, "DeepSeekClient", _JunkClient)
    result = await summarizer_mod.summarize_session(_mk_populated_manager(), language="en")
    assert "parse failed" in result["error"]
    assert result["raw"] == "not json at all"
    assert "fallback_summary" in result
