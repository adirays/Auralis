from fastapi import APIRouter

router = APIRouter(prefix="/model", tags=["model"])


@router.get("/info")
async def model_info():
    from services.analyzer import MODEL_VERSION, CONF_THRESHOLD, CRITICAL_AREA_RATIO, WARNING_AREA_RATIO
    return {
        "model_version":        MODEL_VERSION,
        "confidence_threshold": CONF_THRESHOLD,
        "critical_area_ratio":  CRITICAL_AREA_RATIO,
        "warning_area_ratio":   WARNING_AREA_RATIO,
        "backbone":             "YOLOv8 Segmentation",
        "explainability":       "EigenCAM (Layer 4 \u00d7 Layer 9 SVD Fusion)",
        "task":                 "Instance Segmentation \u2014 crack",
    }
