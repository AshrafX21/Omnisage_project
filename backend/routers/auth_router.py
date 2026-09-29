"""
Auth Router for Omnisage Medical Record Aggregator.

Endpoints
---------
POST /api/auth/register  – Create a new account.
POST /api/auth/login     – Validate credentials and return a Bearer token.
POST /api/auth/logout    – Invalidate the current session token.
GET  /api/auth/me        – Return the profile of the token holder (used by the
                           frontend to validate a stored token on page load).

Password hashing uses PBKDF2-HMAC-SHA256 via the Python standard library so
no third-party crypto package is required.
"""

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session as DbSession

from backend.database import get_db
from backend.models import User
from backend.models.session_model import UserSession

# ── Constants ────────────────────────────────────────────────────────────────

SESSION_TTL_DAYS = 30          # tokens expire after 30 days
PBKDF2_ITERATIONS = 260_000    # OWASP-recommended iteration count for SHA-256

router = APIRouter(prefix="/api/auth", tags=["Auth"])
bearer_scheme = HTTPBearer(auto_error=False)

# ── Password helpers ─────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    """Return a salted PBKDF2-SHA256 hash stored as ``salt$hash`` (hex)."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS
    )
    return f"{salt}${key.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    """Constant-time comparison of a plaintext password against a stored hash."""
    if "$" not in stored:
        return False          # legacy placeholder — always reject
    salt, stored_key = stored.split("$", 1)
    key = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS
    )
    return hmac.compare_digest(key.hex(), stored_key)


# ── Session helpers ───────────────────────────────────────────────────────────

def _create_session(user_id: int, db: DbSession) -> str:
    """Mint a new session token, persist it, and return the raw token string."""
    token = secrets.token_urlsafe(32)
    session = UserSession(
        token=token,
        user_id=user_id,
        expires_at=datetime.utcnow() + timedelta(days=SESSION_TTL_DAYS),
    )
    db.add(session)
    db.commit()
    return token


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: DbSession = Depends(get_db),
) -> User:
    """
    FastAPI dependency — resolves a Bearer token to a User or raises 401.
    Import and use this in any router that requires authentication.
    """
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Not authenticated")
    token = credentials.credentials
    session = db.query(UserSession).filter(
        UserSession.token == token,
        UserSession.is_active == True,
        UserSession.expires_at > datetime.utcnow(),
    ).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid or expired token")
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="User not found")
    return user


# ── Request / Response schemas ────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse, status_code=201)
def register(body: RegisterRequest, db: DbSession = Depends(get_db)):
    """Create a new user account and return a session token."""
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=_hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = _create_session(user.id, db)
    return {
        "token": token,
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name},
    }


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: DbSession = Depends(get_db)):
    """Validate credentials and return a fresh session token."""
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not _verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = _create_session(user.id, db)
    return {
        "token": token,
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name},
    }


@router.post("/logout", status_code=204)
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: DbSession = Depends(get_db),
):
    """Invalidate the current session token."""
    if credentials:
        db.query(UserSession).filter(
            UserSession.token == credentials.credentials
        ).update({"is_active": False})
        db.commit()


@router.get("/me", response_model=dict)
def me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's profile (used to validate stored tokens)."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
    }
