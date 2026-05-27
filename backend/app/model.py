import cv2
import torch
import numpy as np
from ultralytics import YOLO
from pathlib import Path

_weights = Path(__file__).parent.parent.parent / "mlops" / "weights" / "Best for V3 yolov8s.pt"
_fallback = Path(__file__).parent.parent.parent / "model.pt"
_path = str(_weights) if _weights.exists() else str(_fallback)

model = YOLO(_path)
pytorch_model = model.model
pytorch_model.eval()


class FusionCAMHook:
    def __init__(self, pytorch_model, layer_indices=[4, 9]):
        self.activations = {}
        self.hooks = []

        def get_hook(idx):
            def hook(m, i, o):
                self.activations[idx] = o.detach().cpu()
            return hook

        for idx in layer_indices:
            try:
                target_layer = pytorch_model.model[idx]
                self.hooks.append(target_layer.register_forward_hook(get_hook(idx)))
            except Exception:
                pass

    def remove(self):
        for h in self.hooks:
            h.remove()


def compute_eigen_cam(activations):
    b, c, height, width = activations.size()
    A = activations.squeeze(0).view(c, height * width)
    A = A - A.mean(dim=1, keepdim=True)
    U, S, V = torch.linalg.svd(A, full_matrices=False)
    cam = torch.matmul(U[:, 0], A).view(height, width)
    cam = (cam - cam.min()) / (cam.max() - cam.min() + 1e-8)
    return cam.numpy()


def process_image(img_path: str) -> dict:
    cam_hook = FusionCAMHook(pytorch_model)
    original_img = cv2.imread(img_path)

    if original_img is None:
        return {"mean_activation": 0.0, "max_activation": 0.0}

    h_img, w_img, _ = original_img.shape
    img_resized = cv2.resize(original_img, (640, 640))
    img_tensor = torch.from_numpy(img_resized).float().permute(2, 0, 1).unsqueeze(0) / 255.0

    with torch.no_grad():
        pytorch_model(img_tensor)

    cam_hook.remove()

    if not cam_hook.activations:
        return {"mean_activation": 0.0, "max_activation": 0.0}

    heatmaps = []
    for idx, act in cam_hook.activations.items():
        h = cv2.resize(compute_eigen_cam(act), (w_img, h_img))
        heatmaps.append(h)

    if len(heatmaps) == 2:
        fused = heatmaps[0] * heatmaps[1]
    else:
        fused = heatmaps[0]

    fused = (fused - fused.min()) / (fused.max() - fused.min() + 1e-8)
    fused = 1.0 - fused  # phase inversion — highlights anomalies

    return {
        "mean_activation": float(np.mean(fused)),
        "max_activation": float(np.max(fused)),
    }
