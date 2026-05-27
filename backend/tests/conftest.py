"""
conftest.py — shared fixtures for all backend tests.

Run with:  pytest backend/tests/ -v
Requires:  pip install pytest httpx pytest-mock
"""
import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Ensure backend/ is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── Patch Supabase before any app import ─────────────────────────────────────

def _make_mock_db():
    db = MagicMock()

    # ── SELECT chains ─────────────────────────────────────────────────────────
    db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []

    # ── INSERT chain ──────────────────────────────────────────────────────────
    db.table.return_value.insert.return_value.execute.return_value.data = []

    # ── DELETE chain: .delete().eq().execute() ────────────────────────────────
    db.table.return_value.delete.return_value.eq.return_value.execute.return_value.data = []

    # ── UPDATE chain: .update().eq().execute() ────────────────────────────────
    db.table.return_value.update.return_value.eq.return_value.execute.return_value.data = []

    # ── RPC chain (used by probe_db) ──────────────────────────────────────────
    db.rpc.return_value.execute.return_value.data = []

    return db


@pytest.fixture(scope="session", autouse=True)
def mock_env(monkeypatch_session):
    """Set minimal env vars so Settings() doesn't fail."""
    monkeypatch_session.setenv("JWT_SECRET_KEY",         "test-secret-key-for-tests-only")
    monkeypatch_session.setenv("JWT_REFRESH_SECRET_KEY", "test-refresh-secret-for-tests-only")
    monkeypatch_session.setenv("SUPABASE_URL",           "https://test.supabase.co")
    monkeypatch_session.setenv("SUPABASE_SERVICE_KEY",   "test-service-key")
    monkeypatch_session.setenv("APP_ENV",                "development")


@pytest.fixture(scope="session")
def monkeypatch_session():
    """Session-scoped monkeypatch (pytest only provides function-scoped by default)."""
    from _pytest.monkeypatch import MonkeyPatch
    mp = MonkeyPatch()
    yield mp
    mp.undo()


@pytest.fixture(scope="session")
def mock_db():
    return _make_mock_db()


@pytest.fixture(scope="session")
def client(mock_db, monkeypatch_session):
    """TestClient with Supabase and YOLO model mocked out."""
    monkeypatch_session.setenv("JWT_SECRET_KEY",         "test-secret-key-for-tests-only")
    monkeypatch_session.setenv("JWT_REFRESH_SECRET_KEY", "test-refresh-secret-for-tests-only")
    monkeypatch_session.setenv("SUPABASE_URL",           "https://test.supabase.co")
    monkeypatch_session.setenv("SUPABASE_SERVICE_KEY",   "test-service-key")
    monkeypatch_session.setenv("APP_ENV",                "development")

    with patch("core.database.get_db", return_value=mock_db), \
         patch("core.database.probe_db", return_value=True):
        # Clear lru_cache so patched env is picked up
        from core.config import get_settings
        get_settings.cache_clear()

        from main import app
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
