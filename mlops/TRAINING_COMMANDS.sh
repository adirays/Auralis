# Quick-Start Training Commands for YOLOv8 Multi-Class Concrete Defects

## Scenario 1: Development (Fast Iteration)
# Good for testing new dataset, quick feedback loop

python src/train_multiclass.py \
  --model yolov8s \
  --data dataset.yaml \
  --epochs 50 \
  --batch 32 \
  --imgsz 640 \
  --device 0 \
  --name debug-quick

# Expected: 30–45 min on V100 GPU


## Scenario 2: Production (Recommended First Full Run)
# Good for initial model release

python src/train_multiclass.py \
  --model yolov8s \
  --data dataset.yaml \
  --epochs 200 \
  --batch 32 \
  --imgsz 640 \
  --device 0 \
  --patience 40 \
  --name multiclass-v1

# Expected: 2–3 hours on V100 GPU
# Outputs: runs/segment/multiclass-v1/weights/best.pt


## Scenario 3: High Accuracy (More Resources)
# Good for production deployment with 16GB+ GPU memory

python src/train_multiclass.py \
  --model yolov8m \
  --data dataset.yaml \
  --epochs 250 \
  --batch 16 \
  --imgsz 640 \
  --device 0 \
  --patience 50 \
  --name multiclass-v1-accuracy

# Expected: 5–7 hours on V100 GPU
# Better mAP50, slightly slower inference


## Scenario 4: Multi-GPU (if available)
# Distribute across multiple GPUs for parallel training

python src/train_multiclass.py \
  --model yolov8m \
  --data dataset.yaml \
  --epochs 200 \
  --batch 64 \
  --imgsz 640 \
  --device 0,1,2,3 \
  --name multiclass-v1-multi-gpu

# Uses GPU 0,1,2,3 in parallel
# Batch 64 = 16 per GPU


## Scenario 5: Resume from Checkpoint (if interrupted)
# Continue training from best checkpoint

python src/train_multiclass.py \
  --model runs/segment/multiclass-v1/weights/best.pt \
  --data dataset.yaml \
  --epochs 100 \
  --batch 32 \
  --name multiclass-v1-extended


## Post-Training: Copy Model to Backend

cp runs/segment/multiclass-v1/weights/best.pt ../../Top_Performance.pt

# Verify
ls -lh ../../Top_Performance.pt
python -c "from ultralytics import YOLO; m = YOLO('../../Top_Performance.pt'); print(m.names)"


## Validation & Testing

# Validate on val set
python -c "
from ultralytics import YOLO
model = YOLO('runs/segment/multiclass-v1/weights/best.pt')
results = model.val(data='dataset.yaml')
print(f'mAP50: {results.box.map50:.4f}')
print(f'mAP50-95: {results.box.map:.4f}')
"

# Test on hold-out set (if available)
python -c "
from ultralytics import YOLO
model = YOLO('runs/segment/multiclass-v1/weights/best.pt')
results = model.val(data='dataset.yaml', split='test')
"


## Inference on Single Image (Debugging)

python -c "
from ultralytics import YOLO
import cv2

model = YOLO('runs/segment/multiclass-v1/weights/best.pt')
results = model.predict('test_image.jpg', conf=0.25)

r = results[0]
print(f'Detections: {len(r.boxes)}')
for i, box in enumerate(r.boxes):
    cls_id = int(box.cls)
    conf = float(box.conf)
    class_names = {0: 'crack', 1: 'spalling', 2: 'corrosion', 3: 'delamination', 4: 'efflorescence'}
    print(f'  [{i}] {class_names[cls_id]} @ {conf*100:.1f}%')

# Save annotated image
r.save(filename='test_image_annotated.jpg')
"


## Export Model (Optional: for deployment)

python -c "
from ultralytics import YOLO

model = YOLO('runs/segment/multiclass-v1/weights/best.pt')

# Export to ONNX (faster CPU inference)
model.export(format='onnx', imgsz=640)

# Export to TensorFlow (mobile deployment)
model.export(format='tflite', imgsz=640)

print('Exported to:')
print('  - yolov8m-seg.onnx')
print('  - yolov8m-seg_saved_model/ (TF SavedModel)')
"


## Debugging: Examine Dataset Statistics

python -c "
import os
from pathlib import Path

dataset_root = Path('dataset')
counts = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}
class_names = {0: 'crack', 1: 'spalling', 2: 'corrosion', 3: 'delamination', 4: 'efflorescence'}

for label_file in (dataset_root / 'labels' / 'train').glob('*.txt'):
    with open(label_file) as f:
        for line in f:
            if line.strip():
                cls_id = int(line.split()[0])
                counts[cls_id] += 1

print('Training Set Class Counts:')
total = sum(counts.values())
for cls_id, count in counts.items():
    pct = 100 * count / total
    print(f'  {class_names[cls_id]}: {count} ({pct:.1f}%)')
print(f'Total: {total}')
"

