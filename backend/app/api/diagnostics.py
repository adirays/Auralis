import logging
from fastapi import APIRouter, Depends, HTTPException
from core.security import get_current_user
from core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])


@router.get("/summary")
async def get_diagnostics_summary(current_user: dict = Depends(get_current_user)):
    """Returns aggregated severity, structural health index, and anomaly statistics."""
    db = get_db()
    try:
        result = (
            db.table("scans")
            .select("severity, anomaly_count")
            .eq("user_id", current_user["sub"])
            .execute()
        )
        
        total_scans = len(result.data)
        if total_scans == 0:
            return {
                "health_index": 100.0,
                "total_defects": 0,
                "severity_distribution": {"critical": 0, "warning": 0, "low": 0},
                "status": "NOMINAL"
            }
            
        critical_count = sum(1 for row in result.data if row["severity"] == "HIGH")
        warning_count = sum(1 for row in result.data if row["severity"] == "MEDIUM")
        low_count = sum(1 for row in result.data if row["severity"] == "LOW")
        total_defects = sum(row["anomaly_count"] for row in result.data)
        
        # Simple weighted health index derivation
        deductions = (critical_count * 15) + (warning_count * 5) + (low_count * 1)
        health_index = max(100.0 - (deductions / total_scans), 10.0)
        
        status = "NOMINAL"
        if health_index < 60:
            status = "CRITICAL"
        elif health_index < 85:
            status = "ATTENTION"
            
        return {
            "health_index": round(health_index, 1),
            "total_defects": total_defects,
            "severity_distribution": {
                "critical": critical_count,
                "warning": warning_count,
                "low": low_count
            },
            "status": status
        }
    except Exception as exc:
        logger.error("[diagnostics] summary failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error.")
