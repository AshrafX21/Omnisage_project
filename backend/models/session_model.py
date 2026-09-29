"""
Session Model for Omnisage — stores auth tokens issued on login.
Uses a simple opaque token (secrets.token_urlsafe) rather than JWT so no
extra libraries are required beyond the Python standard library.
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Boolean
from backend.database import Base


class UserSession(Base):
    """
    A server-side session record created on every successful login.

    Attributes:
        token:      Random URL-safe token sent to the client as a Bearer token.
        user_id:    Foreign key to the users table.
        created_at: When the session was created.
        expires_at: Hard expiry; sessions older than this are rejected.
        is_active:  Set to False on logout.
    """
    __tablename__ = "user_sessions"

    token      = Column(String, primary_key=True, index=True)
    user_id    = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    is_active  = Column(Boolean, default=True)
