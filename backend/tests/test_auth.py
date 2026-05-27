"""
tests/test_auth.py — Auth endpoint smoke tests.
"""
import pytest
from unittest.mock import MagicMock


def _make_user_row(email="test@example.com", name="Test User"):
    import bcrypt
    pw_hash = bcrypt.hashpw(b"Password1!", bcrypt.gensalt()).decode()
    return {
        "id":            "00000000-0000-0000-0000-000000000001",
        "email":         email,
        "name":          name,
        "password_hash": pw_hash,
        "role":          "engineer",
        "organization":  "Test Org",
    }


def _assert_token_pair(body: dict) -> None:
    """Both tokens must be present and non-empty strings."""
    assert "access_token"  in body, "access_token missing"
    assert "refresh_token" in body, "refresh_token missing"
    assert isinstance(body["access_token"],  str) and body["access_token"]
    assert isinstance(body["refresh_token"], str) and body["refresh_token"]
    assert body["token_type"] == "bearer"


class TestSignup:
    def test_signup_returns_token_pair(self, client, mock_db):
        user_row = _make_user_row()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        mock_db.table.return_value.insert.return_value.execute.return_value.data = [user_row]

        res = client.post("/api/auth/signup", json={
            "name":     "Test User",
            "email":    "test@example.com",
            "password": "Password1!",
        })
        assert res.status_code == 201
        _assert_token_pair(res.json())

    def test_signup_rejects_short_password(self, client):
        res = client.post("/api/auth/signup", json={
            "name":     "Test User",
            "email":    "test@example.com",
            "password": "short",
        })
        assert res.status_code == 422

    def test_signup_rejects_weak_password(self, client):
        """No uppercase or special char — must be rejected by complexity rule."""
        res = client.post("/api/auth/signup", json={
            "name":     "Test User",
            "email":    "test@example.com",
            "password": "password123",
        })
        assert res.status_code == 422

    def test_signup_rejects_invalid_email(self, client):
        res = client.post("/api/auth/signup", json={
            "name":     "Test User",
            "email":    "not-an-email",
            "password": "Password1!",
        })
        assert res.status_code == 422


class TestLogin:
    def test_login_returns_token_pair(self, client, mock_db):
        user_row = _make_user_row()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [user_row]

        res = client.post("/api/auth/login", json={
            "email":    "test@example.com",
            "password": "Password1!",
        })
        assert res.status_code == 200
        _assert_token_pair(res.json())

    def test_login_wrong_password(self, client, mock_db):
        user_row = _make_user_row()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [user_row]

        res = client.post("/api/auth/login", json={
            "email":    "test@example.com",
            "password": "wrongPassword1!",
        })
        assert res.status_code == 401

    def test_login_unknown_email(self, client, mock_db):
        empty = MagicMock()
        empty.data = []
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = empty

        res = client.post("/api/auth/login", json={
            "email":    "nobody@example.com",
            "password": "password123",
        })
        assert res.status_code == 401


class TestRefresh:
    def _login(self, client, mock_db) -> dict:
        user_row = _make_user_row()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [user_row]
        res = client.post("/api/auth/login", json={
            "email":    "test@example.com",
            "password": "Password1!",
        })
        return res.json()

    def test_refresh_returns_new_token_pair(self, client, mock_db):
        tokens = self._login(client, mock_db)
        user_row = _make_user_row()
        # refresh endpoint queries users by id
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [user_row]

        res = client.post("/api/auth/refresh", json={
            "refresh_token": tokens["refresh_token"],
        })
        assert res.status_code == 200
        _assert_token_pair(res.json())

    def test_refresh_rejects_invalid_token(self, client):
        res = client.post("/api/auth/refresh", json={
            "refresh_token": "not.a.valid.token",
        })
        assert res.status_code == 401

    def test_refresh_rejects_access_token_as_refresh(self, client, mock_db):
        """Access tokens must not be accepted as refresh tokens."""
        tokens = self._login(client, mock_db)
        res = client.post("/api/auth/refresh", json={
            "refresh_token": tokens["access_token"],
        })
        assert res.status_code == 401


class TestMe:
    def _get_access_token(self, client, mock_db) -> str:
        user_row = _make_user_row()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [user_row]
        res = client.post("/api/auth/login", json={
            "email":    "test@example.com",
            "password": "Password1!",
        })
        return res.json()["access_token"]

    def test_me_returns_user(self, client, mock_db):
        token = self._get_access_token(client, mock_db)
        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        body = res.json()
        assert body["email"] == "test@example.com"
        assert body["role"]  == "engineer"

    def test_me_rejects_no_token(self, client):
        res = client.get("/api/auth/me")
        assert res.status_code == 403

    def test_me_rejects_refresh_token(self, client, mock_db):
        """Refresh tokens must not be accepted as access tokens."""
        user_row = _make_user_row()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [user_row]
        res = client.post("/api/auth/login", json={
            "email":    "test@example.com",
            "password": "Password1!",
        })
        refresh_token = res.json()["refresh_token"]
        res2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {refresh_token}"})
        assert res2.status_code == 401


class TestPasswordReset:
    def test_request_reset_always_204(self, client, mock_db):
        """Always returns 204 regardless of whether email exists."""
        # Email not found — should still return 204
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        res = client.post("/api/auth/password-reset/request", json={
            "email": "nobody@example.com",
        })
        assert res.status_code == 204

    def test_request_reset_with_existing_email(self, client, mock_db):
        user_row = {"id": "00000000-0000-0000-0000-000000000001", "email": "test@example.com"}
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [user_row]

        res = client.post("/api/auth/password-reset/request", json={
            "email": "test@example.com",
        })
        assert res.status_code == 204

    def test_confirm_reset_invalid_token(self, client, mock_db):
        # Token not found in DB
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        res = client.post("/api/auth/password-reset/confirm", json={
            "token":        "invalid-token",
            "new_password": "NewPass123!",
        })
        assert res.status_code == 400

    def test_confirm_reset_expired_token(self, client, mock_db):
        from datetime import datetime, timezone, timedelta
        expired = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"user_id": "00000000-0000-0000-0000-000000000001", "expires_at": expired}
        ]
        res = client.post("/api/auth/password-reset/confirm", json={
            "token":        "expired-token",
            "new_password": "NewPass123!",
        })
        assert res.status_code == 400

    def test_confirm_reset_valid_token(self, client, mock_db):
        from datetime import datetime, timezone, timedelta
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"user_id": "00000000-0000-0000-0000-000000000001", "expires_at": future}
        ]
        res = client.post("/api/auth/password-reset/confirm", json={
            "token":        "valid-token-abc",
            "new_password": "NewPass123!",
        })
        assert res.status_code == 204

    def test_confirm_reset_rejects_short_password(self, client):
        res = client.post("/api/auth/password-reset/confirm", json={
            "token":        "any-token",
            "new_password": "short",
        })
        assert res.status_code == 422
