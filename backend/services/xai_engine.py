"""
services/xai_engine.py — Explainable AI Engine

Unified entry point for all XAI (Explainable AI) methods.
Delegates to ``xai_methods.py`` for current implementations
(EigenCAM, Grad-CAM, Grad-CAM++, Score-CAM) and defines
extension points for future methods.

Usage:

    from services.xai_engine import explain, list_methods

    heatmap = explain("eigencam", activations=act_tensor)
    methods = list_methods()
"""

import logging
from typing import Any

import numpy as np
import torch

from services.xai_methods import (
    compute_xai,
    render_xai_heatmap,
    eigencam,
    gradcam,
    gradcam_plusplus,
    scorecam,
    METHODS_COMPARISON,
    get_method_recommendation,
    XAIMethod,
)

logger = logging.getLogger(__name__)


# ── Public Interface ──────────────────────────────────────────────────────────

def explain(
    method: XAIMethod,
    activations_or_model: torch.Tensor | torch.nn.Module,
    layer: torch.nn.Module | None = None,
    input_tensor: torch.Tensor | None = None,
    **kwargs: Any,
) -> np.ndarray:
    """
    Generate an XAI heatmap using the specified method.

    This is the primary entry point for all explainability calls.
    It delegates to ``xai_methods.compute_xai`` internally.

    Args:
        method: One of ``"eigencam"``, ``"gradcam"``, ``"gradcam++"``, ``"scorecam"``.
        activations_or_model: For EigenCAM, pass the activation tensor (B, C, H, W).
            For gradient-based methods, pass the PyTorch model.
        layer: Target backbone layer (required for gradient-based methods).
        input_tensor: Input image tensor (required for gradient-based methods).
        **kwargs: Additional method-specific arguments (e.g. ``class_idx``, ``normalize``).

    Returns:
        A heatmap as a NumPy array of shape (H, W) with values in [0, 1].

    Raises:
        ValueError: If the method name is not recognised.
    """
    logger.debug("[xai_engine] generating %s heatmap", method)
    return compute_xai(
        method=method,
        activations_or_model=activations_or_model,
        layer=layer,
        input_tensor=input_tensor,
        **kwargs,
    )


def list_methods() -> dict[str, dict[str, Any]]:
    """
    Return metadata for all available XAI methods.

    Each entry includes name, speed, accuracy, and pros/cons —
    useful for the ``/api/xai/compare/methods`` endpoint.
    """
    return METHODS_COMPARISON


def recommend(use_case: str = "crack_detection") -> str:
    """
    Return the recommended XAI method for a given use case.

    Args:
        use_case: One of ``"crack_detection"``, ``"segmentation"``,
            ``"real_time"``, ``"research"``, ``"balanced"``.

    Returns:
        Method key string (e.g. ``"gradcam++"``).
    """
    return get_method_recommendation(use_case)


__all__ = [
    "explain",
    "list_methods",
    "recommend",
    "render_xai_heatmap",
    # Re-export individual methods for direct access
    "eigencam",
    "gradcam",
    "gradcam_plusplus",
    "scorecam",
    "XAIMethod",
    "METHODS_COMPARISON",
]
