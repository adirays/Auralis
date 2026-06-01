# YOLOv8 Multi-Class Concrete Defects Training Guide

## Overview

This guide walks through training a multi-class YOLOv8 segmentation model to detect 5 concrete defects:
- **Crack** (structural, moisture paths, stress indicators)
- **Spalling** (surface concrete loss, rebar exposure)
- **Corrosion** (rust stains, active reinforcement degradation)
- **Delamination** (layer separation, composite failure)
- **Efflorescence** (salt deposits, water infiltration indicator)

---

## 1. Dataset Preparation

### 1.1 Minimum Size & Composition

| Class | Min Images | Distribution | Notes |
|---|---|---|---|
| crack | 2000–3000 | 35–40% | Most common, diverse sizes |
| spalling | 1000–1500 | 20–25% | Various concrete types |
| corrosion | 800–1200 | 15–20% | Hardest to detect, needs augmentation |
| delamination | 600–1000 | 10–15% | Rare but critical |
| efflorescence | 400–800 | 5–10% | Often misclassified as efflorescence |
| **Total** | **5,000–8,000** | 100% | After splitting: 70% train, 15% val, 15% test |

**Recommendation**: Start with 5k images, retrain with 10k+ for production.

### 1.2 Image Diversity

- **Geographic**: concrete bridges, buildings, tunnels, pavements in different regions
- **Lighting**: sunny, overcast, artificial, night (if possible)
- **Angle**: perpendicular, 30–60° oblique, extreme angles
- **Defect scale**: small (1–5% area), medium (5–20%), large (>20%)
- **Material types**: Portland cement, high-strength, reinforced, prestressed

### 1.3 Annotation Format (YOLO Segmentation)

Create directory structure:
```
dataset/
├── images/
│   ├── train/         # 3500 images
│   ├── val/           # 750 images
│   └── test/          # 750 images
└── labels/
    ├── train/         # .txt files (one per image)
    ├── val/
    └── test/
```

Each `.txt` file (e.g., `image_001.txt`):
```
0 0.102 0.156 0.145 0.201 0.168 0.195 ...   (crack — normalized polygon)
1 0.523 0.412 0.678 0.501 0.612 0.456 ...   (spalling)
```

Format: `<class_id> <x1> <y1> <x2> <y2> ... <xN> <yN>`
- `class_id`: 0–4
- `(x_i, y_i)`: normalized [0.0, 1.0] polygon vertices

### 1.4 Annotation Tools

- **CVAT** (full-featured): https://github.com/opencv/cvat
- **Roboflow** (cloud, easy export to YOLO): https://roboflow.com
- **Labelme** (local, community): https://github.com/wkentaro/labelme
  - Export with: `python -m labelme2coco dir/` → convert COCO → YOLO format

---

## 2. Setup & Installation

### 2.1 Python Environment

```bash
cd Structure_Analysis_IImstc

# Create venv
python -m venv venv_yolo

# Activate
# On Windows:
venv_yolo\Scripts\activate
# On macOS/Linux:
source venv_yolo/bin/activate

# Install ultralytics
pip install -U ultralytics torch torchvision
```

### 2.2 Verify Installation

```python
from ultralytics import YOLO
model = YOLO("yolov8s-seg.pt")
print(model)
```

---

## 3. Training Configuration

### 3.1 Prepare dataset.yaml

Edit `mlops/dataset.yaml`:

```yaml
path: /absolute/path/to/dataset
train: images/train
val: images/val
test: images/test

nc: 5
names:
  0: crack
  1: spalling
  2: corrosion
  3: delamination
  4: efflorescence
```

### 3.2 Model Selection

| Model | Params | Speed (GPU) | Accuracy | Use Case |
|---|---|---|---|---|
| **yolov8n-seg** | 3.2M | 1.5ms | 87% | Real-time, edge devices |
| **yolov8s-seg** | 11.2M | 3.0ms | 90% | **Recommended start** |
| **yolov8m-seg** | 26.4M | 5.5ms | 92% | Balanced |
| **yolov8l-seg** | 43.7M | 8.5ms | 93% | High accuracy (needs 16GB+ GPU) |
| **yolov8x-seg** | 68.2M | 12.1ms | 94% | Research only |

**Recommendation for this project**: Start with `yolov8s`, scale to `yolov8m` if accuracy plateaus.

---

## 4. Training

### 4.1 Quick Start (Development)

```bash
cd mlops

# Train yolov8s for 100 epochs (quick validation)
python src/train_multiclass.py \
  --model yolov8s \
  --data dataset.yaml \
  --epochs 100 \
  --batch 32 \
  --imgsz 640 \
  --device 0
```

**Expected output**:
```
[INFO] Training YOLOv8 Multi-Class Segmentation
[INFO] Model: yolov8s
[INFO] Specs: {'params': '11.2M', 'gflops': '28.6', 'speed_cpu': '104ms', 'speed_gpu': '3.0ms'}
[INFO] Dataset: dataset.yaml
[INFO] Epochs: 100, Batch: 32, ImgSz: 640
[INFO] Device: 0, Workers: 8
[INFO] Loading yolov8s-seg.pt (pretrained on COCO)...
[INFO] Starting training...
```

### 4.2 Production Training (Full)

```bash
python src/train_multiclass.py \
  --model yolov8m \
  --data dataset.yaml \
  --epochs 250 \
  --batch 16 \
  --imgsz 640 \
  --device 0 \
  --patience 40 \
  --name multiclass-v1-final
```

**Expected runtime**:
- yolov8s @ batch 32 → ~2–3 hours (100 epochs)
- yolov8m @ batch 16 → ~5–7 hours (200 epochs)
- yolov8l @ batch 8 → ~10–15 hours (250 epochs)

### 4.3 Hyperparameters (in `train_multiclass.py`)

Key settings already tuned for concrete defects:

```python
HYPERPARAMETERS = {
    "lr0": 0.001,           # Start low (transfer learning)
    "hsv_s": 0.7,           # Saturation (rust/discoloration variation)
    "degrees": 20.0,        # Rotation (oblique viewing angles)
    "mosaic": 1.0,          # 4-image stitching (for small defects)
    "mixup": 0.1,           # Blend augmentation (class imbalance)
    "copy_paste": 0.0,      # Disable (synthetic defects → poor generalization)
}
```

---

## 5. Monitor Training

### 5.1 Logs & Plots

Training output directory: `runs/segment/multiclass-v1-final/`

```
runs/segment/multiclass-v1-final/
├── weights/
│   ├── best.pt           # Best checkpoint (highest val mAP50)
│   └── last.pt           # Final checkpoint
├── results.csv           # Epoch-by-epoch metrics
├── runs_results.png      # Consolidated loss/mAP plot
└── confusion_matrix.png  # Per-class confusion matrix
```

### 5.2 Key Metrics to Watch

| Metric | Target | Notes |
|---|---|---|
| **box_loss** | <0.3 | Bounding box regression error |
| **cls_loss** | <0.2 | Classification cross-entropy |
| **seg_loss** | <0.3 | Segmentation mask loss |
| **mAP50** | >0.85 | Mean Avg Precision @ IoU=0.5 |
| **mAP50-95** | >0.65 | Stricter IoU=0.5–0.95 |

**Early stopping**: If mAP50 plateaus for 40 consecutive epochs, training halts.

### 5.3 TensorBoard (Optional)

```bash
# If tensorboard logging is enabled
tensorboard --logdir runs/segment
# Open: http://localhost:6006
```

---

## 6. Validation & Testing

### 6.1 Validate on Val Set (Automatic)

```bash
cd mlops
python -c "
from ultralytics import YOLO
model = YOLO('runs/segment/multiclass-v1-final/weights/best.pt')
results = model.val(data='dataset.yaml', imgsz=640)
print(f'mAP50: {results.box.map50:.4f}')
print(f'mAP50-95: {results.box.map:.4f}')
"
```

### 6.2 Test on Hold-Out Set

```bash
python -c "
from ultralytics import YOLO
model = YOLO('runs/segment/multiclass-v1-final/weights/best.pt')
# Test directory must be in dataset/ with corresponding labels/
results = model.val(data='dataset.yaml', split='test', imgsz=640)
"
```

### 6.3 Per-Class Performance

```bash
# confusion_matrix.png in runs/segment/.../
# Check which classes are confused:
# - corrosion vs efflorescence: similar color, different physics
# - crack vs delamination: might need tighter labeling
```

---

## 7. Export & Deployment

### 7.1 Copy to Backend

```bash
# After training completes
cp runs/segment/multiclass-v1-final/weights/best.pt ../../Top_Performance.pt

# Verify
ls -lh ../../Top_Performance.pt
```

### 7.2 Switch to Multi-Class Analyzer

```bash
cd backend

# Backup old analyzer
cp services/analyzer.py services/analyzer_single_class_backup.py

# Use new multi-class analyzer
cp services/analyzer_multiclass.py services/analyzer.py

# Restart backend
python -m uvicorn main:app --reload
```

### 7.3 Test Inference

```bash
curl -X POST http://localhost:8000/api/analysis/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@test_crack.jpg" \
  -F "location=Bridge_Pier_A"
```

Expected response:
```json
{
  "id": "uuid-123",
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
  ],
  "image_heatmap": "iVBORw0KGgo..."
}
```

---

## 8. Performance Targets & Iteration

### 8.1 Expected Results (Multi-Class YOLOv8s)

After 200 epochs with 8k images:

```
Per-Class Performance:
  crack:        mAP50=0.88, mAP50-95=0.68
  spalling:     mAP50=0.85, mAP50-95=0.64
  corrosion:    mAP50=0.81, mAP50-95=0.60  (hardest class)
  delamination: mAP50=0.87, mAP50-95=0.66
  efflorescence:mAP50=0.84, mAP50-95=0.62

Overall mAP50: 0.85
Overall mAP50-95: 0.64
```

### 8.2 Improvement Checklist

If accuracy is below target:

- [ ] **More data**: Collect 2k+ additional images for under-performing classes
- [ ] **Augmentation**: Increase `hsv_s`, `degrees`, `mosaic` in hyperparameters
- [ ] **Class balance**: Use `image_weights=True` (already in script)
- [ ] **Hard negatives**: Add images with false positives to training set
- [ ] **Larger model**: Retrain with `yolov8m` or `yolov8l`
- [ ] **Longer training**: Increase `--epochs` to 300–400

### 8.3 Retraining from Best

```bash
# Resume from best checkpoint (useful for extending training)
python src/train_multiclass.py \
  --model runs/segment/multiclass-v1-final/weights/best.pt \
  --data dataset.yaml \
  --epochs 50 \
  --name multiclass-v1-extended
```

---

## 9. Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| **OOM (Out of Memory)** | Batch too large | Reduce `--batch` (e.g., 32 → 16) |
| **Slow convergence** | LR too low | Increase `lr0` in HYPERPARAMETERS |
| **High loss, low acc** | Bad annotations | Review & fix 20% random images |
| **Class imbalance loss** | Few instances | Add `image_weights=True` (already done) |
| **Inference slow** | Large model on CPU | Use `yolov8n`, enable ONNX export |
| **False positives** | Low confidence threshold | Raise `CONF_THRESHOLD` in analyzer.py |

---

## 10. Next Steps

1. **Collect dataset** (5k–10k images with polygon annotations)
2. **Prepare dataset.yaml** and validate directory structure
3. **Train yolov8s** for 100 epochs (sanity check)
4. **Evaluate** on val/test sets
5. **Iterate** (data cleaning, augmentation tuning)
6. **Scale to yolov8m** if target mAP not reached
7. **Deploy** to backend and test end-to-end
8. **Monitor** in production; retrain monthly with new labeled data

---

## References

- YOLOv8 Docs: https://docs.ultralytics.com
- Segmentation Format: https://docs.ultralytics.com/tasks/segment/
- Hyperparameter Guide: https://docs.ultralytics.com/guides/hyperparameter-tuning/
- ACI 318 (Concrete Cracking): https://www.concrete.org/
- Computer Vision Annotation Best Practices: CVAT docs + Roboflow blog

