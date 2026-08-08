"""
services/inference.py — Model Inference Abstraction

Wraps the YOLO model loading and prediction logic from analyzer.py
behind a clean interface. Provides model lifecycle management and
inference entry points.

Usage:

    from services.inference import load_model, predict

    model = load_model()
    results = predict(image_bytes)
"""

import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


def load_model():
    """
    Load and return the YOLO segmentation model.

    The model is loaded lazily and cached as a singleton —
    subsequent calls return the already-loaded instance.

    Returns:
        The loaded YOLO model object.

    Raises:
        RuntimeError: If the model weights file is not found.
    """
    from services.analyzer import _get_model
    return _get_model()


def predict(image_bytes: bytes, location: str = ""):
    """
    Run the full detection + XAI pipeline on raw image bytes.

    This is equivalent to calling ``analyze_image()`` from ``analyzer.py``
    but provides a cleaner public-facing name.

    Args:
        image_bytes: Raw bytes of a JPEG/PNG image.
        location: Optional human-readable location string.

    Returns:
        An ``AnalysisResponse`` instance with detections, heatmap, and diagnostics.

    Raises:
        ValueError: If the image cannot be decoded.
    """
    from services.analyzer import analyze_image
    return analyze_image(image_bytes, location)


def get_model_path() -> Path:
    """Return the absolute path to the model weights file."""
    from services.analyzer import _MODEL_PATH
    return _MODEL_PATH


def is_model_loaded() -> bool:
    """Check whether the YOLO model has already been loaded into memory."""
    from services.analyzer import _model
    return _model is not None


__all__ = [
    "load_model",
    "predict",
    "get_model_path",
    "is_model_loaded",
]
