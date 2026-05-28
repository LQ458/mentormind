import os
import sys


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from services.api_client import DeepSeekClient


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
