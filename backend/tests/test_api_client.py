import os
import sys


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from services.api_client import DeepSeekClient


def test_deepseek_thinking_is_omitted_by_default(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_THINKING", raising=False)
    assert DeepSeekClient()._thinking_payload() is None


def test_deepseek_thinking_disabled_is_omitted(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_THINKING", "disabled")
    assert DeepSeekClient()._thinking_payload() is None


def test_deepseek_thinking_enabled_is_not_accidentally_sent(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_THINKING", "enabled")
    assert DeepSeekClient()._thinking_payload() is None


def test_deepseek_thinking_force_is_still_omitted(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_THINKING", "force_enabled")
    assert DeepSeekClient()._thinking_payload() is None


def test_deepseek_model_selection_only_allows_v4_flash_or_pro(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_FLASH_MODEL", raising=False)
    monkeypatch.delenv("DEEPSEEK_PRO_MODEL", raising=False)
    client = DeepSeekClient()

    assert client._select_model("deepseek-v4-flash", 4000) == "deepseek-v4-flash"
    assert client._select_model("deepseek-v4-pro", 200) == "deepseek-v4-pro"
    assert client._select_model("deepseek-reasoner", 4000) == "deepseek-v4-pro"
    assert client._select_model("deepseek-r1", 200) == "deepseek-v4-flash"
    assert client._select_model("deepseek-v4-pro-thinking", 4000) == "deepseek-v4-pro"


def test_deepseek_model_env_rejects_non_approved_models(monkeypatch):
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
