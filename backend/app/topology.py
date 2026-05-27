import cv2
import numpy as np
from app.model import model, pytorch_model, FusionCAMHook, compute_eigen_cam

def generate_topology(img_path):
    cam_hook = FusionCAMHook(pytorch_model)

    img = cv2.imread(img_path)

    _ = model.predict(img_path, imgsz=640, verbose=False)

    heatmap = compute_eigen_cam(cam_hook.activations)
    cam_hook.remove()

    heatmap_resized = cv2.resize(heatmap, (img.shape[1], img.shape[0]))

    z_data = heatmap_resized[::4, ::4]

    return {
        "z_data": z_data.tolist(),
        "mean_activation": float(np.mean(heatmap))
    }
