"""Shared pytest fixtures for the python-service test suite.

The `client` fixture spins up an in-memory SQLite database, creates all
ORM-mapped tables via SQLAlchemy metadata, and overrides the FastAPI
`get_db` dependency so every test gets a fresh, isolated session without
touching the real PostgreSQL instance.
"""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app

# Import all models so Base.metadata is fully populated before create_all()
from app.models import Briefing, BriefingMetric, BriefingPoint, SampleItem  # noqa: F401


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    """Yield a TestClient backed by an in-memory SQLite database.

    Each fixture invocation creates a fresh schema and tears it down
    afterwards, guaranteeing full test isolation.
    """
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, future=True
    )

    Base.metadata.create_all(bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
