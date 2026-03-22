"""
Authentication utilities for MentorMind using Clerk.

Provides:
- FastAPI dependency: get_current_user (verifies Clerk JWT using JWKS and syncs user to DB)
- FastAPI dependency: get_optional_user (returns None if no token)
"""

import os
import jwt
from jwt import PyJWKClient
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from database.models.user import User

# ── Config ────────────────────────────────────────────────────────────────────

# The Publishable Key from Clerk contains the instance domain encoded in base64
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = os.getenv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "")

# We can derive the JWKS endpoint directly from the publishable key or environment variable
# If you provide the publishable key as pk_test_..., we could parse it, but for simplicity,
# Next.js Clerk integrations use the frontend URL or the Clerk Frontend API.
# The standard JWKS URL format for Clerk is: https://<frontend-api>/.well-known/jwks.json

# If you have the Secret Key, Clerk's issuer is generally "https://clerk.<domain>"
# For mentormind, let's allow setting CLERK_ISSUER explicitly in docker-compose,
# or we can extract it from the pk_... key.
import base64

def get_clerk_issuer() -> str:
    issuer = os.getenv("CLERK_ISSUER")
    if issuer:
        return issuer
    
    pk = os.getenv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "")
    if pk.startswith("pk_test_") or pk.startswith("pk_live_"):
        # The frontend API domain is standard base64 encoded after the prefix
        try:
            domain_b64 = pk.split("_")[2]
            # Add padding if needed
            domain_b64 += "=" * ((4 - len(domain_b64) % 4) % 4)
            domain = base64.b64decode(domain_b64).decode("utf-8").removesuffix('$')
            return f"https://{domain}"
        except Exception:
            pass
    return "https://prime-snapper-91.clerk.accounts.dev"

CLERK_ISSUER = get_clerk_issuer()
JWKS_URL = f"{CLERK_ISSUER}/.well-known/jwks.json"

# Initialize JWKS client to fetch and cache public keys
jwks_client = PyJWKClient(JWKS_URL)

# ── JWT Verification ─────────────────────────────────────────────────────────

def decode_token(token: str) -> dict:
    """Decode and validate a Clerk JWT against their JWKS endpoint."""
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False} # We trust the signature and issuer
        )
        return payload
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── FastAPI dependencies ──────────────────────────────────────────────────────

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Require a valid Clerk JWT. Auto-creates user in DB if they don't exist."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    payload = decode_token(credentials.credentials)
    clerk_id = payload.get("sub")
    if not clerk_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    # Sync User to Database
    user = db.query(User).filter(User.id == clerk_id).first()
    
    if not user:
        # Create user record locally since Clerk authenticated them
        # Note: Depending on Clerk token template, email/username might be embedded,
        # otherwise we use placeholders.
        user = User(
            id=clerk_id,
            email=f"{clerk_id}@clerk.local", # placeholder
            username=clerk_id,
            hashed_password="clerk_managed", # No password needed locally
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is inactive")
        
    return user


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
