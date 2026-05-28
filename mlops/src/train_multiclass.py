"""
Multi-class YOLOv8 Segmentation Training Script

Classes: crack, spalling, corrosion, delamination, efflorescence

Usage:
    python src/train_multiclass.py --model yolov8s --epochs 200 --batch 32 --data dataset.yaml
    python src/train_multiclass.py --model yolov8m --epochs 150 --batch 16 --data dataset.yaml

Recommended:
    - Start with yolov8s (small) for faster iteration
    - Scale to yolov8m (medium) for production if GPU memory allows
    - yolov8l (large) only if dataset > 50k annotated images

Output:
    - runs/segment/train/weights/best.pt → production checkpoint (highest val mAP50)
    - runs/segment/train/weights/last.pt → final checkpoint
"""

import argparse
import logging
from pathlib import Path

from ultralytics import YOLO

logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(asctime)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ── Hyperparameters tuned for multi-class concrete defects ────────────────────
HYPERPARAMETERS = {
    # Learning rate (adaptive LR scheduler in YOLO handles decay)
    "lr0": 0.001,           # initial LR
    "lrf": 0.01,            # final LR ratio (lr_final = lr0 * lrf ** epochs)
    "momentum": 0.937,      # SGD momentum
    
    # Regularization
    "weight_decay": 0.0005, # L2 penalty
    "warmup_epochs": 3.0,   # linear warmup
    "warmup_momentum": 0.8, # momentum during warmup
    "box_loss": 7.5,        # bbox loss weight
    "cls_loss": 1.0,        # classification loss weight
    "seg_loss": 1.0,        # segmentation loss weight (newer YOLO versions)
    
    # Augmentation — aggressive to handle class imbalance & variation
    "scale": 0.5,           # image scale jitter [0.5-1.5]
    "fliplr": 0.5,          # random horizontal flip
    "flipud": 0.3,          # random vertical flip
    "mosaic": 1.0,          # mosaic augmentation (stitch 4 images)
    "mixup": 0.1,           # mixup augmentation probability
    "copy_paste": 0.0,      # YOLO copy-paste augmentation (disable for defects)
    "degrees": 20.0,        # rotation range
    "translate": 0.1,       # translation jitter (fraction of image)
    "shear": 5.0,           # shear angle range
    
    # Color & contrast
    "hsv_h": 0.015,         # HSV hue shift
    "hsv_s": 0.7,           # HSV saturation shift (important for rust/discoloration)
    "hsv_v": 0.4,           # HSV value (brightness) shift
    "brightness": 0.0,      # brightness adjustment (0.0-2.0)
    "contrast": 0.0,        # contrast adjustment (0.5-1.5)
    "saturation": 0.0,      # saturation adjustment (0.5-1.5)
    "hue": 0.0,             # hue shift (0.0-0.5)
    
    # Mosaic & augmentation details
    "perspective": 0.0,     # perspective warp probability
    "erasing": 0.0,         # random erasing augmentation
    "crop_fraction": 1.0,   # crop by this fraction; 1.0 = no crop
    
    # Optimizer
    "optimizer": "SGD",     # SGD or Adam (SGD typically better for segmentation)
    "nbs": 64,              # nominal batch size for loss scaling
    "close_mosaic": 10,     # disable mosaic augmentation in final N epochs (for fine-tuning)
}

# ── Model variant sizing ──────────────────────────────────────────────────────
MODEL_SPECS = {
    "yolov8n": {"params": "3.2M", "gflops": "8.7", "speed_cpu": "39ms", "speed_gpu": "1.5ms"},
    "yolov8s": {"params": "11.2M", "gflops": "28.6", "speed_cpu": "104ms", "speed_gpu": "3.0ms"},
    "yolov8m": {"params": "26.4M", "gflops": "78.9", "speed_cpu": "256ms", "speed_gpu": "5.5ms"},
    "yolov8l": {"params": "43.7M", "gflops": "165.2", "speed_cpu": "600ms", "speed_gpu": "8.5ms"},
    "yolov8x": {"params": "68.2M", "gflops": "257.8", "speed_cpu": "1000ms", "speed_gpu": "12.1ms"},
}

def main():
    parser = argparse.ArgumentParser(
        description="Multi-class YOLOv8 Segmentation Training"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="yolov8s",
        choices=list(MODEL_SPECS.keys()),
        help="YOLOv8 variant (n=nano, s=small, m=medium, l=large, x=xlarge)"
    )
    parser.add_argument(
        "--data",
        type=str,
        default="dataset.yaml",
        help="Path to dataset.yaml (COCO or YOLOv8 format)"
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=200,
        help="Training epochs (recommend 150-300 for multi-class)"
    )
    parser.add_argument(
        "--batch",
        type=int,
        default=32,
        help="Batch size (reduce if OOM; adjust epochs proportionally)"
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=640,
        help="Image size (640 standard for YOLOv8; 1024 for higher precision)"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="0",
        help="GPU device (0, 1, 2, ... or 'cpu')"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=8,
        help="DataLoader workers"
    )
    parser.add_argument(
        "--patience",
        type=int,
        default=30,
        help="Early stopping patience (epochs with no improvement)"
    )
    parser.add_argument(
        "--project",
        type=str,
        default="runs/segment",
        help="Project directory for outputs"
    )
    parser.add_argument(
        "--name",
        type=str,
        default="multiclass-concrete-defects",
        help="Experiment name"
    )
    
    args = parser.parse_args()
    
    # ── Log configuration ─────────────────────────────────────────────────────
    logger.info(f"[TRAIN] YOLOv8 Multi-Class Segmentation")
    logger.info(f"[TRAIN] Model: {args.model}")
    logger.info(f"[TRAIN] Specs: {MODEL_SPECS[args.model]}")
    logger.info(f"[TRAIN] Dataset: {args.data}")
    logger.info(f"[TRAIN] Epochs: {args.epochs}, Batch: {args.batch}, ImgSz: {args.imgsz}")
    logger.info(f"[TRAIN] Device: {args.device}, Workers: {args.workers}")
    
    # ── Load base model ───────────────────────────────────────────────────────
    logger.info(f"[TRAIN] Loading {args.model}-seg.pt (pretrained on COCO)...")
    model = YOLO(f"{args.model}-seg.pt")
    
    # ── Validate dataset.yaml exists ──────────────────────────────────────────
    data_path = Path(args.data)
    if not data_path.exists():
        raise FileNotFoundError(
            f"Dataset config not found: {data_path}\n"
            "Create dataset.yaml in YOLO format:\n"
            "  path: /path/to/dataset\n"
            "  train: images/train\n"
            "  val: images/val\n"
            "  test: images/test\n"
            "  nc: 5\n"
            "  names: ['crack', 'spalling', 'corrosion', 'delamination', 'efflorescence']\n"
        )
    
    # ── Train ─────────────────────────────────────────────────────────────────
    logger.info(f"[TRAIN] Starting training...")
    results = model.train(
        data=str(data_path),
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        device=args.device,
        workers=args.workers,
        patience=args.patience,
        
        # Hyperparameters
        **HYPERPARAMETERS,
        
        # Output
        project=args.project,
        name=args.name,
        exist_ok=False,  # create new run directory
        save=True,
        save_period=10,  # save checkpoint every 10 epochs
        
        # Validation
        val=True,
        split=0.1,  # if not using separate val set
        
        # Callbacks & logging
        verbose=True,
        plots=True,  # save loss/mAP plots
        
        # Mixed precision (faster, lower VRAM)
        amp=True,
        
        # EMA (exponential moving average)
        ema=True,
        
        # Resume capability
        resume=False,
        
        # Deterministic
        seed=42,
    )
    
    logger.info(f"[TRAIN] Training complete!")
    logger.info(f"[TRAIN] Best checkpoint: {results.save_dir}/weights/best.pt")
    logger.info(f"[TRAIN] Final checkpoint: {results.save_dir}/weights/last.pt")
    
    # ── Validation on test set (if available) ────────────────────────────────
    logger.info(f"[TRAIN] Running final validation...")
    val_results = model.val(data=str(data_path), imgsz=args.imgsz)
    
    logger.info(f"[TRAIN] mAP50: {val_results.box.map50:.4f}")
    logger.info(f"[TRAIN] mAP50-95: {val_results.box.map:.4f}")


if __name__ == "__main__":
    main()
