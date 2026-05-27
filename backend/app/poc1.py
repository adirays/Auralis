import cv2
import numpy as np

def run_poc1(img_path, label_path):
    img = cv2.imread(img_path)
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    h_img, w_img, _ = img.shape

    with open(label_path, 'r') as f:
        data = f.read().strip().split()
        x_c, y_c, w, h = map(float, data[1:5])

    x_min = int((x_c - w/2) * w_img)
    y_min = int((y_c - h/2) * h_img)
    x_max = int((x_c + w/2) * w_img)
    y_max = int((y_c + h/2) * h_img)

    roi = img_rgb[y_min:y_max, x_min:x_max]

    img_gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    roi_gray = cv2.cvtColor(roi, cv2.COLOR_RGB2GRAY)

    return {
        "roi_box": [x_min, y_min, x_max, y_max],
        "defect_area_percent": round(w * h * 100, 2),
        "mean_intensity_global": float(np.mean(img_gray)),
        "mean_intensity_roi": float(np.mean(roi_gray)),
        "signal_difference": float(np.mean(img_gray) - np.mean(roi_gray))
    }
