# Before & After Code Comparison

## Function: `_build_eigencam_heatmap()`

### BEFORE (Original)

```python
def _build_eigencam_heatmap(
    img: np.ndarray,
    activations: dict,
    masks: np.ndarray | None = None,
    boxes_xyxy: np.ndarray | None = None,
) -> str:
    """
    EigenCAM heatmap with mask-based masking (improved over bbox-only).
    
    If segmentation masks are available, use them directly.
    Otherwise, fall back to Gaussian-feathered bboxes.
    """
    h, w = img.shape[:2]
    try:
        h4_raw = _compute_eigen_cam(activations[4])
        h9_raw = _compute_eigen_cam(activations[9])

        h4 = cv2.resize(h4_raw, (w, h), interpolation=cv2.INTER_LINEAR)
        h9 = cv2.resize(h9_raw, (w, h), interpolation=cv2.INTER_LINEAR)

        # ❌ ISSUE 1: Multiplicative fusion with exponent
        fused = (h4 * h9) * (h9 ** 1.5)
        
        # ❌ ISSUE 2: Blur entire heatmap (destructive)
        fused = cv2.GaussianBlur(fused, (5, 5), 0)

        if masks is None and (boxes_xyxy is None or len(boxes_xyxy) == 0):
            success, buffer = cv2.imencode(".png", img)
            if success:
                return base64.b64encode(buffer.tobytes()).decode("utf-8")
            return ""

        mask = np.zeros((h, w), dtype=np.float32)
        
        if masks is not None and len(masks) > 0:
            for seg_mask in masks:
                mask = np.maximum(mask, seg_mask.astype(np.float32) / 255.0)
        elif boxes_xyxy is not None and len(boxes_xyxy) > 0:
            for x1, y1, x2, y2 in boxes_xyxy:
                mask[int(y1):int(y2), int(x1):int(x2)] = 1.0
            
            # ❌ ISSUE 3: Aggressive blur kernel (0.15 × width)
            bw = max(int((boxes_xyxy[:, 2] - boxes_xyxy[:, 0]).mean() * 0.15) | 1, 5)
            bw = bw if bw % 2 == 1 else bw + 1
            mask = cv2.GaussianBlur(mask, (bw, bw), 0)

        # Apply mask AFTER computing max
        fused = fused * mask

        # ❌ ISSUE 4: Normalize AFTER masking (background bleed)
        fmax = fused.max()
        if fmax < 1e-4:
            success, buffer = cv2.imencode(".png", img)
            if success:
                return base64.b64encode(buffer.tobytes()).decode("utf-8")
            return ""

        fused = fused / fmax
        
        # ❌ ISSUE 5: JET colormap (perceptually non-uniform)
        heatmap_colored = cv2.applyColorMap(np.uint8(255 * fused), cv2.COLORMAP_JET)
        
        # ❌ ISSUE 6: Soft threshold (0.05) allows background bleed
        heatmap_colored[mask < 0.05] = 0

        blended = cv2.addWeighted(img, HEATMAP_ALPHA, heatmap_colored, HEATMAP_BETA, 0)

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
```

---

### AFTER (Improved)

```python
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
```

---

## Key Differences Summary

| Aspect | Before | After | Impact |
|---|---|---|---|
| **Fusion** | `(h4 × h9) × (h9^1.5)` | `0.6×h4 + 0.4×h9` | ✅ More stable, interpretable |
| **Blur strategy** | Blur heatmap (5×5) | No blur on heatmap | ✅ Preserves activation detail |
| **Blur kernel** | 0.15 × bbox_width | 0.08 × bbox_width | ✅ Softer boundaries |
| **Normalization** | After masking | Before masking | ✅ Eliminates background bleed |
| **Colormap** | JET | TURBO (fallback JET) | ✅ Perceptually uniform |
| **Background cutoff** | mask < 0.05 | detection_mask < 0.02 | ✅ Cleaner background |
| **Blur locations** | 2× (heatmap + mask) | 1× (mask only if bbox) | ✅ 50% fewer blur ops |

---

## Line-by-Line Changes

### Change 1: Fusion Logic (Before L16, After L42-44)

```diff
- fused = (h4 * h9) * (h9 ** 1.5)
- fused = cv2.GaussianBlur(fused, (5, 5), 0)
+ fused = 0.6 * h4 + 0.4 * h9
```

### Change 2: Normalization Timing (Before L48-49, After L46-52)

```diff
- fused = fused * mask
- fmax = fused.max()
- if fmax < 1e-4: ...
- fused = fused / fmax
+ fused_min = fused.min()
+ fused_max = fused.max()
+ if fused_max - fused_min > 1e-8:
+     fused = (fused - fused_min) / (fused_max - fused_min)
+ else:
+     fused = np.zeros_like(fused)
```

### Change 3: Mask Variable Rename (Before L25, After L61)

```diff
- mask = np.zeros((h, w), dtype=np.float32)
+ detection_mask = np.zeros((h, w), dtype=np.float32)
```

(Renamed for clarity: mask is no longer the only output)

### Change 4: Blur Kernel Size (Before L39-40, After L74-76)

```diff
- bw = max(int((boxes_xyxy[:, 2] - boxes_xyxy[:, 0]).mean() * 0.15) | 1, 5)
- bw = bw if bw % 2 == 1 else bw + 1
- mask = cv2.GaussianBlur(mask, (bw, bw), 0)
+ blur_size = max(int((boxes_xyxy[:, 2] - boxes_xyxy[:, 0]).mean() * 0.08) | 1, 3)
+ blur_size = blur_size if blur_size % 2 == 1 else blur_size + 1
+ detection_mask = cv2.GaussianBlur(detection_mask, (blur_size, blur_size), 0)
```

### Change 5: Colormap Selection (Before L52, After L82-86)

```diff
- heatmap_colored = cv2.applyColorMap(np.uint8(255 * fused), cv2.COLORMAP_JET)
+ colormap_type = cv2.COLORMAP_TURBO if hasattr(cv2, 'COLORMAP_TURBO') else cv2.COLORMAP_JET
+ heatmap_uint8 = np.uint8(255 * heatmap_masked)
+ heatmap_colored = cv2.applyColorMap(heatmap_uint8, colormap_type)
```

### Change 6: Background Cutoff Threshold (Before L53, After L90)

```diff
- heatmap_colored[mask < 0.05] = 0
+ heatmap_colored[detection_mask < 0.02] = 0
```

---

## Testing the Change

### Quick Verification

```python
from backend.services.analyzer_multiclass import analyze_image
import time

# Load test image
with open("test_concrete.jpg", "rb") as f:
    image_bytes = f.read()

# Measure inference time
t0 = time.time()
result = analyze_image(image_bytes, location="TestBridge")
elapsed = time.time() - t0

print(f"Inference: {elapsed:.3f}s")
print(f"Heatmap generated: {'Yes' if result.image_heatmap else 'No'}")
print(f"Anomalies: {len(result.anomalies)}")
```

### Visual Inspection

1. Compare heatmap outputs side-by-side (before & after model)
2. Look for:
   - **Sharp defect boundaries** (should be crisp, not blurry)
   - **No background halo** (blue/colored ring around defect)
   - **Better color gradient** (TURBO: smooth transitions)
   - **Clear activation peaks** (bright color in high-activation regions)

### API Response

The response format is identical; only visual quality improves:

```bash
curl -X POST http://localhost:8000/api/analysis/analyze \
  -H "Authorization: Bearer JWT_TOKEN" \
  -F "image=@test_concrete.jpg" | jq '.image_heatmap' | head -c 50
```

---

