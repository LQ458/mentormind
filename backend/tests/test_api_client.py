import os
import sys


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from services.api_client import DeepSeekClient
from services.api_client import APIClient


def test_deepseek_thinking_mode_is_model_based():
    client = DeepSeekClient()

    assert client._thinking_payload("deepseek-v4-flash") == {"type": "disabled"}
    assert client._thinking_payload("deepseek-v4-pro") == {"type": "enabled"}


def test_deepseek_model_selection_uses_flash_for_simple_and_pro_for_complex():
    client = DeepSeekClient()

    assert client._select_model("deepseek-v4-flash", 4000) == "deepseek-v4-flash"
    assert client._select_model("deepseek-v4-pro", 200) == "deepseek-v4-pro"
    assert client._select_model("deepseek-reasoner", 4000) == "deepseek-v4-pro"
    assert client._select_model("deepseek-r1", 200) == "deepseek-v4-flash"
    assert client._select_model("deepseek-v4-pro-thinking", 4000) == "deepseek-v4-pro"


def test_deepseek_model_selection_ignores_model_env(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_FLASH_MODEL", "deepseek-reasoner")
    monkeypatch.setenv("DEEPSEEK_PRO_MODEL", "deepseek-v4-pro-thinking")
    client = DeepSeekClient()

    assert client._select_model(None, 200) == "deepseek-v4-flash"
    assert client._select_model(None, 4000) == "deepseek-v4-pro"


def test_study_plan_chat_uses_flash_for_plan_review(monkeypatch):
    api = APIClient()
    captured = {}

    async def fake_chat_completion(**kwargs):
        captured.update(kwargs)
        return None

    monkeypatch.setattr(api.deepseek, "chat_completion", fake_chat_completion)

    import asyncio

    asyncio.run(
        api.study_plan_chat_completion(
            messages=[{"role": "user", "content": "generate plan"}],
            phase="plan_review",
            max_tokens=1200,
        )
    )

    assert captured["model"] == "deepseek-v4-flash"


def test_deepseek_messages_drop_provider_thinking_fields():
    client = DeepSeekClient()

    messages = client._sanitize_messages(
        [
            {
                "role": "assistant",
                "content": "ok",
                "reasoning_content": "hidden chain",
                "reasoning": "hidden",
                "thinking": {"type": "enabled"},
            }
        ]
    )

    assert messages == [{"role": "assistant", "content": "ok"}]


def test_deepseek_tool_messages_preserve_reasoning_content_for_provider_compat():
    client = DeepSeekClient()

    messages = client._sanitize_messages(
        [
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "board_create", "arguments": "{}"},
                    }
                ],
                "reasoning_content": "hidden chain",
            }
        ]
    )

    assert messages[0]["reasoning_content"] == "hidden chain"


def test_deepseek_stream_routes_tool_calls_to_flash(monkeypatch):
    client = DeepSeekClient()
    captured = {}

    class FakeResponse:
        status = 400

        async def text(self):
            return "{}"

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    class FakeSession:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        def post(self, *args, **kwargs):
            captured.update(kwargs.get("json") or {})
            return FakeResponse()

    monkeypatch.setenv("DEEPSEEK_API_KEY", "test")
    client.api_key = "test"
    client.headers["Authorization"] = "Bearer test"
    monkeypatch.setattr("services.api_client.aiohttp.ClientSession", FakeSession)

    async def collect():
        chunks = []
        async for chunk in client.chat_completion_stream(
            messages=[{"role": "user", "content": "hi"}],
            tools=[{"type": "function", "function": {"name": "noop", "parameters": {"type": "object"}}}],
            model="deepseek-v4-pro",
            max_tokens=4000,
        ):
            chunks.append(chunk)
        return chunks

    import asyncio

    asyncio.run(collect())

    assert captured["model"] == "deepseek-v4-flash"
    assert captured["thinking"] == {"type": "disabled"}
