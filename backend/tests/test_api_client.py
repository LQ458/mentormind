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


def test_deepseek_thinking_requires_explicit_force(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_THINKING", "force_enabled")
    assert DeepSeekClient()._thinking_payload() == {"type": "enabled"}
