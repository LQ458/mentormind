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


def test_invite_password_validation_accepts_bcrypt_safe_passwords():
    assert server._validate_invite_password(" pass123 ") == "pass123"
    assert server._validate_invite_password("x" * 72) == "x" * 72


@pytest.mark.parametrize("value", ["abc", "x" * 73, "密" * 25])
def test_invite_password_validation_rejects_unsafe_passwords(value):
    with pytest.raises(server.HTTPException) as exc_info:
        server._validate_invite_password(value)

    assert exc_info.value.status_code == 400


def test_invite_code_validation_normalizes_safe_codes():
    assert server._validate_invite_code(" mm-nx7k-alpha-2024 ") == "MM-NX7K-ALPHA-2024"
    assert server._validate_invite_code("test_code_1") == "TEST_CODE_1"


@pytest.mark.parametrize("value", ["abc", "bad code", "bad@example.com", "x" * 65])
def test_invite_code_validation_rejects_unsafe_codes(value):
    with pytest.raises(server.HTTPException) as exc_info:
        server._validate_invite_code(value)

    assert exc_info.value.status_code == 400


def test_invalid_invite_credentials_use_generic_detail():
    exc = server._invalid_invite_credentials()

    assert exc.status_code == 401
    assert exc.detail == "Incorrect username or password"
    assert "not found" not in exc.detail.lower()


def test_prod_autopilot_invite_marker_requires_explicit_qa_payload():
    payload = server.InviteLoginPayload(
        username="qa_autopilot",
        password="password123",
        simulated=True,
        simulation_source="prod_autopilot_qa",
    )
    assert server._is_prod_autopilot_invite_payload(payload, "qa_autopilot")

    real_named_like_qa = server.InviteLoginPayload(
        username="qa_real_student",
        password="password123",
    )
    assert not server._is_prod_autopilot_invite_payload(real_named_like_qa, "qa_real_student")

    non_qa_username = server.InviteLoginPayload(
        username="real_student",
        password="password123",
        simulated=True,
        simulation_source="prod_autopilot_qa",
    )
    assert not server._is_prod_autopilot_invite_payload(non_qa_username, "real_student")


def test_mark_prod_autopilot_user_metadata_preserves_existing_metadata():
    user = SimpleNamespace(user_metadata={"cohort": "internal"})

    server._mark_prod_autopilot_user_metadata(user)

    assert user.user_metadata["cohort"] == "internal"
    assert user.user_metadata["simulated"] is True
    assert user.user_metadata["simulation_source"] == server.SIMULATION_SOURCE_PROD_AUTOPILOT
