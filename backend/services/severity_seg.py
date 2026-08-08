"""
services/severity_seg.py

Mask-based, multi-class severity scoring — extension for analyzer.py once the
new yolo11s-seg (Cracks / Corrosion / Efflorescence) model replaces
Top_Performance.pt (single-class crack, bbox-area-ratio severity).

Design goals, matching the existing analyzer.py conventions:
  - Same severity taxonomy: "critical" / "warning" / "low" (per-anomaly),
    "HIGH" / "MEDIUM" / "LOW" / "NONE" (overall) — unchanged, no schema break.
  - Same function shapes as the current _classify_detection / _generate_xai,
    so analyze_image() only needs its area-ratio computation swapped from
    bbox-based to mask-based; everything downstream (Anomaly construction,
    diagnostics, heatmap) is untouched.
  - Per-class thresholds, not one global threshold — bbox-area-ratio
    thresholds tuned for Cracks (thin, small area) are not meaningful for
    Efflorescence (diffuse, large area) or Corrosion (variable). Using one
    threshold for all three would systematically misclassify severity for
    at least two of the three classes.

Not yet wired into analyzer.py — swap in once yolo11s-seg training/eval is
complete and per-class threshold values below are calibrated against real
validation-set area-ratio distributions (see calibration note at bottom).
"""

from __future__ import annotations

import numpy as np

# ── Class taxonomy ────────────────────────────────────────────────────────
# Must match the trained model's class index order exactly — verify against
# data.yaml `names:` before deploying. Mismatched order silently corrupts
# every downstream severity call.
CLASS_NAMES = {0: "CORROSION", 1: "CRACK", 2: "EFFLORESCENCE"}

# ── Per-class severity thresholds (mask area ratio) ──────────────────────
# PLACEHOLDER VALUES — copied from the existing single-class bbox thresholds
# as a starting point only. These MUST be recalibrated per class using real
# mask-area-ratio distributions from the validation set once training
# completes (see calibration note at bottom of file). Do not ship with
# these defaults unreviewed.
SEVERITY_THRESHOLDS = {
    "CORROSION":     {"critical": 0.06, "warning": 0.02},
    "CRACK":         {"critical": 0.04, "warning": 0.01},  # matches current prod values
    "EFFLORESCENCE": {"critical": 0.10, "warning": 0.04},  # diffuse defect, expect larger true area
}

CONF_CRITICAL = 0.80   # unchanged from existing analyzer.py convention
CONF_WARNING  = 0.50


def compute_mask_area_ratio(mask: np.ndarray, image_shape: tuple[int, int]) -> float:
    """
    Pixel-accurate area ratio from a segmentation mask.

    Uses raw pixel count from the binary/probability mask rather than the
    mask's extracted polygon vertices — sidesteps polygon self-intersection
    issues (seen during SAM-based mask generation) that can corrupt
    shoelace-formula area calculations on thin/elongated shapes.

    Args:
        mask: (H, W) array — binary or soft mask for one instance, already
              resized to image_shape if needed.
        image_shape: (H, W) of the source image.

    Returns:
        Area ratio in [0, 1].
    """
    h, w = image_shape
    total_pixels = h * w
    if total_pixels == 0:
        return 0.0
    mask_pixels = float(mask.sum())
    return mask_pixels / total_pixels


def classify_detection_multiclass(
    conf: float,
    mask_area_ratio: float,
    class_id: int,
) -> tuple[str, str]:
    """
    Multi-class equivalent of the existing _classify_detection().

    Same signature shape (returns (label, severity)) and same severity
    vocabulary, generalized to look up per-class thresholds instead of
    the single global CRITICAL_AREA_RATIO / WARNING_AREA_RATIO constants.
    """
    label = CLASS_NAMES.get(class_id, f"UNKNOWN_CLASS_{class_id}")
    thresholds = SEVERITY_THRESHOLDS.get(label)

    if thresholds is None:
        # Unrecognized class id — fail safe to "warning" rather than silently
        # defaulting to "low", so an unexpected class doesn't get quietly
        # under-reported.
        return label, "warning"

    if mask_area_ratio >= thresholds["critical"] or conf >= CONF_CRITICAL:
        return label, "critical"
    if mask_area_ratio >= thresholds["warning"] or conf >= CONF_WARNING:
        return label, "warning"
    return label, "low"


def generate_xai_multiclass(
    label: str, severity: str, conf: float, area_ratio: float
) -> dict[str, str]:
    """
    Multi-class equivalent of the existing _generate_xai(). Same three-key
    return shape (xai / physics / repair), same PRIORITY-N convention,
    with class-specific physics/repair language instead of crack-only text.
    """
    conf_pct = f"{conf * 100:.1f}%"
    area_pct = f"{area_ratio * 100:.2f}%"
    label_up = label.upper()
    sev_up   = severity.upper()

    xai = (
        f"YOLO segmentation detected {label_up} with {conf_pct} confidence. "
        f"Segmentation mask covers {area_pct} of the image area. "
        f"EigenCAM activation (layer-4 x layer-9 SVD fusion) is concentrated "
        + ("across the full defect extent, indicating large spatial coverage. "
           if severity == "critical" else
           "at the defect boundary, indicating localised extent. ")
        + f"Severity classified as {sev_up} based on mask area ratio and confidence."
    )

    physics_by_class = {
        "CRACK": {
            "critical": (
                f"Crack spatial extent ({area_pct} of image) suggests advanced propagation "
                "under sustained tensile or shear loading. Potential for brittle failure if "
                "load is not redistributed. Consistent with ACI 318-19 criteria for critical defects."
            ),
            "warning": (
                f"Crack dimensions ({area_pct} of image, confidence {conf_pct}) within "
                "ACI 224R-01 monitoring threshold. Likely thermal cycling, shrinkage stress, "
                "or minor overload. Requires monitoring for propagation rate and depth."
            ),
            "low": (
                f"Crack detected at low spatial extent ({area_pct} of image) with "
                f"{conf_pct} confidence. Consistent with early-stage surface defect or "
                "minor shrinkage crack. No immediate structural risk indicated."
            ),
        },
        "CORROSION": {
            "critical": (
                f"Corrosion coverage ({area_pct} of image) suggests significant section loss "
                "in underlying reinforcement is likely. Rust-induced expansion may be driving "
                "concomitant spalling. Consistent with advanced-stage corrosion per ACI 222R."
            ),
            "warning": (
                f"Corrosion staining ({area_pct} of image, confidence {conf_pct}) indicates "
                "active oxidation, likely from chloride ingress or carbonation reaching "
                "reinforcement depth. Section loss not yet visually confirmed."
            ),
            "low": (
                f"Minor corrosion staining detected ({area_pct} of image) with {conf_pct} "
                "confidence. Consistent with early-stage surface oxidation. No confirmed "
                "reinforcement exposure."
            ),
        },
        "EFFLORESCENCE": {
            "critical": (
                f"Efflorescence coverage ({area_pct} of image) indicates substantial, sustained "
                "moisture migration through the structure. Often co-occurs with underlying "
                "crack or joint pathways requiring separate investigation."
            ),
            "warning": (
                f"Efflorescence deposits ({area_pct} of image, confidence {conf_pct}) indicate "
                "ongoing moisture ingress. Source pathway (crack, joint, drainage failure) "
                "should be identified during inspection."
            ),
            "low": (
                f"Minor efflorescence detected ({area_pct} of image) with {conf_pct} confidence. "
                "Consistent with localized moisture exposure. Low structural concern; note "
                "as a moisture-management indicator."
            ),
        },
    }

    repair_by_class = {
        "CRACK": {
            "critical": (
                f"PRIORITY-1 [{sev_up}]: Immediately restrict load-bearing operations. "
                "Perform physical inspection within 24 hours. Inject epoxy resin under pressure. "
                "Install crack monitors and conduct load test post-repair."
            ),
            "warning": (
                f"PRIORITY-2 [{sev_up}]: Apply crack sealant (polyurethane or epoxy injection). "
                "Schedule structural inspection within 30 days. "
                "Monitor crack width monthly with crack comparator card."
            ),
            "low": (
                f"PRIORITY-3 [{sev_up}]: Document and monitor. Re-inspect within 90 days. "
                "Apply surface sealant if crack width exceeds 0.2 mm."
            ),
        },
        "CORROSION": {
            "critical": (
                f"PRIORITY-1 [{sev_up}]: Restrict load-bearing operations pending inspection. "
                "Expose and assess reinforcement section loss within 24-48 hours. "
                "Plan concrete removal, rebar treatment/replacement, and patch repair."
            ),
            "warning": (
                f"PRIORITY-2 [{sev_up}]: Schedule reinforcement inspection within 30 days. "
                "Apply corrosion-inhibiting treatment to exposed/at-risk surfaces. "
                "Monitor staining extent quarterly."
            ),
            "low": (
                f"PRIORITY-3 [{sev_up}]: Document and monitor. Re-inspect within 90 days. "
                "Consider protective coating to limit further oxidation."
            ),
        },
        "EFFLORESCENCE": {
            "critical": (
                f"PRIORITY-2 [{sev_up}]: Identify and remediate moisture source within 30 days. "
                "Investigate for co-occurring cracks/joint failures as ingress pathway. "
                "Clean deposits and assess for efflorescence-driven material degradation."
            ),
            "warning": (
                f"PRIORITY-2 [{sev_up}]: Investigate moisture source. "
                "Schedule inspection within 60 days. Clean visible deposits."
            ),
            "low": (
                f"PRIORITY-3 [{sev_up}]: Document and monitor. Re-inspect within 90 days."
            ),
        },
    }

    physics = physics_by_class.get(label_up, physics_by_class["CRACK"]).get(severity, "")
    repair  = repair_by_class.get(label_up, repair_by_class["CRACK"]).get(severity, "")

    return {"xai": xai, "physics": physics, "repair": repair}


# ── Calibration note ──────────────────────────────────────────────────────
# SEVERITY_THRESHOLDS above are placeholders. Before deploying:
#
#   1. Run the trained yolo11s-seg model over the held-out validation set.
#   2. For each class, collect the mask-area-ratio distribution across all
#      true-positive detections.
#   3. Set "warning" ~ the 70th percentile and "critical" ~ the 90th
#      percentile of that per-class distribution (or align with an SME's
#      judgment of what area coverage constitutes each severity tier —
#      domain expertise should take precedence over a purely statistical cut
#      if the two disagree).
#   4. Record the chosen values and their justification in DATA_SOURCES.md
#      or an equivalent decision log, same discipline as the dataset
#      provenance notes — a threshold with no stated rationale is not
#      defensible if questioned later.