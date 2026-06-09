import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from core.database import get_db
from core.security import get_current_user
from models.analysis import ScanRecord

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/history", tags=["history"])


def _row_to_scan_record(row: dict) -> ScanRecord:
    return ScanRecord(
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
        acknowledged_at=row.get("acknowledged_at"),
    )


@router.get("/scans", response_model=list[ScanRecord])
async def get_scans(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    try:
        result = (
            db.table("scans")
            .select("*")
            .eq("user_id", current_user["sub"])
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except Exception:
        logger.error("[anomaly_log] get_scans failed", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error.")

    return [_row_to_scan_record(row) for row in result.data]


@router.get("/scans/with-anomalies")
async def get_scans_with_anomalies(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    try:
        result = (
            db.table("scans")
            .select("*")
            .eq("user_id", current_user["sub"])
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except Exception:
        logger.error("[anomaly_log] get_scans_with_anomalies failed", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error.")

    records = []
    for row in result.data:
        anomalies = json.loads(row.get("anomalies_json", "[]"))
        records.append({
            **_row_to_scan_record(row).model_dump(),
            "anomalies": anomalies,
        })
    return records


@router.get("/scans/{scan_id}")
async def get_scan(scan_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        result = (
            db.table("scans")
            .select("*")
            .eq("id", scan_id)
            .eq("user_id", current_user["sub"])
            .execute()
        )
    except Exception:
        logger.error("[anomaly_log] get_scan failed scan_id=%s", scan_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error.")

    if not result.data:
        raise HTTPException(status_code=404, detail="Scan not found.")

    row = result.data[0]
    anomalies = json.loads(row.get("anomalies_json", "[]"))
    return {**_row_to_scan_record(row).model_dump(), "anomalies": anomalies}


@router.patch("/scans/{scan_id}/acknowledge")
async def acknowledge_scan(scan_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        check = (
            db.table("scans")
            .select("id")
            .eq("id", scan_id)
            .eq("user_id", current_user["sub"])
            .execute()
        )
        if not check.data:
            raise HTTPException(status_code=404, detail="Scan not found.")

        now = datetime.now(timezone.utc).isoformat()
        db.table("scans").update({
            "acknowledged_at": now,
        }).eq("id", scan_id).execute()

        logger.info("[anomaly_log] scan acknowledged scan_id=%s user=%s", scan_id, current_user["sub"])
        return {"success": True, "acknowledged_at": now}
    except HTTPException:
        raise
    except Exception:
        logger.error("[anomaly_log] acknowledge failed scan_id=%s", scan_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error.")
