"""
check_live.py — Live API smoke test against the running backend.
Run from backend/ with: python check_live.py
"""
import urllib.request
import json
import sys

BASE = "http://127.0.0.1:8000"


def post(path, body, token=None):
    data = json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST")
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def get(path, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, headers=headers)
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def check(label, condition, detail=""):
    if condition:
        print(f"[PASS] {label}")
    else:
        print(f"[FAIL] {label} — {detail}")
        sys.exit(1)


print("=" * 55)
print("  Auralis Live API Smoke Test")
print("=" * 55)

# 1. Health
status, body = get("/health")
check("Health endpoint", status == 200 and body.get("status") == "ok", body)
check("DB connected", body.get("database") == "connected", body)

# 2. Docs accessible in dev
import urllib.request as _ur
_req = _ur.Request(BASE + "/docs")
try:
    _r = _ur.urlopen(_req)
    _docs_status = _r.status
except urllib.error.HTTPError as _e:
    _docs_status = _e.code
check("/docs accessible in dev mode", _docs_status == 200, f"got {_docs_status}")

# 3. Signup
status, body = post("/api/auth/signup", {
    "name": "LiveTest",
    "email": "livetest99@example.com",
    "password": "livepass123",
})
if status == 201:
    token = body["access_token"]
    check("Signup 201", True)
elif status == 400 and "already registered" in body.get("detail", ""):
    status, body = post("/api/auth/login", {
        "email": "livetest99@example.com",
        "password": "livepass123",
    })
    token = body.get("access_token", "")
    check("Login 200 (user existed)", status == 200 and token, body)
else:
    check("Signup", False, f"{status} {body}")

# 4. /me
status, body = get("/api/auth/me", token)
check("/me returns user", status == 200 and body.get("email") == "livetest99@example.com", body)

# 5. 401 on bad token
status, body = get("/api/auth/me", "badtoken")
check("401 on invalid token", status == 401, f"got {status}")

# 6. 403 on missing token
status, body = get("/api/auth/me")
check("403 on missing token", status == 403, f"got {status}")

# 7. History scans
status, body = get("/api/history/scans?limit=5", token)
check("/history/scans returns list", status == 200 and isinstance(body, list), body)
print(f"       -> {len(body)} scan records in DB")

# 8. Bulk endpoint
status, body = get("/api/history/scans/with-anomalies?limit=5", token)
check("/history/scans/with-anomalies returns list", status == 200 and isinstance(body, list), body)
if body:
    check("Bulk response has 'anomalies' key", "anomalies" in body[0], body[0].keys())
    check("Bulk response has 'heatmap_url' key", "heatmap_url" in body[0], body[0].keys())
    check("Bulk response has 'model_version' key", "model_version" in body[0], body[0].keys())

# 9. 404 on unknown scan
status, body = get("/api/history/scans/SCN-DOESNOTEXIST", token)
check("404 on unknown scan_id", status == 404, f"got {status}")

# 10. Wrong content type on analyze
import io
boundary = b"testboundary"
body_bytes = (
    b"--testboundary\r\n"
    b'Content-Disposition: form-data; name="file"; filename="doc.pdf"\r\n'
    b"Content-Type: application/pdf\r\n\r\n"
    b"%PDF-1.4 fake\r\n"
    b"--testboundary--\r\n"
)
req = urllib.request.Request(
    BASE + "/api/analysis/analyze",
    data=body_bytes,
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "multipart/form-data; boundary=testboundary",
    },
    method="POST",
)
try:
    urllib.request.urlopen(req)
    check("Reject PDF upload", False, "should have returned 400")
except urllib.error.HTTPError as e:
    check("Reject PDF upload with 400", e.code == 400, f"got {e.code}")

# 11. Empty file rejected
body_bytes = (
    b"--testboundary\r\n"
    b'Content-Disposition: form-data; name="file"; filename="empty.jpg"\r\n'
    b"Content-Type: image/jpeg\r\n\r\n"
    b"\r\n"
    b"--testboundary--\r\n"
)
req = urllib.request.Request(
    BASE + "/api/analysis/analyze",
    data=body_bytes,
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "multipart/form-data; boundary=testboundary",
    },
    method="POST",
)
try:
    urllib.request.urlopen(req)
    check("Reject empty file", False, "should have returned 400")
except urllib.error.HTTPError as e:
    check("Reject empty file with 400", e.code == 400, f"got {e.code}")

print()
print("=" * 55)
print("  ALL CHECKS PASSED")
print("=" * 55)
