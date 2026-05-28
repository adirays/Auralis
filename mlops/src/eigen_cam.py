import cv2
import torch
import numpy as np
import os
from ultralytics import YOLO

# 1. Configuration & Paths
MODEL_PATH = "weights/best.pt"
INPUT_DIR = "inputs"
OUTPUT_DIR = "outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 2. Initialize Model
model = YOLO(MODEL_PATH)
pytorch_model = model.model
pytorch_model.eval()

class FusionCAMHook:
    def __init__(self, pytorch_model, layer_indices=[4, 9]):
        self.activations = {}
        self.hooks = []
        def get_hook(idx):
            def hook(m, i, o): self.activations[idx] = o.detach().cpu()
            return hook
        for idx in layer_indices:
            target_layer = pytorch_model.model[idx]
            self.hooks.append(target_layer.register_forward_hook(get_hook(idx)))

    def remove(self):
        for h in self.hooks: h.remove()

def compute_eigen_cam(activations):
    b, c, height, width = activations.size()
    A = activations.squeeze(0).view(c, height * width)
    A = A - A.mean(dim=1, keepdim=True)
    U, S, V = torch.linalg.svd(A, full_matrices=False)
    cam = torch.matmul(U[:, 0], A).view(height, width)
    cam = (cam - cam.min()) / (cam.max() - cam.min() + 1e-8)
    return cam.numpy()

def run_xai(img_path):
    cam_hook = FusionCAMHook(pytorch_model)
    original_img = cv2.imread(img_path)
    h_img, w_img, _ = original_img.shape
    
    # Prep for model
    img_resized = cv2.resize(original_img, (640, 640))
    img_tensor = torch.from_numpy(img_resized).float().permute(2, 0, 1).unsqueeze(0) / 255.0

    # Inference
    with torch.no_grad():
        pytorch_model(img_tensor)

    # Fusion & Inversion
    h4 = cv2.resize(compute_eigen_cam(cam_hook.activations[4]), (w_img, h_img))
    h9 = cv2.resize(compute_eigen_cam(cam_hook.activations[9]), (w_img, h_img))
    
    fused = (h4 * h9)
    fused = (fused - fused.min()) / (fused.max() - fused.min() + 1e-8)
    fused = 1.0 - fused  # Phase inversion for anomalies

    # Visuals
    heatmap_colored = cv2.applyColorMap(np.uint8(255 * fused), cv2.COLORMAP_JET)
    overlay = cv2.addWeighted(original_img, 0.4, heatmap_colored, 0.7, 0)
    
    cam_hook.remove()
    return overlay

if __name__ == "__main__":
    # Process all images in inputs folder
    for img_name in os.listdir(INPUT_DIR):
        if img_name.lower().endswith(('.jpg', '.png', '.jpeg')):
            path = os.path.join(INPUT_DIR, img_name)
            result = run_xai(path)
            
            # Save the result
            output_path = os.path.join(OUTPUT_DIR, f"xai_{img_name}")
            cv2.imwrite(output_path, result)
            print(f"Generated heatmap for {img_name}")
            
            # Optional: Pop up window (press any key to close)
            cv2.imshow("XAI Audit", result)
            cv2.waitKey(0)
    
    cv2.destroyAllWindows()