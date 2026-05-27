import os
from PIL import Image, ImageDraw
import random

def generate_data():
    os.makedirs('data/images/train', exist_ok=True)
    os.makedirs('data/labels/train', exist_ok=True)

    for i in range(10):
        img = Image.new('RGB', (800, 800), color=(160, 160, 160))
        draw = ImageDraw.Draw(img)

        x1, y1 = random.randint(100, 300), random.randint(100, 300)
        x2, y2 = random.randint(500, 700), random.randint(500, 700)

        draw.rectangle([x1, y1, x2, y2], fill=(50, 50, 50))

        img_path = f'data/images/train/synthetic_{i}.jpg'
        label_path = f'data/labels/train/synthetic_{i}.txt'

        img.save(img_path)

        w = (x2 - x1) / 800.0
        h = (y2 - y1) / 800.0
        x_c = (x1 / 800.0) + (w / 2)
        y_c = (y1 / 800.0) + (h / 2)

        with open(label_path, 'w') as f:
            f.write(f"0 {x_c:.4f} {y_c:.4f} {w:.4f} {h:.4f}\n")

    return {"status": "Synthetic dataset generated"}
