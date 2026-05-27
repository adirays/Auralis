"""
live_db_test.py — Tests the full scan persistence pipeline against the real Supabase DB.
Run from backend/: python live_db_test.py
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))

import urllib.request

BASE = "http://127.0.0.1:8000"

def post(path, body, token=None):
    data = json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST")
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def get(path, token=None):
    headers = {}
    if token: headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, headers=headers)
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def check(label, condition, detail=""):
    if condition:
        print(f"  [PASS] {label}")
    else:
        print(f"  [FAIL] {label} — {detail}")
        sys.exit(1)

print("=" * 60)
print("  Live DB Persistence Test")
print("=" * 60)

# 1. Login
print("\n[1] Auth")
status, body = post("/api/auth/login", {"email": "livetest99@example.com", "password": "livepass123"})
check("Login 200", status == 200, f"{status} {body}")
token = body["access_token"]

# 2. Direct DB insert via Supabase client
print("\n[2] Direct DB insert")
from core.config import get_settings
get_settings.cache_clear()
from core.database import get_db
import uuid

db = get_db()
test_scan_id = f"SCN-DBTEST-{uuid.uuid4().hex[:4].upper()}"

# Get user_id from /me
status, me = get("/api/auth/me", token)
check("/me returns user", status == 200, me)
user_id = me["id"]
print(f"  user_id: {user_id}")

try:
    result = db.table("scans").insert({
        "id":                 test_scan_id,
        "user_id":            user_id,
        "location":           "TEST-SECTOR",
        "severity":           "MEDIUM",
        "anomaly_count":      1,
        "processing_time_ms": 999,
        "diagnostics":        "DB persistence test record",
        "model_version":      "top-performance-v1",
        "image_url":          None,
        "heatmap_url":        None,
        "anomalies_json":     json.dumps([{
            "id": "ANOM-01", "label": "CRACK", "confidence": 0.75,
            "bbox": {"x": 10.0, "y": 20.0, "w": 5.0, "h": 3.0},
            "severity": "warning",
            "layer4_contribution": 0.5, "layer9_contribution": 0.7,
            "xai_explanation": "test", "physics_analysis": "test",
            "repair_recommendation": "test",
        }]),
    }).execute()
    check("DB insert succeeded", bool(result.data), f"data={result.data}")
    print(f"  inserted scan_id: {test_scan_id}")
except Exception as e:
    print(f"  [FAIL] DB insert raised exception: {e}")
    sys.exit(1)

# 3. Read back via history API
print("\n[3] History API read-back")
status, scans = get("/api/history/scans?limit=50", token)
check("/history/scans returns 200", status == 200, f"{status}")
check("Response is a list", isinstance(scans, list), type(scans))

found = next((s for s in scans if s["id"] == test_scan_id), None)
check(f"Inserted scan appears in history", found is not None,
      f"scan_id={test_scan_id} not in {[s['id'] for s in scans[:5]]}")

if found:
    check("severity correct",    found["severity"] == "MEDIUM",    found["severity"])
    check("anomaly_count correct", found["anomaly_count"] == 1,    found["anomaly_count"])
    check("location correct",    found["location"] == "TEST-SECTOR", found["location"])
    check("timestamp present",   bool(found.get("timestamp")),     found.get("timestamp"))
    check("model_version present", bool(found.get("model_version")), found.get("model_version"))
    print(f"  timestamp: {found['timestamp']}")

# 4. Read back via with-anomalies endpoint
print("\n[4] Bulk endpoint with anomalies")
status, bulk = get("/api/history/scans/with-anomalies?limit=50", token)
check("/scans/with-anomalies returns 200", status == 200, f"{status}")
found_bulk = next((s for s in bulk if s["id"] == test_scan_id), None)
check("Scan in bulk response", found_bulk is not None)
if found_bulk:
    check("anomalies key present", "anomalies" in found_bulk)
    check("anomalies list has 1 item", len(found_bulk["anomalies"]) == 1,
          f"got {len(found_bulk['anomalies'])}")
    check("anomaly label correct", found_bulk["anomalies"][0]["label"] == "CRACK")

# 5. Read back via single scan endpoint
print("\n[5] Single scan endpoint")
status, single = get(f"/api/history/scans/{test_scan_id}", token)
check(f"GET /scans/{test_scan_id} returns 200", status == 200, f"{status} {single}")
check("anomalies in single response", "anomalies" in single)

# 6. Clean up test record
print("\n[6] Cleanup")
try:
    db.table("scans").delete().eq("id", test_scan_id).execute()
    print(f"  Deleted test record {test_scan_id}")
except Exception as e:
    print(f"  Warning: cleanup failed (non-fatal): {e}")

print()
print("=" * 60)
print("  ALL DB PERSISTENCE CHECKS PASSED")
print("=" * 60)
