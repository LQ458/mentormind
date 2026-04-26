"""
Unit Tests – Authentication utilities
======================================

Tests cover:
  • CLERK_NAMESPACE constant
  • clerk_id_to_uuid: determinism, uniqueness, return type
  • get_clerk_issuer: env var priority, pk_test_ parsing, default fallback
  • decode_token: raises HTTPException(401) on invalid token
"""

from __future__ import annotations

import sys
import uuid
import os
from unittest.mock import MagicMock, patch

import pytest

# ── Mock database modules before importing auth ───────────────────────────────
# auth.py imports `from database import get_db` and
# `from database.models.user import User` at module level. The `setdefault`
# calls below would normally LEAK the mocks into sys.modules for the rest of
# the test session, masking the real models from later test files (notably
# tests/unit/test_models_schema.py, which inspects real SQLAlchemy columns).
# We restore the prior state via an autouse session-scoped fixture below.

_DB_MODULES = ("database", "database.models", "database.models.user")
_DB_PRIOR = {name: sys.modules.get(name) for name in _DB_MODULES}
for _name in _DB_MODULES:
    sys.modules.setdefault(_name, MagicMock())

import auth  # noqa: E402  (must come after sys.modules patching)
from auth import CLERK_NAMESPACE, clerk_id_to_uuid, get_clerk_issuer, decode_token


@pytest.fixture(scope="module", autouse=True)
def _restore_database_modules():
    """Roll back the sys.modules mocks installed at module import time so they
    do not bleed into other test files that need the real database models."""
    yield
    for _name in _DB_MODULES:
        prior = _DB_PRIOR[_name]
        if prior is None:
            sys.modules.pop(_name, None)
        else:
            sys.modules[_name] = prior


# ─────────────────────────────────────────────────────────────────────────────
# clerk_id_to_uuid
# ─────────────────────────────────────────────────────────────────────────────

class TestClerkIdToUuid:

    def test_same_input_produces_same_uuid(self):
        result_a = clerk_id_to_uuid("user_abc123")
        result_b = clerk_id_to_uuid("user_abc123")
        assert result_a == result_b

    def test_different_inputs_produce_different_uuids(self):
        result_a = clerk_id_to_uuid("user_abc123")
        result_b = clerk_id_to_uuid("user_xyz789")
        assert result_a != result_b

    def test_result_is_uuid_instance(self):
        result = clerk_id_to_uuid("user_abc123")
        assert isinstance(result, uuid.UUID)

    def test_uses_clerk_namespace(self):
        clerk_id = "user_determinism_check"
        expected = uuid.uuid5(CLERK_NAMESPACE, clerk_id)
        assert clerk_id_to_uuid(clerk_id) == expected

    def test_empty_string_returns_uuid(self):
        result = clerk_id_to_uuid("")
        assert isinstance(result, uuid.UUID)

    def test_empty_and_nonempty_differ(self):
        assert clerk_id_to_uuid("") != clerk_id_to_uuid("notempty")


# ─────────────────────────────────────────────────────────────────────────────
# get_clerk_issuer
# ─────────────────────────────────────────────────────────────────────────────

class TestGetClerkIssuer:

    def test_returns_clerk_issuer_env_var_when_set(self):
        with patch.dict(os.environ, {"CLERK_ISSUER": "https://my-custom-clerk-issuer.example.com"}):
            result = get_clerk_issuer()
        assert result == "https://my-custom-clerk-issuer.example.com"

    def test_clerk_issuer_takes_priority_over_publishable_key(self):
        env = {
            "CLERK_ISSUER": "https://explicit.issuer.dev",
            "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_test_cHJpbWUtc25hcHBlci05MS5jbGVyay5hY2NvdW50cy5kZXYk",
        }
        with patch.dict(os.environ, env):
            result = get_clerk_issuer()
        assert result == "https://explicit.issuer.dev"

    def test_parses_pk_test_key_to_extract_domain(self):
        import base64
        # Clerk encodes the domain as base64(domain + "$") in the 3rd "_"-segment
        # pk_test_<base64> → split("_") == ["pk", "test", "<base64>"]
        raw_domain = "example-app-99.clerk.accounts.dev$"
        encoded = base64.b64encode(raw_domain.encode()).decode().rstrip("=")
        pk = f"pk_test_{encoded}"

        env_clean = {k: v for k, v in os.environ.items() if k != "CLERK_ISSUER"}
        env_clean["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = pk

        with patch.dict(os.environ, env_clean, clear=True):
            result = get_clerk_issuer()

        assert result == "https://example-app-99.clerk.accounts.dev"

    def test_parses_pk_live_key_to_extract_domain(self):
        import base64
        raw_domain = "live-org-42.clerk.accounts.dev$"
        encoded = base64.b64encode(raw_domain.encode()).decode().rstrip("=")
        pk = f"pk_live_{encoded}"

        env_clean = {k: v for k, v in os.environ.items() if k not in ("CLERK_ISSUER",)}
        env_clean["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = pk

        with patch.dict(os.environ, env_clean, clear=True):
            result = get_clerk_issuer()

        assert result == "https://live-org-42.clerk.accounts.dev"

    def test_falls_back_to_default_when_nothing_configured(self):
        env_clean = {
            k: v for k, v in os.environ.items()
            if k not in ("CLERK_ISSUER", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
        }
        with patch.dict(os.environ, env_clean, clear=True):
            result = get_clerk_issuer()
        assert result == "https://prime-snapper-91.clerk.accounts.dev"

    def test_falls_back_to_default_on_malformed_publishable_key(self):
        env_clean = {k: v for k, v in os.environ.items() if k != "CLERK_ISSUER"}
        env_clean["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_BADINVALIDBASE64!!!"

        with patch.dict(os.environ, env_clean, clear=True):
            result = get_clerk_issuer()

        assert result == "https://prime-snapper-91.clerk.accounts.dev"


# ─────────────────────────────────────────────────────────────────────────────
# decode_token
# ─────────────────────────────────────────────────────────────────────────────

class TestDecodeToken:

    def test_raises_http_exception_401_on_invalid_token(self):
        import jwt
        from fastapi import HTTPException

        with patch.object(auth.jwks_client, "get_signing_key_from_jwt",
                          side_effect=jwt.PyJWTError("bad token")):
            with pytest.raises(HTTPException) as exc_info:
                decode_token("not.a.valid.token")

        assert exc_info.value.status_code == 401

    def test_http_exception_detail_mentions_invalid_token(self):
        import jwt
        from fastapi import HTTPException

        with patch.object(auth.jwks_client, "get_signing_key_from_jwt",
                          side_effect=jwt.PyJWTError("signature verification failed")):
            with pytest.raises(HTTPException) as exc_info:
                decode_token("eyJhbGciOiJSUzI1NiJ9.fake.payload")

        assert "Invalid or expired token" in exc_info.value.detail

    def test_http_exception_has_www_authenticate_header(self):
        import jwt
        from fastapi import HTTPException

        with patch.object(auth.jwks_client, "get_signing_key_from_jwt",
                          side_effect=jwt.PyJWTError("expired")):
            with pytest.raises(HTTPException) as exc_info:
                decode_token("some.token.here")

        assert exc_info.value.headers is not None
        assert "WWW-Authenticate" in exc_info.value.headers
