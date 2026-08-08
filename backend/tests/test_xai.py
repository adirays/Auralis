import pytest
import numpy as np
import torch
import torch.nn as nn
from services.xai_methods import (
    eigencam,
    gradcam,
    gradcam_plusplus,
    scorecam,
    compute_xai,
    render_xai_heatmap,
    METHODS_COMPARISON,
    get_method_recommendation,
)
from services.xai_engine import explain, list_methods, recommend

# A simple toy model for testing gradient-based CAMs
class ToyModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv = nn.Conv2d(3, 8, kernel_size=3, padding=1)
        self.fc = nn.Linear(8 * 4 * 4, 2)

    def forward(self, x):
        x = self.conv(x)
        x = torch.relu(x)
        x = x.view(x.size(0), -1)
        x = self.fc(x)
        return x


def test_eigencam():
    # EigenCAM only needs activations (B, C, H, W)
    activations = torch.randn(1, 8, 16, 16)
    cam = eigencam(activations, normalize=True)
    assert cam.shape == (16, 16)
    assert cam.min() >= 0.0
    assert cam.max() <= 1.0


def test_gradcam():
    model = ToyModel()
    input_tensor = torch.randn(1, 3, 4, 4)
    # Target layer is self.conv
    cam = gradcam(model, model.conv, input_tensor, class_idx=0, normalize=True)
    assert cam.shape == (4, 4)
    assert cam.min() >= 0.0
    assert cam.max() <= 1.0


def test_gradcam_plusplus():
    model = ToyModel()
    input_tensor = torch.randn(1, 3, 4, 4)
    cam = gradcam_plusplus(model, model.conv, input_tensor, class_idx=0, normalize=True)
    assert cam.shape == (4, 4)
    assert cam.min() >= 0.0
    assert cam.max() <= 1.0


def test_scorecam():
    model = ToyModel()
    input_tensor = torch.randn(1, 3, 4, 4)
    cam = scorecam(model, model.conv, input_tensor, class_idx=0, normalize=True, top_k=2)
    assert cam.shape == (4, 4)
    assert cam.min() >= 0.0
    assert cam.max() <= 1.0


def test_compute_xai_selector():
    model = ToyModel()
    input_tensor = torch.randn(1, 3, 4, 4)
    activations = torch.randn(1, 8, 4, 4)
    
    # EigenCAM
    cam1 = compute_xai("eigencam", activations)
    assert cam1.shape == (4, 4)

    # Grad-CAM
    cam2 = compute_xai("gradcam", model, model.conv, input_tensor, class_idx=0)
    assert cam2.shape == (4, 4)

    with pytest.raises(ValueError):
        compute_xai("invalid_method", activations)


def test_xai_engine_exports():
    model = ToyModel()
    input_tensor = torch.randn(1, 3, 4, 4)
    activations = torch.randn(1, 8, 4, 4)
    
    cam = explain("eigencam", activations)
    assert cam.shape == (4, 4)
    
    methods = list_methods()
    assert "eigencam" in methods
    
    rec = recommend("crack_detection")
    assert rec == "gradcam++"


def test_render_xai_heatmap():
    heatmap = np.zeros((10, 10), dtype=np.float32)
    heatmap[3:7, 3:7] = 1.0  # Center activation
    
    img = np.ones((10, 10, 3), dtype=np.uint8) * 100
    
    blended = render_xai_heatmap(heatmap, img, sharpen=False, background_threshold=0.01)
    assert blended.shape == (10, 10, 3)
    
    # Sharpen and mask test
    mask = np.ones((10, 10), dtype=np.float32)
    blended_masked = render_xai_heatmap(heatmap, img, mask=mask, sharpen=True)
    assert blended_masked.shape == (10, 10, 3)
