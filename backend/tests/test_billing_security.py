import os
import sys

import pytest
from fastapi import HTTPException


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import server


def test_checkout_plan_rejects_unknown_plan():
    with pytest.raises(HTTPException) as exc_info:
        server._validate_checkout_plan("vip")

    assert exc_info.value.status_code == 400


def test_checkout_plan_normalizes_allowed_plan():
    assert server._validate_checkout_plan(" Pro ") == "pro"


def test_checkout_return_url_allows_configured_app_origin(monkeypatch):
    monkeypatch.setenv("PUBLIC_APP_URL", "https://mentormind.cloud")
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    url = "https://mentormind.cloud/settings?checkout=success"

    assert server._validate_checkout_return_url(url, "success_url") == url


def test_checkout_return_url_rejects_untrusted_origin(monkeypatch):
    monkeypatch.setenv("PUBLIC_APP_URL", "https://mentormind.cloud")
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    with pytest.raises(HTTPException) as exc_info:
        server._validate_checkout_return_url("https://evil.example/settings", "success_url")

    assert exc_info.value.status_code == 400


def test_checkout_return_url_rejects_relative_url():
    with pytest.raises(HTTPException) as exc_info:
        server._validate_checkout_return_url("/settings?checkout=success", "success_url")

    assert exc_info.value.status_code == 400


def test_append_checkout_query_preserves_existing_query():
    url = "https://mentormind.cloud/settings?checkout=success"

    result = server._append_checkout_query(url, {"plan": "pro", "stub": "true"})

    assert result == "https://mentormind.cloud/settings?checkout=success&plan=pro&stub=true"
