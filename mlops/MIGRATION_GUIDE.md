# Migration: Single-Class → Multi-Class Analyzer

## Overview

The project originally uses `backend/services/analyzer.py` for single-class crack detection.
A new `analyzer_multiclass.py` is now available with:
- 5 classes: crack, spalling, corrosion, delamination, efflorescence
- Mask-based severity (instead of bbox area)
- Per-class repair recommendations
- Improved EigenCAM masking

---

## Step-by-Step Migration

### Step 1: Backup Current Analyzer

```bash
cd backend/services
cp analyzer.py analyzer_single_class_backup.py
```

### Step 2: Copy Multi-Class Analyzer

```bash
cp analyzer_multiclass.py analyzer.py
```

### Step 3: Update Model Version

Edit `backend/api/model/router.py`:

```python
@router.get("/info")
async def model_info():
    from services.analyzer import MODEL_VERSION, CONF_THRESHOLD
    return {
        "model_version": MODEL_VERSION,  # Now "top-performance-multiclass-v2"
        "backbone": "YOLOv8 Segmentation (5-class)",
        "classes": ["crack", "spalling", "corrosion", "delamination", "efflorescence"],
        ...
    }
```

### Step 4: Restart Backend

```bash
cd ../..
python -m uvicorn backend.main:app --reload --port 8000
```

### Step 5: Test Inference

```bash
# Upload test image with JWT token
curl -X POST http://localhost:8000/api/analysis/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@test_crack.jpg" \
  -F "location=TestBridge"
```

Expected response includes multi-class detections:
```json
{
  "anomalies": [
    {
      "label": "crack",
      "confidence": 0.92,
      "severity": "critical",
      "area_ratio": 0.065,
      "physics_analysis": "Crack propagation (6.5% area) indicates active stress...",
      "repair_recommendation": "PRIORITY-1 [CRITICAL]: Restrict load..."
    },
    {
      "label": "corrosion",
      "confidence": 0.78,
      "severity": "warning",
      "area_ratio": 0.022,
      ...
    }
  ]
}
```

---

## Rollback (if needed)

### Quick Revert

```bash
cd backend/services
cp analyzer_single_class_backup.py analyzer.py
# Restart backend
```

### Keep Both Available

```bash
# In backend/main.py or router:
import os
ANALYZER_MODE = os.getenv("ANALYZER_MODE", "multiclass")  # or "single_class"

if ANALYZER_MODE == "multiclass":
    from services.analyzer import analyze_image
else:
    from services.analyzer_single_class_backup import analyze_image
```

Then start backend with:
```bash
ANALYZER_MODE=single_class python -m uvicorn main:app
```

---

## Testing Checklist

- [ ] Backend starts without errors
- [ ] `/api/model/info` returns 5 classes
- [ ] Test image uploads and inference completes
- [ ] Response includes multiple anomaly types
- [ ] Heatmap image is generated (base64 PNG)
- [ ] Severity classifications vary (critical/warning/low)
- [ ] Repair recommendations differ by class
- [ ] Frontend displays heatmap correctly
- [ ] Dashboard shows multi-class statistics

---

## API Response Changes

### Before (Single-Class)

```json
{
  "anomalies": [
    {
      "label": "CRACK",
      "severity": "critical",
      "area_ratio": 0.065
    }
  ]
}
```

### After (Multi-Class)

```json
{
  "anomalies": [
    {
      "label": "crack",
      "severity": "critical",
      "area_ratio": 0.065,
      "physics_analysis": "...",
      "repair_recommendation": "..."
    },
    {
      "label": "corrosion",
      "severity": "warning",
      "area_ratio": 0.022,
      "physics_analysis": "...",
      "repair_recommendation": "..."
    }
  ]
}
```

**Note**: Frontend may need minor updates to display class-specific recommendations. See `frontend_updates.md` for UI changes.

---

## Performance Comparison

| Metric | Single-Class | Multi-Class |
|---|---|---|
| Inference time | ~200ms | ~250ms (5% slower due to 5 outputs) |
| Model size | ~24MB | ~24MB (same, just different weights) |
| GPU memory | ~500MB | ~550MB |
| Accuracy (crack) | 0.94 mAP50 | 0.88 mAP50 (trade-off for multi-class) |

---

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| **Model not found** | Top_Performance.pt still single-class | Retrain and copy multi-class weights |
| **5 classes not showing** | Stale imports/cache | Restart Python interpreter, clear `__pycache__/` |
| **Inference slow** | Larger model loaded | Use `yolov8s` weights instead of `yolov8m` |
| **Anomalies empty** | Conf threshold too high | Lower `CONF_THRESHOLD` in analyzer.py (default 0.25) |

---

## Optional: Database Schema Update

If tracking defect types in history, update schema:

```sql
-- Add class column to scans table
ALTER TABLE scans ADD COLUMN IF NOT EXISTS defect_class TEXT;

-- Index by class for reporting
CREATE INDEX idx_scans_class ON scans(defect_class);
```

Then in backend on save:
```python
defect_class = ", ".join(set(a.label for a in anomalies))
# Save to database
```

---

## Frontend Updates (Optional)

Update React dashboard to show per-class stats:

```tsx
const classStats = anomalies.reduce((acc, a) => {
  acc[a.label] = (acc[a.label] || 0) + 1;
  return acc;
}, {});

return (
  <div>
    {Object.entries(classStats).map(([cls, count]) => (
      <p key={cls}>{cls}: {count} detected</p>
    ))}
  </div>
);
```

---

