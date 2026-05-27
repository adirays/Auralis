import logging
from fastapi import APIRouter, HTTPException, Depends
from core.security import get_current_user
from services.xai_methods import METHODS_COMPARISON, get_method_recommendation

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/xai", tags=["xai"])


@router.get("/compare/methods")
async def get_methods_metadata(current_user: dict = Depends(get_current_user)):
    """Returns comparative metadata (speed, accuracy, pros, cons) of the XAI backends."""
    return METHODS_COMPARISON


@router.get("/compare/recommend")
async def recommend_method(use_case: str = "crack_detection", current_user: dict = Depends(get_current_user)):
    """Returns recommended XAI method for the specified use-case."""
    rec = get_method_recommendation(use_case)
    return {
        "use_case": use_case,
        "recommended_method": rec,
        "details": METHODS_COMPARISON.get(rec, {})
    }


@router.post("/compare/generate")
async def generate_comparison(scan_id: str, current_user: dict = Depends(get_current_user)):
    """
    Triggers visual comparison pipelines across three attribution backends.
    In production, this extracts features and backprops target class indices.
    """
    try:
        # Mock rendering or mapping for a given scan
        return {
            "scan_id": scan_id,
            "comparison": {
                "eigencam": {
                    "method": "EigenCAM",
                    "speed_ms": 42.1,
                    "contrast_ratio": 0.81,
                    "resolution": "Pixel-fused",
                    "faithful_score": 0.76,
                    "recommended": False
                },
                "gradcam_plusplus": {
                    "method": "Grad-CAM++",
                    "speed_ms": 118.5,
                    "contrast_ratio": 0.94,
                    "resolution": "Per-pixel weighted",
                    "faithful_score": 0.89,
                    "recommended": True
                },
                "scorecam": {
                    "method": "Score-CAM",
                    "speed_ms": 524.2,
                    "contrast_ratio": 0.98,
                    "resolution": "Ablation-averaged",
                    "faithful_score": 0.97,
                    "recommended": False
                }
            },
            "interpretation": (
                "Grad-CAM++ is recommended for crack segmentation as it provides the optimal "
                "trade-off between mathematical faithfulness (gradient-weighted per-pixel importance) "
                "and inference speed. Score-CAM provides the highest localization fidelity but is "
                "computationally expensive for real-time edge devices."
            )
        }
    except Exception as exc:
        logger.error("[xai_compare] generation failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="XAI comparison pipeline failed.")
