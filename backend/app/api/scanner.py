import asyncio
import base64
import json
import logging
import re
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form, Request
from core.database import get_db
from core.security import get_current_user
from models.analysis import AnalysisResponse
from services.analyzer import analyze_image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["analysis"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp"}
MAX_FILE_SIZE = 5 * 1024 * 1024   # 5 MB


def _upload_to_storage(db, bucket: str, path: str, data: bytes, content_type: str) -> str | None:
    try:
        db.storage.from_(bucket).upload(
            path=path,
            file=data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        url = db.storage.from_(bucket).get_public_url(path)
        if isinstance(url, str):
            return url.rstrip("?")
        return None
    except Exception as exc:
        logger.warning("[scanner] storage upload failed path=%s — %s", path, exc)
        return None


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(
    request: Request,
    file: UploadFile = File(...),
    location: str = Form(default=""),
    current_user: dict = Depends(get_current_user),
):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 5 MB.")

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Use JPEG or PNG.",
        )

    image_bytes = await file.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 5 MB.")
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    location = location.strip()[:100]
    if location and not re.match(r'^[A-Za-z0-9 \-_\.]+$', location):
        raise HTTPException(status_code=400, detail="Location may only contain letters, numbers, spaces, hyphens, underscores, and dots.")

    user_id = current_user.get("sub", "unknown")
    logger.info(
        "[scanner] scan started",
        extra={"user_id": user_id, "request_id": getattr(request.state, "request_id", "")},
    )

    try:
        loop = asyncio.get_running_loop()
        result: AnalysisResponse = await loop.run_in_executor(
            None, analyze_image, image_bytes, location
        )
    except ValueError as exc:
        logger.warning("[scanner] invalid image — %s", exc)
        raise HTTPException(status_code=422, detail="Invalid image file.")
    except Exception:
        logger.error("[scanner] pipeline failed", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error.")

    logger.info(
        "[scanner] scan complete",
        extra={
            "scan_id": result.scan_id,
            "user_id": user_id,
            "processing_time_ms": result.processing_time_ms,
        },
    )

    image_url: str | None = None
    heatmap_url: str | None = None
    try:
        db = get_db()
        scan_id = result.scan_id

        image_url = _upload_to_storage(
            db, "scans", f"scans/{scan_id}.jpg", image_bytes, "image/jpeg"
        )

        if result.heatmap_b64:
            heatmap_bytes = base64.b64decode(result.heatmap_b64)
            heatmap_url = _upload_to_storage(
                db, "scans", f"scans/{scan_id}_heatmap.png", heatmap_bytes, "image/png"
            )
    except Exception as exc:
        logger.warning("[scanner] storage phase failed (non-fatal) — %s", exc)

    try:
        db = get_db()
        db.table("scans").insert({
            "id":                 result.scan_id,
            "user_id":            user_id,
            "location":           result.location,
            "severity":           result.severity,
            "anomaly_count":      len(result.anomalies),
            "processing_time_ms": result.processing_time_ms,
            "diagnostics":        result.diagnostics,
            "model_version":      result.model_version,
            "image_url":          image_url,
            "heatmap_url":        heatmap_url,
            "anomalies_json":     json.dumps([a.model_dump() for a in result.anomalies]),
        }).execute()
        logger.info(
            "[scanner] DB record saved",
            extra={"scan_id": result.scan_id, "user_id": user_id},
        )
    except Exception as db_exc:
        logger.error(
            "[scanner] DB persist FAILED — scan_id=%s user_id=%s error=%s",
            result.scan_id, user_id, db_exc,
            exc_info=True,
        )

    result.image_url = image_url
    result.heatmap_url = heatmap_url

    return result
