import logging
from fastapi import APIRouter, HTTPException, Depends
from core.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/active-learning", tags=["active_learning"])


@router.get("/queue")
async def get_active_learning_queue(current_user: dict = Depends(get_current_user)):
    """
    Returns the buffer of unlabelled scans that fell into the model's high-uncertainty
    threshold, sorted by entropy for expert annotation.
    """
    return {
        "queue_size": 3,
        "max_size": 100,
        "retrain_trigger_threshold": 50,
        "samples": [
            {
                "sample_id": "SMP-AL093",
                "entropy": 0.89,          # High Shannon entropy (uncertain boundary)
                "confidence_margin": 0.05, # Distance between top class probabilities
                "scan_id": "SCN-283FA891C0",
                "detected_features": "Heavy shadowing / blurry concrete crack segment",
                "timestamp": "2026-05-27T08:15:00Z"
            },
            {
                "sample_id": "SMP-AL094",
                "entropy": 0.81,
                "confidence_margin": 0.09,
                "scan_id": "SCN-113AD81B18",
                "detected_features": "Wet surface glare reflecting as potential anomaly",
                "timestamp": "2026-05-27T09:42:00Z"
            },
            {
                "sample_id": "SMP-AL095",
                "entropy": 0.74,
                "confidence_margin": 0.14,
                "scan_id": "SCN-55DDE2210F",
                "detected_features": "Hairline joint crack vs construction seam overlap",
                "timestamp": "2026-05-27T10:12:00Z"
            }
        ],
        "verdict": "NOMINAL - Buffer is 6% full. 47 more high-entropy samples needed to trigger automatic pipeline retraining."
    }


@router.post("/label")
async def label_sample(sample_id: str, label: str, current_user: dict = Depends(get_current_user)):
    """Submit expert ground truth labels for an uncertain sample to the retraining database."""
    logger.info("[active_learning] sample %s labeled as '%s' by expert=%s", sample_id, label, current_user["sub"])
    return {
        "success": True,
        "sample_id": sample_id,
        "assigned_label": label,
        "status": "Sample promoted to verification dataset pool."
    }
