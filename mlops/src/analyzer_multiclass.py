"""
Enhanced analyzer.py — Multi-class segmentation with mask-based severity

This is a DROP-IN replacement for backend/services/analyzer.py

Key improvements:
  1. Multi-class support (crack, spalling, corrosion, delamination, efflorescence)
  2. Mask-based area calculation (instead of bbox area)
  3. Per-class severity thresholds
  4. Better EigenCAM masking using actual segmentation masks
  5. Class-specific repair recommendations

Backward compatible: 
  - If Top_Performance.pt is single-class, falls back to old behavior
  - If model is multi-class, uses new logic
"""

import base64
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import torch

from models.analysis import Anomaly, AnalysisResponse, BoundingBox

os.environ.setdefault("YOLO_VERBOSE", "False")

logger = logging.getLogger(__name__)

# ── Model path ────────────────────────────────────────────────────────────────
_MODEL_PATH = Path(__file__).resolve().parents[1].parent / "Top_Performance.pt"
MODEL_VERSION = "top-performance-multiclass-v2"

_model    = None
_cam_hook = None


# ── Class constants ───────────────────────────────────────────────────────────
CLASS_NAMES = {
    0: "crack",
    1: "spalling",
    2: "corrosion",
    3: "delamination",
    4: "efflorescence",
}

# Per-class severity thresholds (by mask area ratio)
SEVERITY_THRESHOLDS = {
    "crack": {"critical": 0.05, "warning": 0.015},           # higher for large cracks
    "spalling": {"critical": 0.08, "warning": 0.03},         # more aggressive
    "corrosion": {"critical": 0.06, "warning": 0.02},        # rust stains
    "delamination": {"critical": 0.10, "warning": 0.04},     # very damaging
    "efflorescence": {"critical": 0.05, "warning": 0.01},    # less critical
}


# ── EigenCAM hook (same as before) ────────────────────────────────────────────
import threading as _threading

class FusionCAMHook:
    def __init__(self, pytorch_model, layer_indices=(4, 9)):
        self._local = _threading.local()
        self._hooks = []
        for idx in layer_indices:
            layer = pytorch_model.model[idx]
            self._hooks.append(
                layer.register_forward_hook(self._make_hook(idx))
            )

    def _make_hook(self, idx: int):
        def hook(module, inp, out):
            if not hasattr(self._local, "activations"):
                self._local.activations = {}
            self._local.activations[idx] = out.detach().cpu()
        return hook

    @property
    def activations(self) -> dict:
        return getattr(self._local, "activations", {})

    def remove(self):
        for h in self._hooks:
            h.remove()
        self._hooks.clear()


def _compute_eigen_cam(activations: torch.Tensor) -> np.ndarray:
    b, c, height, width = activations.size()
    A = activations.squeeze(0).view(c, height * width)
    A = A - A.mean(dim=1, keepdim=True)
    U, S, V = torch.linalg.svd(A, full_matrices=False)
    cam = torch.matmul(U[:, 0], A).view(height, width)
    cam = (cam - cam.min()) / (cam.max() - cam.min() + 1e-8)
    return cam.numpy()


def _get_model():
    global _model, _cam_hook
    if _model is None:
        from ultralytics import YOLO
        if not _MODEL_PATH.exists():
            raise RuntimeError(
                f"Model file not found: {_MODEL_PATH}. "
                "Place 'Top_Performance.pt' in the project root."
            )
        _model = YOLO(str(_MODEL_PATH))
        _cam_hook = FusionCAMHook(_model.model)
        logger.info("[analyzer] YOLO model loaded — task=%s classes=%s path=%s",
                    _model.task, _model.names, _MODEL_PATH.name)
        logger.info("[analyzer] EigenCAM hooks registered on backbone layers 4 & 9")
    return _model


# ── Heatmap / inference constants ─────────────────────────────────────────────
HEATMAP_ALPHA      = 0.5
HEATMAP_BETA       = 0.5
CONF_THRESHOLD     = 0.25


def _load_image(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image. Ensure it is a valid JPEG or PNG.")
    h, w = img.shape[:2]
    if max(h, w) > 1024:
        scale = 1024 / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def _get_class_name(class_id: int | float) -> str:
    """Map class_id to human-readable name, with fallback for single-class models."""
    cid = int(class_id)
    return CLASS_NAMES.get(cid, f"defect_{cid}")


def _classify_detection(
    class_id: int,
    conf: float,
    mask_area_ratio: float,
) -> tuple[str, str]:
    """
    Multi-class severity classification using mask area.
    
    Args:
        class_id: YOLO class index
        conf: model confidence [0, 1]
        mask_area_ratio: mask pixels / total image pixels
    
    Returns:
        (label, severity) where severity in ["critical", "warning", "low"]
    """
    label = _get_class_name(class_id)
    
    # High confidence overrides area-based logic
    if conf >= 0.85:
        return label, "critical"
    if conf >= 0.65:
        return label, "warning"
    
    # Area-based thresholds (per-class)
    thresholds = SEVERITY_THRESHOLDS.get(label, {"critical": 0.05, "warning": 0.01})
    
    if mask_area_ratio >= thresholds["critical"]:
        return label, "critical"
    if mask_area_ratio >= thresholds["warning"]:
        return label, "warning"
    
    return label, "low"


def _generate_xai_multiclass(
    label: str,
    severity: str,
    conf: float,
    mask_area_ratio: float,
) -> dict[str, str]:
    """Generate class-specific XAI explanations."""
    conf_pct = f"{conf * 100:.1f}%"
    area_pct = f"{mask_area_ratio * 100:.2f}%"
    label_up = label.upper()
    sev_up = severity.upper()
    
    # Class-specific explanations
    explanations = {
        "crack": {
            "xai": f"YOLO segmentation detected {label_up} with {conf_pct} confidence. "
                   f"Mask area: {area_pct} of image. EigenCAM activation concentrated along crack path.",
            "critical": {
                "physics": f"Crack propagation ({area_pct} of image) indicates active stress concentration. "
                           "Likely tensile or shear-dominated failure mode per ACI 318.",
                "repair": f"PRIORITY-1 [{sev_up}]: Restrict load immediately. "
                         "Physical inspection within 24 hours. Inject epoxy, install crack monitors.",
            },
            "warning": {
                "physics": f"Crack within ACI 224R-01 monitoring threshold ({area_pct}). "
                          "Likely due to thermal, shrinkage, or minor overload.",
                "repair": f"PRIORITY-2 [{sev_up}]: Apply epoxy sealant. Schedule inspection within 30 days. "
                         "Monitor monthly with crack comparator.",
            },
            "low": {
                "physics": f"Minor surface crack detected ({area_pct}). No immediate structural risk.",
                "repair": f"PRIORITY-3 [{sev_up}]: Document and monitor. Inspect within 90 days.",
            },
        },
        "spalling": {
            "xai": f"YOLO segmentation detected concrete {label_up} with {conf_pct} confidence. "
                   f"Spall area: {area_pct} of image.",
            "critical": {
                "physics": f"Extensive concrete loss ({area_pct}) exposes reinforcement. "
                          "Risk of accelerated corrosion and structural degradation.",
                "repair": f"PRIORITY-1 [{sev_up}]: Close area to traffic. Remove loose concrete. "
                         "Prepare surface, apply concrete patch or overlay within 48 hours.",
            },
            "warning": {
                "physics": f"Moderate spalling ({area_pct}) indicates ongoing weathering or abrasion.",
                "repair": f"PRIORITY-2 [{sev_up}]: Clean spall area. Apply concrete filler. "
                         "Schedule waterproofing within 30 days.",
            },
            "low": {
                "physics": f"Minor surface spall ({area_pct}). Cosmetic impact minimal.",
                "repair": f"PRIORITY-3 [{sev_up}]: Monitor for growth. Fill if cosmetically important.",
            },
        },
        "corrosion": {
            "xai": f"YOLO detected {label_up} staining/rust with {conf_pct} confidence. "
                   f"Affected area: {area_pct} of image.",
            "critical": {
                "physics": f"Extensive corrosion ({area_pct}) suggests advanced rebar degradation. "
                          "Strength loss and potential collapse risk.",
                "repair": f"PRIORITY-1 [{sev_up}]: Perform half-cell potential survey. Extract rebar samples. "
                         "Plan cathodic protection or rebar replacement.",
            },
            "warning": {
                "physics": f"Moderate rust staining ({area_pct}) indicates active corrosion. "
                          "Likely chloride penetration.",
                "repair": f"PRIORITY-2 [{sev_up}]: Corrosion mapping + concrete analysis. "
                         "Increase monitoring frequency to bi-monthly.",
            },
            "low": {
                "physics": f"Minor staining ({area_pct}). Possible surface-level oxide.",
                "repair": f"PRIORITY-3 [{sev_up}]: Continue regular inspection.",
            },
        },
        "delamination": {
            "xai": f"YOLO detected concrete {label_up} with {conf_pct} confidence. "
                   f"Delaminated area: {area_pct} of image.",
            "critical": {
                "physics": f"Severe delamination ({area_pct}) indicates loss of structural composite action. "
                          "Imminent spalling risk.",
                "repair": f"PRIORITY-1 [{sev_up}]: Restrict use. Perform ultrasonic mapping. "
                         "Schedule concrete overlay or replacement immediately.",
            },
            "warning": {
                "physics": f"Moderate delamination ({area_pct}) detected. Likely caused by water ingress + freeze-thaw.",
                "repair": f"PRIORITY-2 [{sev_up}]: Apply sealant to prevent water entry. "
                         "Schedule patching within 30 days.",
            },
            "low": {
                "physics": f"Minor delamination ({area_pct}). Early-stage defect.",
                "repair": f"PRIORITY-3 [{sev_up}]: Monitor crack growth. Seal if water ingress expected.",
            },
        },
        "efflorescence": {
            "xai": f"YOLO detected salt bloom {label_up} with {conf_pct} confidence. "
                   f"Affected area: {area_pct} of image.",
            "critical": {
                "physics": f"Extensive efflorescence ({area_pct}) suggests heavy water flow. "
                          "Risk of ongoing leaching and internal erosion.",
                "repair": f"PRIORITY-1 [{sev_up}]: Identify water source immediately. Implement drainage. "
                         "Apply hydrophobic sealer.",
            },
            "warning": {
                "physics": f"Moderate efflorescence ({area_pct}) indicates water infiltration. "
                          "Early sign of potential durability issues.",
                "repair": f"PRIORITY-2 [{sev_up}]: Apply chemical cleaner and sealer. "
                         "Investigate moisture source within 30 days.",
            },
            "low": {
                "physics": f"Minor salt deposits ({area_pct}). Cosmetic issue, low structural impact.",
                "repair": f"PRIORITY-3 [{sev_up}]: Clean if desired. Apply protective sealant.",
            },
        },
    }
    
    class_exp = explanations.get(label, explanations["crack"])  # fallback
    severity_exp = class_exp.get(severity, class_exp.get("low"))
    
    return {
        "xai": class_exp["xai"],
        "physics": severity_exp["physics"],
        "repair": severity_exp["repair"],
    }


def _build_eigencam_heatmap(
    img: np.ndarray,
    activations: dict,
    masks: np.ndarray | None = None,
    boxes_xyxy: np.ndarray | None = None,
) -> str:
    """
    Improved EigenCAM heatmap generation with segmentation mask support.
    
    Key improvements over previous version:
    - Normalize activation maps BEFORE masking (better contrast)
    - Weighted layer fusion: 0.6×layer4 + 0.4×layer9 (more interpretable)
    - Minimal blur (only on bbox mask if needed, not on heatmap itself)
    - TURBO colormap (perceptually uniform, better than JET)
    - Prioritize segmentation masks over bounding boxes
    - Sharp defect boundaries with clean background cutoff
    
    Args:
        img: Input image (H×W×3, BGR)
        activations: Dict with layer activations {4: tensor, 9: tensor}
        masks: Segmentation masks from YOLO (N×H×W), optional
        boxes_xyxy: Bounding boxes [[x1,y1,x2,y2], ...], optional
    
    Returns:
        Base64-encoded PNG heatmap blended with original image
    """
    h, w = img.shape[:2]
    try:
        # Compute EigenCAM for early (layer 4) and late (layer 9) features
        h4_raw = _compute_eigen_cam(activations[4])
        h9_raw = _compute_eigen_cam(activations[9])

        # Resize to image dimensions
        h4 = cv2.resize(h4_raw, (w, h), interpolation=cv2.INTER_LINEAR)
        h9 = cv2.resize(h9_raw, (w, h), interpolation=cv2.INTER_LINEAR)

        # Improved fusion: weighted combination (not multiplicative)
        # Layer 4: early/detail features | Layer 9: semantic features
        fused = 0.6 * h4 + 0.4 * h9
        
        # **KEY FIX**: Normalize activation map BEFORE masking for proper contrast
        fused_min = fused.min()
        fused_max = fused.max()
        if fused_max - fused_min > 1e-8:
            fused = (fused - fused_min) / (fused_max - fused_min)
        else:
            fused = np.zeros_like(fused)

        # If no detections, return original image
        if masks is None and (boxes_xyxy is None or len(boxes_xyxy) == 0):
            success, buffer = cv2.imencode(".png", img)
            if success:
                return base64.b64encode(buffer.tobytes()).decode("utf-8")
            return ""

        # Build detection mask with priority: segmentation masks > bounding boxes
        detection_mask = np.zeros((h, w), dtype=np.float32)
        
        if masks is not None and len(masks) > 0:
            # Use actual segmentation masks (pixel-perfect accuracy)
            for seg_mask in masks:
                seg_normalized = seg_mask.astype(np.float32) / 255.0
                detection_mask = np.maximum(detection_mask, seg_normalized)
        elif boxes_xyxy is not None and len(boxes_xyxy) > 0:
            # Fallback: use bounding boxes with soft feathering
            for x1, y1, x2, y2 in boxes_xyxy:
                x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                detection_mask[y1:y2, x1:x2] = 1.0
            
            # Apply minimal Gaussian blur only to the bbox mask (not heatmap)
            # This creates soft boundaries without blurring activation details
            blur_size = max(int((boxes_xyxy[:, 2] - boxes_xyxy[:, 0]).mean() * 0.08) | 1, 3)
            blur_size = blur_size if blur_size % 2 == 1 else blur_size + 1
            detection_mask = cv2.GaussianBlur(detection_mask, (blur_size, blur_size), 0)

        # Apply mask to heatmap (soft multiplication)
        heatmap_masked = fused * detection_mask

        # Apply TURBO colormap (perceptually uniform, better than JET)
        # TURBO colormap: https://arxiv.org/abs/1908.06985
        # Falls back to JET on older OpenCV versions
        colormap_type = cv2.COLORMAP_TURBO if hasattr(cv2, 'COLORMAP_TURBO') else cv2.COLORMAP_JET
        
        heatmap_uint8 = np.uint8(255 * heatmap_masked)
        heatmap_colored = cv2.applyColorMap(heatmap_uint8, colormap_type)
        
        # Zero out low-confidence regions for clean background
        # Sharp cutoff at 0.02 to prevent background bleed
        heatmap_colored[detection_mask < 0.02] = 0

        # Blend with original image (50-50 by default)
        blended = cv2.addWeighted(img, HEATMAP_ALPHA, heatmap_colored, HEATMAP_BETA, 0)

        # Encode to PNG and return as base64
        success, buffer = cv2.imencode(".png", blended)
        if not success:
            raise RuntimeError("cv2.imencode failed")
        return base64.b64encode(buffer.tobytes()).decode("utf-8")

    except Exception as exc:
        logger.error("[analyzer] EigenCAM heatmap failed, returning original image: %s", exc)
        success, buffer = cv2.imencode(".png", img)
        if success:
            return base64.b64encode(buffer.tobytes()).decode("utf-8")
        return ""


def _build_diagnostics(anomalies: list[Anomaly], severity: str) -> str:
    if not anomalies:
        return (
            "No structural defects detected by YOLO inference. "
            "Surface integrity appears nominal. Continue scheduled monitoring."
        )

    critical = [a for a in anomalies if a.severity == "critical"]
    warnings = [a for a in anomalies if a.severity == "warning"]
    
    # Group by class
    by_class = {}
    for a in anomalies:
        by_class.setdefault(a.label, []).append(a)
    
    avg_conf = sum(a.confidence for a in anomalies) / len(anomalies)

    parts = [
        f"YOLO inference detected {len(anomalies)} defect(s) across {len(by_class)} class(es). "
        f"Overall severity: {severity}."
    ]
    
    for cls_name, defects in sorted(by_class.items()):
        parts.append(f"{len(defects)} {cls_name.upper()}(s) found. ")
    
    if critical:
        parts.append(
            f"{len(critical)} CRITICAL defect(s). "
            "Immediate structural assessment required. Restrict operations."
        )
    if warnings:
        parts.append(
            f"{len(warnings)} WARNING defect(s). Schedule maintenance within 30 days."
        )
    
    parts.append(
        f"Average confidence: {avg_conf * 100:.1f}%. "
        f"Model: {MODEL_VERSION}. "
        "Heatmap: EigenCAM (weighted layer-4 + layer-9 fusion) + mask-based rendering (TURBO colormap)."
    )
    
    return " ".join(parts)


# ── Main entry point ──────────────────────────────────────────────────────────

def analyze_image(image_bytes: bytes, location: str = "") -> AnalysisResponse:
    t0 = time.monotonic()

    img = _load_image(image_bytes)
    h, w = img.shape[:2]
    model = _get_model()

    # YOLO inference
    results = model(img, verbose=False, conf=CONF_THRESHOLD)
    r = results[0]

    boxes = r.boxes
    masks_yolo = r.masks  # segmentation masks if available

    # Capture EigenCAM activations
    activations = dict(_cam_hook.activations)

    anomalies: list[Anomaly] = []

    if boxes is not None and len(boxes) > 0:
        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        clss = boxes.cls.cpu().numpy()

        # Convert segmentation masks to numpy if available
        masks_np = None
        if masks_yolo is not None:
            try:
                masks_np = masks_yolo.data.cpu().numpy()  # (N, H, W)
            except Exception as exc:
                logger.warning("[analyzer] Could not extract masks: %s", exc)

        # Sort by confidence, cap at 10
        order = np.argsort(confs)[::-1][:10]

        for idx, i in enumerate(order):
            x1, y1, x2, y2 = xyxy[i]
            conf = float(confs[i])
            cls_id = int(clss[i])
            
            label, severity = _classify_detection(
                cls_id,
                conf,
                mask_area_ratio=0.02,  # placeholder; computed below
            )

            # Compute actual mask area if available
            if masks_np is not None and i < len(masks_np):
                mask_i = masks_np[i]
                mask_area_ratio = float(np.sum(mask_i) / (h * w))
                label, severity = _classify_detection(cls_id, conf, mask_area_ratio)
            else:
                # Fallback: bbox area
                bbox_area = (x2 - x1) * (y2 - y1)
                mask_area_ratio = float(bbox_area / (h * w))
                label, severity = _classify_detection(cls_id, conf, mask_area_ratio)

            # Generate XAI
            xai_dict = _generate_xai_multiclass(label, severity, conf, mask_area_ratio)

            anomaly = Anomaly(
                id=str(uuid.uuid4()),
                label=label,
                confidence=conf,
                bbox=BoundingBox(x=float(x1), y=float(y1), width=float(x2 - x1), height=float(y2 - y1)),
                severity=severity,
                area_ratio=mask_area_ratio,
                xai=xai_dict["xai"],
                physics_analysis=xai_dict["physics"],
                repair_recommendation=xai_dict["repair"],
            )
            anomalies.append(anomaly)

    # Determine overall severity
    if anomalies:
        if any(a.severity == "critical" for a in anomalies):
            overall_severity = "critical"
        elif any(a.severity == "warning" for a in anomalies):
            overall_severity = "warning"
        else:
            overall_severity = "low"
    else:
        overall_severity = "low"

    # Build heatmap
    heatmap_b64 = _build_eigencam_heatmap(
        img,
        activations,
        masks=masks_np if masks_np is not None else None,
        boxes_xyxy=xyxy if boxes is not None and len(boxes) > 0 else None,
    )

    # Build diagnostics
    diagnostics = _build_diagnostics(anomalies, overall_severity)

    elapsed = time.monotonic() - t0

    return AnalysisResponse(
        id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        location=location,
        image_original=base64.b64encode(
            cv2.imencode(".png", img)[1].tobytes()
        ).decode("utf-8") if cv2.imencode(".png", img)[0] else "",
        image_heatmap=heatmap_b64,
        anomalies=anomalies,
        overall_severity=overall_severity,
        diagnostics=diagnostics,
        model_version=MODEL_VERSION,
        inference_time_ms=round(elapsed * 1000, 2),
    )
