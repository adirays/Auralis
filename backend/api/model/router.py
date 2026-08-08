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


@router.get("/eigencam/config")
async def eigencam_config():
    """Returns technical details of the SVD Layer Fusion."""
    return {
        "fused_layers": [4, 9],
        "weights": {"layer_4": 0.6, "layer_9": 0.4},
        "colormap": "TURBO",
        "background_threshold": 0.02,
        "normalization": "Pre-masking min-max normalization",
    }
