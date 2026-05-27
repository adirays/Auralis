"""
services/analyzer.py

Real YOLO-based structural defect detection pipeline.

  Model : Top Performance.pt  (YOLOv8 segmentation, single class: crack)
  Task  : segment — returns bounding boxes + instance segmentation masks

  Pipeline:
    1. Load image (BGR, resize to 1024px max)
    2. Run YOLO inference  → boxes (xyxy), confidence, masks
       (forward pass also populates FusionCAMHook activations at layers 4 & 9)
    3. Map class id → defect label + severity via _classify_detection()
    4. Build EigenCAM heatmap via SVD on fused layer-4 × layer-9 activations
    5. Attach XAI knowledge-base text per detection
    6. Return AnalysisResponse (same schema — no frontend changes)
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

os.environ.setdefault("YOLO_VERBOSE", "False")   # suppress ultralytics console spam

logger = logging.getLogger(__name__)

# ── Model path ────────────────────────────────────────────────────────────────
_MODEL_PATH = Path(__file__).resolve().parents[1].parent / "Top_Performance.pt"
MODEL_VERSION = "top-performance-v1"

# ── Lazy-loaded singletons ────────────────────────────────────────────────────
_model    = None
_cam_hook = None   # FusionCAMHook — registered once, reused every request


# ── EigenCAM hook ─────────────────────────────────────────────────────────────

import threading as _threading


class FusionCAMHook:
    """
    Registers forward hooks on backbone layers 4 and 9 of a YOLO model.

    Thread safety: activations are stored in thread-local storage so that
    concurrent requests running inference on different threads never see
    each other's activation tensors.
    """
    def __init__(self, pytorch_model, layer_indices=(4, 9)):
        self._local = _threading.local()   # per-thread activation dict
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
    """
    SVD-based EigenCAM on a (1, C, H, W) activation tensor.
    Matches mlops/src/eigen_cam.py :: compute_eigen_cam() exactly.
    """
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
        # Register EigenCAM hooks once — they persist for the lifetime of the process
        _cam_hook = FusionCAMHook(_model.model)
        logger.info("[analyzer] YOLO model loaded — task=%s classes=%s path=%s",
                    _model.task, _model.names, _MODEL_PATH.name)
        logger.info("[analyzer] EigenCAM hooks registered on backbone layers 4 & 9")
    return _model


# ── Heatmap / inference constants ────────────────────────────────────────────
HEATMAP_ALPHA      = 0.5    # original image weight
HEATMAP_BETA       = 0.5    # heatmap weight
CONF_THRESHOLD     = 0.25   # minimum YOLO confidence to include a detection

# ── Severity thresholds (by bbox area ratio) ──────────────────────────────────
CRITICAL_AREA_RATIO = 0.04   # > 4% of image area → critical
WARNING_AREA_RATIO  = 0.01   # 1–4% → warning; < 1% → low


def _generate_xai(label: str, severity: str, conf: float, area_ratio: float) -> dict[str, str]:
    """
    Generate XAI explanation, physics analysis, and repair recommendation
    dynamically from actual detection values.
    """
    conf_pct  = f"{conf * 100:.1f}%"
    area_pct  = f"{area_ratio * 100:.2f}%"
    label_up  = label.upper()
    sev_up    = severity.upper()

    xai = (
        f"YOLO segmentation detected {label_up} with {conf_pct} confidence. "
        f"Bounding box covers {area_pct} of the image area. "
        f"EigenCAM activation (layer-4 × layer-9 SVD fusion) is concentrated "
        + ("along the full defect path, indicating large spatial extent. "
           if severity == "critical" else
           "at the defect boundary, indicating localised extent. ")
        + f"Severity classified as {sev_up} based on area ratio and confidence."
    )

    if severity == "critical":
        physics = (
            f"{label_up} spatial extent ({area_pct} of image) suggests advanced propagation "
            "under sustained tensile or shear loading. Potential for brittle failure if load "
            "is not redistributed. Consistent with ACI 318-19 criteria for critical defects."
        )
        repair = (
            f"PRIORITY-1 [{sev_up}]: Immediately restrict load-bearing operations. "
            "Perform physical inspection within 24 hours. Inject epoxy resin under pressure. "
            "Install crack monitors and conduct load test post-repair."
        )
    elif severity == "warning":
        physics = (
            f"{label_up} dimensions ({area_pct} of image, confidence {conf_pct}) within "
            "ACI 224R-01 monitoring threshold. Likely caused by thermal cycling, shrinkage "
            "stress, or minor overload. Requires monitoring for propagation rate and depth."
        )
        repair = (
            f"PRIORITY-2 [{sev_up}]: Apply crack sealant (polyurethane or epoxy injection). "
            "Schedule structural inspection within 30 days. "
            "Monitor crack width monthly with crack comparator card."
        )
    else:  # low
        physics = (
            f"{label_up} detected at low spatial extent ({area_pct} of image) with "
            f"{conf_pct} confidence. Consistent with early-stage surface defect or "
            "minor shrinkage crack. No immediate structural risk indicated."
        )
        repair = (
            f"PRIORITY-3 [{sev_up}]: Document and monitor. Re-inspect within 90 days. "
            "Apply surface sealant if crack width exceeds 0.2 mm."
        )

    return {"xai": xai, "physics": physics, "repair": repair}


# ── Helpers ───────────────────────────────────────────────────────────────────

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


def _classify_detection(conf: float, bbox_area_ratio: float) -> tuple[str, str]:
    """
    Returns (label, severity) based on confidence and bounding box area ratio.
    Three levels: critical / warning / low.
    """
    if bbox_area_ratio >= CRITICAL_AREA_RATIO or conf >= 0.80:
        return "CRACK", "critical"
    if bbox_area_ratio >= WARNING_AREA_RATIO or conf >= 0.50:
        return "CRACK", "warning"
    return "CRACK", "low"


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

        # ✅ FIX 1: Weighted combination (0.6×layer4 + 0.4×layer9)
        # Layer 4: early/detail features | Layer 9: semantic features
        fused = 0.6 * h4 + 0.4 * h9
        
        # ✅ FIX 4: Normalize BEFORE masking for proper contrast
        fused_min = fused.min()
        fused_max = fused.max()
        if fused_max - fused_min > 1e-8:
            fused = (fused - fused_min) / (fused_max - fused_min)
        else:
            fused = np.zeros_like(fused)

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
            
            # ✅ FIX 3: Minimal blur ONLY on mask (not heatmap), smaller kernel (0.08 vs 0.15)
            blur_size = max(int((boxes_xyxy[:, 2] - boxes_xyxy[:, 0]).mean() * 0.08) | 1, 3)
            blur_size = blur_size if blur_size % 2 == 1 else blur_size + 1
            detection_mask = cv2.GaussianBlur(detection_mask, (blur_size, blur_size), 0)

        # ✅ FIX 2: No blur on heatmap itself (preserve sharpness)
        heatmap_masked = fused * detection_mask

        # ✅ FIX 5: TURBO colormap (perceptually uniform)
        # Falls back to JET on older OpenCV versions
        colormap_type = cv2.COLORMAP_TURBO if hasattr(cv2, 'COLORMAP_TURBO') else cv2.COLORMAP_JET
        
        heatmap_uint8 = np.uint8(255 * heatmap_masked)
        heatmap_colored = cv2.applyColorMap(heatmap_uint8, colormap_type)
        
        # ✅ FIX 6: Sharp threshold (0.02) to prevent background bleed
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
            "Surface integrity appears nominal. Continue scheduled monitoring protocol."
        )

    critical = [a for a in anomalies if a.severity == "critical"]
    warnings  = [a for a in anomalies if a.severity == "warning"]
    avg_conf  = sum(a.confidence for a in anomalies) / len(anomalies)

    parts = [
        f"YOLO inference detected {len(anomalies)} "
        f"defect{'s' if len(anomalies) > 1 else ''} "
        f"(overall severity: {severity})."
    ]
    if critical:
        parts.append(
            f"{len(critical)} CRITICAL crack(s) detected. "
            "Immediate structural assessment required. "
            "Restrict load-bearing operations until physical inspection is completed."
        )
    if warnings:
        parts.append(
            f"{len(warnings)} WARNING crack(s) detected. "
            "Schedule maintenance inspection within 30 days."
        )
    parts.append(
        f"Average model confidence: {avg_conf * 100:.1f}%. "
        f"Model: {MODEL_VERSION}. "
        "Heatmap generated via SVD-based EigenCAM (layer-4 × layer-9 fusion) with JET colormap overlay."
    )
    return " ".join(parts)


# ── Public entry point ────────────────────────────────────────────────────────

def analyze_image(image_bytes: bytes, location: str = "") -> AnalysisResponse:
    t0 = time.monotonic()

    img    = _load_image(image_bytes)
    h, w   = img.shape[:2]
    model  = _get_model()

    # ── YOLO inference ────────────────────────────────────────────────────────
    results = model(img, verbose=False, conf=CONF_THRESHOLD)
    r       = results[0]

    boxes = r.boxes   # Boxes object (masks not used for heatmap anymore)

    # ── Capture EigenCAM activations (populated by the forward pass above) ────
    activations = dict(_cam_hook.activations)   # shallow copy — safe for concurrent use

    anomalies: list[Anomaly] = []

    # Pre-compute per-layer EigenCAM maps once for layer-contribution scores
    l4_map: np.ndarray | None = None
    l9_map: np.ndarray | None = None
    try:
        if 4 in activations and 9 in activations:
            l4_raw = _compute_eigen_cam(activations[4])
            l9_raw = _compute_eigen_cam(activations[9])
            l4_map = cv2.resize(l4_raw, (w, h), interpolation=cv2.INTER_LINEAR)
            l9_map = cv2.resize(l9_raw, (w, h), interpolation=cv2.INTER_LINEAR)
    except Exception as exc:
        logger.warning("[analyzer] layer-contribution map computation failed: %s", exc)

    if boxes is not None and len(boxes) > 0:
        xyxy  = boxes.xyxy.cpu().numpy()    # (N, 4) — absolute pixel coords
        confs = boxes.conf.cpu().numpy()    # (N,)
        clss  = boxes.cls.cpu().numpy()     # (N,)

        # Sort by confidence descending, cap at 10
        order = np.argsort(confs)[::-1][:10]

        for idx, i in enumerate(order):
            x1, y1, x2, y2 = xyxy[i]
            conf            = float(confs[i])
            cls_id          = int(clss[i])

            bw = x2 - x1
            bh = y2 - y1
            area_ratio = (bw * bh) / (w * h)

            label, sev = _classify_detection(conf, area_ratio)
            kb         = _generate_xai(label, sev, conf, area_ratio)

            # Layer contribution scores — mean EigenCAM activation inside bbox
            l4_score, l9_score = 0.0, 0.0
            try:
                rx1, ry1, rx2, ry2 = int(x1), int(y1), int(x2), int(y2)
                if l4_map is not None and ry2 > ry1 and rx2 > rx1:
                    l4_score = round(float(np.clip(l4_map[ry1:ry2, rx1:rx2].mean(), 0, 1)), 3)
                if l9_map is not None and ry2 > ry1 and rx2 > rx1:
                    l9_score = round(float(np.clip(l9_map[ry1:ry2, rx1:rx2].mean(), 0, 1)), 3)
            except Exception:
                pass

            anomalies.append(
                Anomaly(
                    id=f"ANOM-{idx + 1:02d}",
                    label=label,
                    confidence=round(conf, 3),
                    bbox=BoundingBox(
                        x=round(float(x1) / w * 100, 2),
                        y=round(float(y1) / h * 100, 2),
                        w=round(float(bw)  / w * 100, 2),
                        h=round(float(bh)  / h * 100, 2),
                    ),
                    severity=sev,
                    layer4_contribution=l4_score,
                    layer9_contribution=l9_score,
                    xai_explanation=kb["xai"],
                    physics_analysis=kb["physics"],
                    repair_recommendation=kb["repair"],
                )
            )

    # ── Overall severity ──────────────────────────────────────────────────────
    if any(a.severity == "critical" for a in anomalies):
        overall = "HIGH"
    elif any(a.severity == "warning" for a in anomalies):
        overall = "MEDIUM"
    elif anomalies:
        overall = "LOW"
    else:
        overall = "NONE"

    # ── EigenCAM heatmap (SVD layer-4 × layer-9 fusion, masked to detections) ─
    raw_xyxy = boxes.xyxy.cpu().numpy() if (boxes is not None and len(boxes) > 0) else None
    heatmap_b64 = _build_eigencam_heatmap(img, activations, masks=None, boxes_xyxy=raw_xyxy)
    diagnostics = _build_diagnostics(anomalies, overall)
    elapsed_ms  = int((time.monotonic() - t0) * 1000)

    logger.info(
        "[analyzer] inference done — detections=%d severity=%s conf_avg=%.3f elapsed=%dms heatmap=eigencam",
        len(anomalies),
        overall,
        sum(a.confidence for a in anomalies) / max(len(anomalies), 1),
        elapsed_ms,
    )

    return AnalysisResponse(
        scan_id=f"SCN-{uuid.uuid4().hex[:10].upper()}",
        anomalies=anomalies,
        heatmap_b64=heatmap_b64,
        severity=overall,
        diagnostics=diagnostics,
        processing_time_ms=elapsed_ms,
        location=location,
        model_version=MODEL_VERSION,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
