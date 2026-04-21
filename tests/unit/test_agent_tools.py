"""Unit tests for backend/mcp/agent_tools.py — sub-agent runners are mocked."""
from __future__ import annotations

from typing import Any, Dict

import pytest

from mcp.agent_tools import AgentToolsServer


@pytest.fixture
def server() -> AgentToolsServer:
    return AgentToolsServer()


def test_tool_definitions_cover_four_agents() -> None:
    names = {t["function"]["name"] for t in AgentToolsServer.get_tool_definitions()}
    assert names == {"invoke_researcher", "invoke_coder", "invoke_writer", "invoke_critic"}


@pytest.mark.asyncio
async def test_valid_researcher_call_emits_start_then_result(
    server: AgentToolsServer, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_run(task: str, context: Dict[str, Any], language: str) -> Dict[str, Any]:
        assert task == "Explain entropy"
        assert context == {"context_hint": "thermodynamics"}
        assert language == "en"
        return {"facts": ["entropy increases"], "key_terms": ["entropy"]}

    server._runners["invoke_researcher"] = fake_run
    events = await server.handle_tool_call(
        "invoke_researcher",
        {"task": "Explain entropy", "context_hint": "thermodynamics"},
        "en",
    )
    assert [e.event_type for e in events] == ["agent_start", "agent_result"]
    assert events[0].data["agent"] == "researcher"
    assert events[0].data["task"].startswith("Explain entropy")
    assert events[1].data["result"]["key_terms"] == ["entropy"]


@pytest.mark.asyncio
async def test_runner_returning_error_dict_maps_to_agent_error(
    server: AgentToolsServer,
) -> None:
    async def failing_run(task: str, context: Dict[str, Any], language: str) -> Dict[str, Any]:
        return {"error": "upstream LLM failed"}

    server._runners["invoke_coder"] = failing_run
    events = await server.handle_tool_call(
        "invoke_coder", {"task": "write a loop"}, "en"
    )
    assert [e.event_type for e in events] == ["agent_start", "agent_error"]
    assert events[1].data["error"] == "upstream LLM failed"


@pytest.mark.asyncio
async def test_validation_failure_surfaces_via_safe_handler(
    server: AgentToolsServer,
) -> None:
    # writer requires 'concept'; omit it → validator rejects
    events = await server.handle_tool_call_safe(
        "invoke_writer", {"audience_level": "beginner"}, "en"
    )
    assert [e.event_type for e in events] == ["agent_error"]
    assert events[0].data["tool_name"] == "invoke_writer"
    assert events[0].data["agent"] == "writer"


@pytest.mark.asyncio
async def test_unknown_tool_name_safe_returns_error(server: AgentToolsServer) -> None:
    events = await server.handle_tool_call_safe("invoke_ghost", {}, "en")
    assert [e.event_type for e in events] == ["agent_error"]


@pytest.mark.asyncio
async def test_critic_argument_mapping(
    server: AgentToolsServer,
) -> None:
    received: Dict[str, Any] = {}

    async def fake_critic(task: str, context: Dict[str, Any], language: str) -> Dict[str, Any]:
        received["task"] = task
        received["context"] = context
        return {"pass": True, "issues": [], "suggestions": []}

    server._runners["invoke_critic"] = fake_critic
    await server.handle_tool_call(
        "invoke_critic",
        {"content": "Draft paragraph about X", "rubric": "clarity + accuracy"},
        "zh",
    )
    assert received["task"] == "Draft paragraph about X"
    assert received["context"] == {"rubric": "clarity + accuracy"}


@pytest.mark.asyncio
async def test_runner_raising_runtime_error_is_caught_by_safe(
    server: AgentToolsServer,
) -> None:
    async def boom(task: str, context: Dict[str, Any], language: str) -> Dict[str, Any]:
        raise RuntimeError("network down")

    server._runners["invoke_researcher"] = boom
    events = await server.handle_tool_call_safe(
        "invoke_researcher", {"task": "anything"}, "en"
    )
    assert events[-1].event_type == "agent_error"
    assert "network down" in events[-1].data["error"]
