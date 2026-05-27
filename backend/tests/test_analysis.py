"""
tests/test_analysis.py — Analysis endpoint smoke tests.
YOLO inference is mocked so no GPU or model file is required.
"""
import pytest
from unittest.mock import patch, MagicMock

import numpy as np


def _make_token(client, mock_db) -> str:
    import bcrypt
    pw_hash = bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode()
    user_row = {
        "id":            "00000000-0000-0000-0000-000000000002",
        "email":         "analyst@example.com",
        "name":          "Analyst",
        "password_hash": pw_hash,
        "role":          "engineer",
        "organization":  "",
    }
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [user_row]
    res = client.post("/api/auth/login", json={
        "email":    "analyst@example.com",
        "password": "password123",
    })
    # TokenResponse now contains both access_token and refresh_token
    body = res.json()
    assert "access_token"  in body, f"Login failed: {body}"
    assert "refresh_token" in body, f"refresh_token missing: {body}"
    return body["access_token"]


def _minimal_jpeg() -> bytes:
    """Return a 10×10 white JPEG in memory."""
    import cv2
    img = np.ones((10, 10, 3), dtype=np.uint8) * 255
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def _mock_analysis_response():
    from models.analysis import AnalysisResponse
    return AnalysisResponse(
        scan_id="SCN-TEST01",
        anomalies=[],
        heatmap_b64="",
        severity="NONE",
        diagnostics="No defects detected.",
        processing_time_ms=42,
        location="SECTOR B-12",
        model_version="top-performance-v1",
        timestamp="2024-01-01T00:00:00+00:00",
    )


class TestAnalyze:
    def test_analyze_requires_auth(self, client):
        res = client.post(
            "/api/analysis/analyze",
            files={"file": ("test.jpg", _minimal_jpeg(), "image/jpeg")},
        )
        assert res.status_code == 403

    def test_analyze_returns_result(self, client, mock_db):
        token = _make_token(client, mock_db)
        mock_db.table.return_value.insert.return_value.execute.return_value.data = [{}]

        with patch("api.analysis.router.analyze_image", return_value=_mock_analysis_response()), \
             patch("api.analysis.router._upload_to_storage", return_value=None):
            res = client.post(
                "/api/analysis/analyze",
                files={"file": ("crack.jpg", _minimal_jpeg(), "image/jpeg")},
                data={"location": "SECTOR B-12"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 200
        body = res.json()
        assert body["scan_id"]  == "SCN-TEST01"
        assert body["severity"] == "NONE"
        assert "anomalies" in body

    def test_analyze_rejects_wrong_content_type(self, client, mock_db):
        token = _make_token(client, mock_db)
        res = client.post(
            "/api/analysis/analyze",
            files={"file": ("doc.pdf", b"%PDF-1.4", "application/pdf")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 400

    def test_analyze_rejects_empty_file(self, client, mock_db):
        token = _make_token(client, mock_db)
        res = client.post(
            "/api/analysis/analyze",
            files={"file": ("empty.jpg", b"", "image/jpeg")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 400

    def test_analyze_rejects_invalid_location(self, client, mock_db):
        token = _make_token(client, mock_db)
        res = client.post(
            "/api/analysis/analyze",
            files={"file": ("crack.jpg", _minimal_jpeg(), "image/jpeg")},
            data={"location": "<script>alert(1)</script>"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 400

    def test_analyze_accepts_valid_location(self, client, mock_db):
        token = _make_token(client, mock_db)
        mock_db.table.return_value.insert.return_value.execute.return_value.data = [{}]

        with patch("api.analysis.router.analyze_image", return_value=_mock_analysis_response()), \
             patch("api.analysis.router._upload_to_storage", return_value=None):
            res = client.post(
                "/api/analysis/analyze",
                files={"file": ("crack.jpg", _minimal_jpeg(), "image/jpeg")},
                data={"location": "SECTOR A-41"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert res.status_code == 200
