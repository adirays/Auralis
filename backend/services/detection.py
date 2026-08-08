"""
services/detection.py — Defect Detection Service

Provides a clean import path for the core detection pipeline.
Re-exports the public API from services.analyzer so that consumers
can do:

    from services.detection import analyze_image, get_model_info

instead of reaching into analyzer internals directly.
"""

from services.analyzer import (
    analyze_image,
    _get_model,
    MODEL_VERSION,
    CONF_THRESHOLD,
    CRITICAL_AREA_RATIO,
    WARNING_AREA_RATIO,
)


def get_model_info() -> dict:
    """Return a summary of the currently loaded detection model."""
    return {
        "model_version": MODEL_VERSION,
        "confidence_threshold": CONF_THRESHOLD,
        "critical_area_ratio": CRITICAL_AREA_RATIO,
        "warning_area_ratio": WARNING_AREA_RATIO,
        "backbone": "YOLOv8 Segmentation",
        "task": "Instance Segmentation — crack",
    }


__all__ = [
    "analyze_image",
    "get_model_info",
    "MODEL_VERSION",
    "CONF_THRESHOLD",
    "CRITICAL_AREA_RATIO",
    "WARNING_AREA_RATIO",
]