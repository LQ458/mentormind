"""
Unit Tests – Authentication utilities (Better Auth)
====================================================

Tests cover:
  • decode_token: HS256 JWT verification with shared secret
  • _check_test_bypass: env gating, token matching, mock user creation
  • verify_token_or_test_bypass: combined bypass + JWT path
"""

from __future__ import annotations

import os
import sys
import uuid
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi import HTTPException

# ── Mock database modules before importing auth ───────────────────────────────
_DB_MODULES = ("database", "database.models", "database.models.user")
_DB_PRIOR = {name: sys.modules.get(name) for name in _DB_MODULES}
for _name in _DB_MODULES:
    sys.modules.setdefault(_name, MagicMock())

import auth  # noqa: E402
from auth import (
    decode_token,
    _check_test_bypass,
    verify_token_or_test_bypass,
)

TEST_SECRET = "test-secret-key-for-unit-tests-at-least-32-chars"


@pytest.fixture(scope="module", autouse=True)
def _restore_database_modules():
    yield
    for _name in _DB_MODULES:
        prior = _DB_PRIOR[_name]
        if prior is None:
            sys.modules.pop(_name, None)
        else:
            sys.modules[_name] = prior


@pytest.fixture(autouse=True)
def _set_test_secret():
    with patch.dict(os.environ, {"BETTER_AUTH_SECRET": TEST_SECRET}):
        yield


# ── decode_token ──────────────────────────────────────────────────────────────

class TestDecodeToken:

    def test_valid_jwt_decodes_successfully(self):
        payload = {"sub": "user_123", "email": "test@example.com", "name": "Test"}
        token = jwt.encode(payload, TEST_SECRET, algorithm="HS256")
        result = decode_token(token)
        assert result["sub"] == "user_123"
        assert result["email"] == "test@example.com"

    def test_expired_jwt_raises_401(self):
        payload = {"sub": "user_123", "exp": 0}
        token = jwt.encode(payload, TEST_SECRET, algorithm="HS256")
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token)
        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail.lower() or "invalid" in exc_info.value.detail.lower()

    def test_wrong_secret_raises_401(self):
        payload = {"sub": "user_123"}
        token = jwt.encode(payload, "wrong-secret-key", algorithm="HS256")
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token)
        assert exc_info.value.status_code == 401

    def test_malformed_token_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            decode_token("not.even.a.token")
        assert exc_info.value.status_code == 401

    def test_401_has_www_authenticate_header(self):
        payload = {"sub": "user_123"}
        token = jwt.encode(payload, "wrong-secret", algorithm="HS256")
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token)
        assert exc_info.value.headers is not None
        assert "WWW-Authenticate" in exc_info.value.headers

    def test_token_without_sub_still_decodes(self):
        payload = {"email": "no-sub@example.com", "name": "No Sub"}
        token = jwt.encode(payload, TEST_SECRET, algorithm="HS256")
        result = decode_token(token)
        assert result["email"] == "no-sub@example.com"


# ── _check_test_bypass ────────────────────────────────────────────────────────

class TestCheckTestBypass:

    def test_returns_none_when_not_testing_env(self):
        mock_db = MagicMock()
        with patch.dict(os.environ, {"MENTORMIND_ENV": "development"}, clear=False):
            result = _check_test_bypass("any-token", mock_db)
        assert result is None

    def test_returns_none_when_secret_mismatch(self):
        mock_db = MagicMock()
        with patch.dict(os.environ, {
            "MENTORMIND_ENV": "testing",
            "TEST_BYPASS_SECRET": "correct-secret",
        }):
            result = _check_test_bypass("wrong-token", mock_db)
        assert result is None

    def test_returns_none_when_no_secret_configured(self):
        mock_db = MagicMock()
        with patch.dict(os.environ, {
            "MENTORMIND_ENV": "testing",
            "TEST_BYPASS_SECRET": "",
        }):
            result = _check_test_bypass("any-token", mock_db)
        assert result is None

    def test_returns_existing_user_when_already_created(self):
        from database.models.user import User
        existing_user = MagicMock(spec=User)
        existing_user.id = "00000000-0000-0000-0000-00000000test"
        existing_user.is_active = True

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = existing_user

        with patch.dict(os.environ, {
            "MENTORMIND_ENV": "testing",
            "TEST_BYPASS_SECRET": "secret",
        }):
            result = _check_test_bypass("secret", mock_db)

        assert result is existing_user
        # Should NOT add a new user since one was found
        assert not mock_db.add.called


# ── verify_token_or_test_bypass ────────────────────────────────────────────────

class TestVerifyTokenOrTestBypass:

    def test_test_bypass_takes_priority_over_jwt(self):
        mock_db = MagicMock()
        mock_user = MagicMock()
        mock_user.id = "00000000-0000-0000-0000-00000000test"
        mock_user.is_active = True
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        with patch.dict(os.environ, {
            "MENTORMIND_ENV": "testing",
            "TEST_BYPASS_SECRET": "bypass-tok",
        }):
            result = verify_token_or_test_bypass("bypass-tok", mock_db)

        assert result is mock_user

    def test_valid_jwt_resolves_user(self):
        mock_db = MagicMock()
        mock_user = MagicMock()
        mock_user.is_active = True
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        payload = {"sub": "auth_user_42", "email": "user@example.com", "name": "Test User"}
        token = jwt.encode(payload, TEST_SECRET, algorithm="HS256")

        with patch.dict(os.environ, {"MENTORMIND_ENV": "development"}, clear=False):
            result = verify_token_or_test_bypass(token, mock_db)

        assert result is mock_user