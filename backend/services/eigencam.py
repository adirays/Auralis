"""
services/eigencam.py — EigenCAM Explainability Service

Re-exports EigenCAM functionality from xai_methods.py and the
FusionCAMHook from analyzer.py so that consumers can use a single
import for all EigenCAM-related operations:

    from services.eigencam import eigencam, compute_xai, render_xai_heatmap
"""

from services.xai_methods import (
    eigencam,
    compute_xai,
    render_xai_heatmap,
    METHODS_COMPARISON,
    get_method_recommendation,
    XAIMethod,
)

from services.analyzer import (
    FusionCAMHook,
    _build_eigencam_heatmap as build_eigencam_heatmap,
)


__all__ = [
    "eigencam",
    "compute_xai",
    "render_xai_heatmap",
    "METHODS_COMPARISON",
    "get_method_recommendation",
    "XAIMethod",
    "FusionCAMHook",
    "build_eigencam_heatmap",
]