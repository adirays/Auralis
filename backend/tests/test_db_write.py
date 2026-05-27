"""
tests/test_db_write.py — DB persistence smoke tests.
Verifies that the analysis route calls the correct Supabase insert
and that the history route returns the stored records.
"""
import json
import pytest
from unittest.mock import patch, call, MagicMock

import numpy as np


def _make_token(client, mock_db) -> str:
    import bcrypt
    pw_hash = bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode()
    user_row = {
        "id": "00000000-0000-0000-0000-000000000003",
        "email": "dbtest@example.com",
        "name": "DB Tester",
        "password_hash": pw_hash,
        "role": "engineer",
        "organization": "",
    }
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [user_row]
    res = client.post("/api/auth/login", json={"email": "dbtest@example.com", "password": "password123"})
    return res.json()["access_token"]


def _minimal_jpeg() -> bytes:
    import cv2
    img = np.ones((10, 10, 3), dtype=np.uint8) * 200
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def _mock_response():
    from models.analysis import AnalysisResponse
    return AnalysisResponse(
        scan_id="SCN-DBTEST",
        anomalies=[],
        heatmap_b64="",
        severity="NONE",
        diagnostics="No defects.",
        processing_time_ms=10,
        location="SECTOR A-41",
        model_version="top-performance-v1",
        timestamp="2024-01-01T00:00:00+00:00",
    )


class TestDbWrite:
    def test_scan_record_is_inserted(self, client, mock_db):
        """Verify that a scan insert is attempted with the correct fields."""
        token = _make_token(client, mock_db)
        insert_mock = MagicMock()
        insert_mock.execute.return_value.data = [{}]
        mock_db.table.return_value.insert.return_value = insert_mock

        with patch("api.analysis.router.analyze_image", return_value=_mock_response()), \
             patch("api.analysis.router._upload_to_storage", return_value=None):
            res = client.post(
                "/api/analysis/analyze",
                files={"file": ("img.jpg", _minimal_jpeg(), "image/jpeg")},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 200
        # Verify insert was called
        mock_db.table.return_value.insert.assert_called()
        insert_args = mock_db.table.return_value.insert.call_args[0][0]
        assert insert_args["id"] == "SCN-DBTEST"
        assert insert_args["severity"] == "NONE"
        assert "model_version" in insert_args
        assert "image_url" in insert_args
        assert "heatmap_url" in insert_args

    def test_history_returns_scans(self, client, mock_db):
        """Verify /history/scans returns rows from the DB."""
        token = _make_token(client, mock_db)
        scan_row = {
            "id": "SCN-HIST01",
            "user_id": "00000000-0000-0000-0000-000000000003",
            "location": "SECTOR A-41",
            "severity": "NONE",
            "anomaly_count": 0,
            "processing_time_ms": 10,
            "image_url": None,
            "heatmap_url": None,
            "model_version": "top-performance-v1",
            "diagnostics": "No defects.",
            "anomalies_json": "[]",
            "created_at": "2024-01-01T00:00:00+00:00",
        }
        mock_db.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value.data = [scan_row]

        res = client.get("/api/history/scans", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        records = res.json()
        assert len(records) == 1
        assert records[0]["id"] == "SCN-HIST01"
        assert records[0]["model_version"] == "top-performance-v1"
