# Auralis — MLOps & Model Weights

This directory contains model training notebooks, source scripts, and weight files for the Auralis crack detection pipeline.

---

## Active Production Model

| File | Location |
|---|---|
| `Top_Performance.pt` | Project root (`../../Top_Performance.pt`) |

The backend loads this file at startup. Do not rename or move it without updating `backend/services/analyzer.py` (`_MODEL_PATH`).

---

## Weight Version History

| File | Architecture | Training | Notes |
|---|---|---|---|
| `v1_crack_only_nano_legacy.pt` | YOLOv8n (nano) | Early POC | Single-class crack detection. Lowest accuracy. Legacy only. |
| `V2 absoulutte defects one.pt` | YOLOv8s (small) | V2 dataset | Multi-defect attempt. Superseded by V3. |
| `Best for V3 yolov8s.pt` | YOLOv8s (small) | V3 dataset | Best checkpoint from V3 training run. Candidate for production. |
| `125 epoch yolov8s.pt` | YOLOv8s (small) | 125 epochs | Extended training run. Evaluated in `notebooks/POC_Iterations.ipynb`. |

> **Note:** The active production model (`Top_Performance.pt`) is the final selected checkpoint after evaluation across all versions. It is stored at the project root to keep the Docker build context simple.

---

## Severity Thresholds (set in `backend/services/analyzer.py`)

| Threshold | Value | Meaning |
|---|---|---|
| `CONF_THRESHOLD` | 0.25 | Minimum YOLO confidence to include a detection |
| `WARNING_AREA_RATIO` | 0.01 | Bbox area ≥ 1% of image → warning |
| `CRITICAL_AREA_RATIO` | 0.04 | Bbox area ≥ 4% of image → critical |

These are also exposed live via `GET /api/model/info`.

---

## Training

See `src/train.py` and `notebooks/POC_Iterations.ipynb` for training scripts and experiment logs.

To retrain:

```bash
cd mlops
python src/train.py
```

To evaluate a weight file against the test set:

```bash
yolo val model=weights/<filename>.pt data=<dataset.yaml>
```
