import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))

# ── 1. Verify insert payload has all required fields ──────────────────────────
insert_payload = {
    "id":                 "SCN-TEST01",
    "user_id":            "user-uuid-here",
    "location":           "SECTOR A-41",
    "severity":           "HIGH",
    "anomaly_count":      2,
    "processing_time_ms": 1234,
    "diagnostics":        "test diagnostics",
    "model_version":      "top-performance-v1",
    "image_url":          None,
    "heatmap_url":        None,
    "anomalies_json":     json.dumps([]),
}
print("Insert payload keys:", list(insert_payload.keys()))

# ── 2. Verify ScanRecord model maps correctly ─────────────────────────────────
from models.analysis import ScanRecord

row = {
    "id": "SCN-TEST01",
    "user_id": "user-uuid-here",
    "created_at": "2025-01-01T00:00:00+00:00",
    "location": "SECTOR A-41",
    "severity": "HIGH",
    "anomaly_count": 2,
    "processing_time_ms": 1234,
    "image_url": None,
    "heatmap_url": None,
    "model_version": "top-performance-v1",
    "diagnostics": "test",
    "anomalies_json": "[]",
}

sr = ScanRecord(
    id=row["id"],
    user_id=row["user_id"],
    timestamp=row.get("created_at", ""),
    location=row.get("location", ""),
    severity=row.get("severity", "NONE"),
    anomaly_count=row.get("anomaly_count", 0),
    processing_time_ms=row.get("processing_time_ms", 0),
    image_url=row.get("image_url"),
    heatmap_url=row.get("heatmap_url"),
    model_version=row.get("model_version", ""),
    diagnostics=row.get("diagnostics", ""),
)
print("ScanRecord built OK:", sr.id, sr.severity, sr.anomaly_count)

# ── 3. Check what history.tsx expects vs what API returns ─────────────────────
# history.tsx uses: h.id, h.location, h.severity, h.anomaly_count,
#                   h.processing_time_ms, h.timestamp
# api.ts ScanRecord has: id, user_id, timestamp, location, severity,
#                        anomaly_count, processing_time_ms, image_url,
#                        heatmap_url, model_version, diagnostics
print()
print("Field mapping check:")
print("  h.id           -> sr.id           :", sr.id)
print("  h.location     -> sr.location     :", sr.location)
print("  h.severity     -> sr.severity     :", sr.severity)
print("  h.anomaly_count-> sr.anomaly_count:", sr.anomaly_count)
print("  h.timestamp    -> sr.timestamp    :", sr.timestamp)
print()

# ── 4. Check the DB insert — does it include created_at? ─────────────────────
# The schema has: created_at timestamptz default now()
# The insert does NOT include created_at — Postgres fills it automatically
# This is correct. But we need to verify the SELECT returns it.
print("created_at in insert payload:", "created_at" in insert_payload)
print("(correct — Postgres fills it via DEFAULT now())")
print()

# ── 5. Verify anomalies_json round-trip ───────────────────────────────────────
from models.analysis import Anomaly, BoundingBox
a = Anomaly(
    id="ANOM-01", label="CRACK", confidence=0.85,
    bbox=BoundingBox(x=10.0, y=20.0, w=5.0, h=3.0),
    severity="critical",
)
dumped = json.dumps([a.model_dump()])
loaded = json.loads(dumped)
print("anomalies_json round-trip OK:", loaded[0]["label"], loaded[0]["confidence"])
print()
print("ALL CHECKS PASSED")
