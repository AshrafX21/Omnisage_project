"""
Database Module for Omnisage Medical Record Aggregator.

This module initializes the SQLAlchemy database engine, creates the sessionmaker,
provides the declarative base class for model mapping, exposes a dependency
generator for retrieving active database sessions, and initializes the pgvector
extension when connected to PostgreSQL.
"""

import sys
from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from backend.config import settings

# Track which database backend is active
_using_postgres = False

# Attempt to create the engine and check the connection
try:
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True
    )
    # Test connection liveness
    with engine.connect() as conn:
        pass
    # Determine the ACTUAL backend from the resolved URL rather than assuming
    # "connection succeeded" means Postgres — settings.DATABASE_URL can be a
    # sqlite:// URL too (e.g. via an explicit env var override), in which
    # case this branch still runs (the connection succeeds), and the log/
    # is_postgres() flag would otherwise be wrong.
    _using_postgres = engine.url.get_backend_name() == "postgresql"
    print(f"Successfully connected to the database ({engine.url.get_backend_name()}).")
except (OperationalError, Exception) as e:
    print(f"WARNING: Database connection failed (DATABASE_URL={settings.DATABASE_URL}). Details: {e}", file=sys.stderr)
    print("Falling back to local SQLite database: sqlite:///./omnisage.db", file=sys.stderr)
    engine = create_engine(
        "sqlite:///./omnisage.db",
        connect_args={"check_same_thread": False, "timeout": 30}  # Required for SQLite multi-threading; 30s busy timeout so concurrent writers wait instead of raising "database is locked"
    )

# Attempt to initialize pgvector extension (optional — AI features use Python-side cosine similarity)
if _using_postgres:
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
        print("pgvector extension enabled (optional optimization).")
    except Exception as e:
        print(f"NOTE: pgvector extension not available (this is OK — AI features use Python-side similarity).")

# Bind sessionmaker to the resolved engine
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Declarative base class for SQLAlchemy model definitions
Base = declarative_base()


def is_postgres() -> bool:
    """
    Returns True if the app is connected to PostgreSQL (required for AI features).

    Returns:
        bool: Whether PostgreSQL is the active database backend.
    """
    return _using_postgres


def get_db() -> Generator[Session, None, None]:
    """
    Dependency generator function that yields an active database session
    and guarantees it closes after the requesting handler executes.

    Yields:
        Session: Active database session bound to the transaction.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
