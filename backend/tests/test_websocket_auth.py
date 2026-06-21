import os
import sys
from types import SimpleNamespace

import pytest


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import server
import auth


def test_websocket_auth_token_prefers_query_token():
    websocket = SimpleNamespace(
        query_params={"token": "query-token"},
        cookies={"mm_token": "cookie-token"},
    )

    assert server._websocket_auth_token(websocket) == "query-token"


def test_websocket_auth_token_uses_http_only_cookie_fallback():
    websocket = SimpleNamespace(
        query_params={},
        cookies={"mm_token": "cookie-token"},
    )

    assert server._websocket_auth_token(websocket) == "cookie-token"


def test_websocket_auth_token_returns_none_without_session():
    websocket = SimpleNamespace(query_params={}, cookies={})

    assert server._websocket_auth_token(websocket) is None


def test_invite_jwt_signing_requires_configured_secret(monkeypatch):
    monkeypatch.delenv("BETTER_AUTH_SECRET", raising=False)
    monkeypatch.setattr(auth, "BETTER_AUTH_SECRET", "")

    with pytest.raises(RuntimeError, match="BETTER_AUTH_SECRET"):
        server._sign_jwt("user-1", "tester")


def test_invite_username_validation_accepts_safe_usernames():
    assert server._validate_invite_username(" Cr_user-1.2 ") == "Cr_user-1.2"
    assert server._validate_invite_username("测试_user") == "测试_user"


@pytest.mark.parametrize("value", ["a", "bad user", "bad@example.com", "x" * 41])
def test_invite_username_validation_rejects_unsafe_usernames(value):
    with pytest.raises(server.HTTPException) as exc_info:
        server._validate_invite_username(value)

    assert exc_info.value.status_code == 400
