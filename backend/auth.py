"""
Authentication utilities for MentorMind.

Provides:
- FastAPI dependency: get_current_user (verifies Better Auth JWT and syncs user to DB)
- FastAPI dependency: get_optional_user (returns None if no token)
- verify_token_or_test_bypass: standalone token verification for WebSocket contexts

Verification strategy:
  Better Auth signs JWTs with HS256 using the BETTER_AUTH_SECRET shared
  between the Next.js frontend and the Python backend.  We verify the JWT
  locally with PyJWT — no external JWKS call required.
"""

import os
import jwt
import uuid
import hashlib
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from database.models.user import User

# ── Config ────────────────────────────────────────────────────────────────────

BETTER_AUTH_SECRET = os.getenv("BETTER_AUTH_SECRET", "")


def _get_jwt_secret() -> str:
    """Return the HS256 secret for verifying Better Auth JWTs."""
    secret = os.environ.get("BETTER_AUTH_SECRET", "") or BETTER_AUTH_SECRET
    if not secret:
        raise RuntimeError("BETTER_AUTH_SECRET environment variable is not set")
    return secret


# ── JWT Verification ─────────────────────────────────────────────────────────

def decode_token(token: str) -> dict:
    """Decode and validate a Better Auth JWT using the shared HS256 secret."""
    try:
        secret = _get_jwt_secret()
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired — please sign in again",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid session token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── Test Auth Bypass ─────────────────────────────────────────────────────────

def _check_test_bypass(token: str, db: Session) -> Optional[User]:
    """If MENTORMIND_ENV=testing and the token matches TEST_BYPASS_SECRET,
    return a deterministic mock admin user.  This lets automated test suites
    authenticate without touching live signup flows or third-party auth domains.
    """
    if os.getenv("MENTORMIND_ENV") != "testing":
        return None

    bypass_secret = os.getenv("TEST_BYPASS_SECRET")
    if not bypass_secret or token != bypass_secret:
        return None

    test_user_id = "00000000-0000-0000-0000-00000000test"
    user = db.query(User).filter(User.id == test_user_id).first()
    if not user:
        user = User(
            id=test_user_id,
            email="test-admin@mentormind.local",
            username="test_admin",
            hashed_password="test_bypass_managed",
            full_name="Test Admin",
            role="admin",
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


# ── User Resolution ──────────────────────────────────────────────────────────

def _resolve_user_from_payload(payload: dict, db: Session) -> User:
    """Given a decoded JWT payload, find or create the local User record.

    Supports two JWT formats:

    1. **Invite JWTs** (post-auth/invite): ``sub`` is a UUID (the user's id),
       ``username`` is the display name.  Look up directly by ``id == sub``.

    2. **Better Auth JWTs** (legacy): ``sub`` is the Better Auth user ID
       (not a UUID), ``email`` and ``name`` are present.  Match by username
       first, then fall back to deterministic UUID5.

    If no local record exists, one is auto-created.
    """

    auth_user_id = payload.get("sub")
    if not auth_user_id:
        raise ValueError("Invalid token payload: missing 'sub' claim")

    # Check if sub is already a valid UUID → direct lookup (invite JWT)
    try:
        uuid.UUID(str(auth_user_id))
        user = db.query(User).filter(User.id == str(auth_user_id)).first()
        if user:
            if not user.is_active:
                raise ValueError("User account is inactive")
            return user
    except (ValueError, AttributeError):
        pass

    # Legacy Better Auth path
    email = payload.get("email", f"{auth_user_id}@mentormind.local")
    name = payload.get("name", email.split("@")[0])

    user = db.query(User).filter(User.username == auth_user_id).first()

    if not user:
        namespace = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
        user_uuid = str(uuid.uuid5(namespace, auth_user_id))
        user = db.query(User).filter(User.id == user_uuid).first()

    if not user:
        user = User(
            id=str(uuid.uuid5(
                uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8"),
                auth_user_id,
            )),
            email=email,
            username=auth_user_id,
            hashed_password="better_auth_managed",
            full_name=name,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if not user.is_active:
        raise ValueError("User account is inactive")

    return user


# ── FastAPI dependencies ──────────────────────────────────────────────────────

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Require a valid Better Auth JWT (or test bypass token). Auto-creates user in DB."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Test bypass: short-circuit before JWT verification when MENTORMIND_ENV=testing
    test_user = _check_test_bypass(credentials.credentials, db)
    if test_user:
        return test_user

    payload = decode_token(credentials.credentials)

    try:
        return _resolve_user_from_payload(payload, db)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Return the authenticated user, or None if no token is present."""
    if not credentials:
        return None
    try:
        return get_current_user(credentials, db)
    except HTTPException:
        return None


def verify_token_or_test_bypass(token: str, db: Session) -> User:
    """Verify a token (Better Auth JWT or test bypass secret) and return the resolved user.

    Intended for WebSocket handlers and other non-DI contexts where
    ``get_current_user`` cannot be used as a FastAPI dependency.
    """
    test_user = _check_test_bypass(token, db)
    if test_user:
        return test_user

    payload = decode_token(token)
    return _resolve_user_from_payload(payload, db)
