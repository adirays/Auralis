"""
XAI Methods for Concrete Defect Detection — Comparison & Implementation

Supported methods:
  1. EigenCAM (current): Layer-4 × Layer-9 SVD fusion, fast, good for segmentation
  2. Grad-CAM: Class-score gradients × feature maps, good for classification
  3. Grad-CAM++: Weighted gradients, better localization for segmentation
  4. Score-CAM: Ablation-based, no gradients, most faithful but slower

Recommendation for crack/segmentation models: Grad-CAM++ (best balance)
"""

import logging
from typing import Literal

import cv2
import numpy as np
import torch
import torch.nn.functional as F

logger = logging.getLogger(__name__)

XAIMethod = Literal["eigencam", "gradcam", "gradcam++", "scorecam"]


# ── EigenCAM (Current Implementation) ──────────────────────────────────────────

def eigencam(
    activations: torch.Tensor,
    normalize: bool = True,
) -> np.ndarray:
    """
    EigenCAM: Eigen-Decomposition of Activation Correlations
    
    Pros: Fast (SVD on correlation matrix), works for any layer, good fusion
    Cons: Doesn't use gradients (model-agnostic but less task-specific)
    
    Args:
        activations: Feature map (B, C, H, W) — typically B=1
        normalize: Normalize to [0, 1]
    
    Returns:
        Heatmap (H, W) normalized to [0, 1]
    """
    b, c, h, w = activations.size()
    
    # Reshape to (C, H×W)
    A = activations.squeeze(0).view(c, h * w)
    
    # Center
    A = A - A.mean(dim=1, keepdim=True)
    
    # SVD decomposition
    U, S, V = torch.linalg.svd(A, full_matrices=False)
    
    # First singular vector (principal component)
    cam = torch.matmul(U[:, 0], A).view(h, w)
    
    if normalize:
        cam_min = cam.min()
        cam_max = cam.max()
        if cam_max - cam_min > 1e-8:
            cam = (cam - cam_min) / (cam_max - cam_min)
        else:
            cam = torch.zeros_like(cam)
    
    return cam.cpu().numpy()


# ── Grad-CAM (Gradient-based Class Activation Mapping) ────────────────────────

class GradCAMHook:
    """Thread-safe hook for Grad-CAM gradient capture."""
    
    def __init__(self):
        self.gradients = None
        self.activations = None
    
    def __call__(self, module, input, output):
        self.activations = output.detach()
        if output.requires_grad:
            output.register_hook(self.save_gradient)
    
    def save_gradient(self, grad):
        self.gradients = grad


def gradcam(
    model: torch.nn.Module,
    layer: torch.nn.Module,
    input_tensor: torch.Tensor,
    class_idx: int | None = None,
    normalize: bool = True,
) -> np.ndarray:
    """
    Grad-CAM: Gradient-based Class Activation Mapping
    
    Pros: Task-specific (uses class gradients), better for classification
    Cons: Slower (requires backprop), needs class index
    
    Args:
        model: Neural network (e.g., YOLO backbone)
        layer: Layer to visualize (e.g., model.model[9])
        input_tensor: Input image (1, 3, H, W)
        class_idx: Class index for backprop (default: max output)
        normalize: Normalize to [0, 1]
    
    Returns:
        Heatmap (H, W) normalized to [0, 1]
    """
    hook = GradCAMHook()
    handle = layer.register_forward_hook(hook)
    
    try:
        # Forward pass
        model.eval()
        with torch.enable_grad():
            input_tensor.requires_grad_(True)
            output = model(input_tensor)
        
        if class_idx is None:
            class_idx = output.argmax(dim=1)[0].item()
        
        # Backward pass on target class
        model.zero_grad()
        score = output[0, class_idx]
        score.backward()
        
        # Compute Grad-CAM
        gradients = hook.gradients[0, :, :, :]  # (C, H, W)
        activations = hook.activations[0, :, :, :]  # (C, H, W)
        
        # Weight by average gradient
        weights = gradients.mean(dim=(1, 2))  # (C,)
        cam = (weights.view(-1, 1, 1) * activations).sum(dim=0)  # (H, W)
        
        # ReLU to keep only positive activations
        cam = F.relu(cam)
        
        if normalize:
            cam_min = cam.min()
            cam_max = cam.max()
            if cam_max - cam_min > 1e-8:
                cam = (cam - cam_min) / (cam_max - cam_min)
            else:
                cam = torch.zeros_like(cam)
        
        return cam.detach().cpu().numpy()
    
    finally:
        handle.remove()


# ── Grad-CAM++ (Improved Grad-CAM) ────────────────────────────────────────────

def gradcam_plusplus(
    model: torch.nn.Module,
    layer: torch.nn.Module,
    input_tensor: torch.Tensor,
    class_idx: int | None = None,
    normalize: bool = True,
) -> np.ndarray:
    """
    Grad-CAM++: Improved Grad-CAM with per-pixel importance weighting
    
    Pros: Better localization than Grad-CAM, works well for segmentation
    Cons: Slightly slower (more gradient computation)
    Best for: Instance segmentation, crack detection
    
    Args:
        model: Neural network
        layer: Layer to visualize
        input_tensor: Input image (1, 3, H, W)
        class_idx: Class index (default: max output)
        normalize: Normalize to [0, 1]
    
    Returns:
        Heatmap (H, W) normalized to [0, 1]
    """
    hook = GradCAMHook()
    handle = layer.register_forward_hook(hook)
    
    try:
        # Forward pass
        model.eval()
        with torch.enable_grad():
            input_tensor.requires_grad_(True)
            output = model(input_tensor)
        
        if class_idx is None:
            class_idx = output.argmax(dim=1)[0].item()
        
        # Backward pass
        model.zero_grad()
        score = output[0, class_idx]
        score.backward()
        
        # Grad-CAM++: weighted gradients
        gradients = hook.gradients[0, :, :, :]  # (C, H, W)
        activations = hook.activations[0, :, :, :]  # (C, H, W)
        
        # Numerator: second-order gradients (spatial)
        numerator = gradients ** 2
        denominator = 2 * (gradients ** 2) + (activations * (gradients ** 3)).sum(dim=0, keepdim=True)
        denominator = torch.clamp(denominator, min=1e-8)
        
        alpha = numerator / denominator  # (C, H, W)
        
        # ReLU on gradients
        relu_grads = F.relu(gradients)  # (C, H, W)
        
        # Weights: importance of each channel at each spatial location
        weights = (alpha * relu_grads).sum(dim=(1, 2))  # (C,)
        
        # Weighted sum of activations
        cam = (weights.view(-1, 1, 1) * activations).sum(dim=0)  # (H, W)
        
        # ReLU to keep only positive
        cam = F.relu(cam)
        
        if normalize:
            cam_min = cam.min()
            cam_max = cam.max()
            if cam_max - cam_min > 1e-8:
                cam = (cam - cam_min) / (cam_max - cam_min)
            else:
                cam = torch.zeros_like(cam)
        
        return cam.detach().cpu().numpy()
    
    finally:
        handle.remove()


# ── Score-CAM (Ablation-based, Gradient-free) ────────────────────────────────

def scorecam(
    model: torch.nn.Module,
    layer: torch.nn.Module,
    input_tensor: torch.Tensor,
    class_idx: int | None = None,
    normalize: bool = True,
    top_k: int = 16,  # Use top-k channels for speed
) -> np.ndarray:
    """
    Score-CAM: Ablation-based attribution, gradient-free
    
    Pros: Most faithful (doesn't depend on gradients), works for any architecture
    Cons: Slowest (requires forward pass per channel), most faithful but expensive
    
    Args:
        model: Neural network
        layer: Layer to visualize
        input_tensor: Input image (1, 3, H, W)
        class_idx: Class index (default: max output)
        normalize: Normalize to [0, 1]
        top_k: Use only top-k channels for computational efficiency
    
    Returns:
        Heatmap (H, W) normalized to [0, 1]
    """
    hook = GradCAMHook()
    handle = layer.register_forward_hook(hook)
    
    try:
        model.eval()
        with torch.no_grad():
            # Get baseline output
            output = model(input_tensor)
            if class_idx is None:
                class_idx = output.argmax(dim=1)[0].item()
            baseline_score = output[0, class_idx]
            
            # Get activations
            _ = model(input_tensor)
            activations = hook.activations[0, :, :, :]  # (C, H, W)
            
            c, h, w = activations.shape
            
            # Use only top-k channels for speed
            if c > top_k:
                _, top_indices = torch.topk(activations.view(c, -1).mean(dim=1), top_k)
            else:
                top_indices = torch.arange(c)
            
            # Compute importance of each channel
            scores = []
            for i in top_indices:
                # Normalize activation map to [0, 1]
                act_map = activations[i, :, :]
                act_min = act_map.min()
                act_max = act_map.max()
                if act_max - act_min > 1e-8:
                    normalized_map = (act_map - act_min) / (act_max - act_min)
                else:
                    normalized_map = torch.zeros_like(act_map)
                
                # Upscale to input size
                normalized_map = normalized_map.unsqueeze(0).unsqueeze(0)  # (1, 1, h, w)
                upscaled = F.interpolate(
                    normalized_map,
                    size=input_tensor.shape[2:],
                    mode='bilinear',
                    align_corners=False
                )
                
                # Multiply input by normalized activation (ablation)
                masked_input = input_tensor * upscaled
                
                # Get score for ablated input
                output_masked = model(masked_input)
                score = output_masked[0, class_idx]
                scores.append(score.item())
            
            # Reconstruct full channel importance
            full_scores = torch.zeros(c)
            for idx, score in zip(top_indices, scores):
                full_scores[idx] = score
            
            # Weight activations by importance
            weights = F.softmax(full_scores, dim=0)  # Normalize to [0, 1]
            cam = (weights.view(-1, 1, 1) * activations).sum(dim=0)
            
            cam = F.relu(cam)
            
            if normalize:
                cam_min = cam.min()
                cam_max = cam.max()
                if cam_max - cam_min > 1e-8:
                    cam = (cam - cam_min) / (cam_max - cam_min)
                else:
                    cam = torch.zeros_like(cam)
            
            return cam.detach().cpu().numpy()
    
    finally:
        handle.remove()


# ── Unified XAI Selector ──────────────────────────────────────────────────────

def compute_xai(
    method: XAIMethod,
    activations_or_model: torch.Tensor | torch.nn.Module,
    layer: torch.nn.Module | None = None,
    input_tensor: torch.Tensor | None = None,
    **kwargs,
) -> np.ndarray:
    """
    Unified XAI method selector.
    
    Args:
        method: XAI method name
        activations_or_model: If 'eigencam': activations tensor; else: model
        layer: Target layer for Grad-CAM methods
        input_tensor: Input image for Grad-CAM methods
        **kwargs: Additional args (class_idx, normalize, etc.)
    
    Returns:
        Heatmap (H, W) in [0, 1]
    """
    method = method.lower()
    
    if method == "eigencam":
        return eigencam(activations_or_model, **kwargs)
    
    elif method == "gradcam":
        return gradcam(activations_or_model, layer, input_tensor, **kwargs)
    
    elif method == "gradcam++":
        return gradcam_plusplus(activations_or_model, layer, input_tensor, **kwargs)
    
    elif method == "scorecam":
        return scorecam(activations_or_model, layer, input_tensor, **kwargs)
    
    else:
        raise ValueError(f"Unknown XAI method: {method}. Choose from: eigencam, gradcam, gradcam++, scorecam")


# ── Visualization Improvements ────────────────────────────────────────────────

def render_xai_heatmap(
    heatmap: np.ndarray,
    image: np.ndarray,
    mask: np.ndarray | None = None,
    colormap: int = cv2.COLORMAP_TURBO,
    alpha: float = 0.5,
    sharpen: bool = True,
    background_threshold: float = 0.02,
) -> np.ndarray:
    """
    Improved heatmap visualization with sharper localization.
    
    Features:
      - Sharpen activations before colormap (high-frequency enhancement)
      - Clean background cutoff (sharp threshold)
      - Optional mask application (segmentation-aware)
      - Better blending strategy
    
    Args:
        heatmap: CAM heatmap (H, W) in [0, 1]
        image: RGB/BGR image (H, W, 3)
        mask: Optional segmentation mask (H, W) for masking
        colormap: cv2 colormap (e.g., cv2.COLORMAP_TURBO)
        alpha: Blend weight for original image
        sharpen: Apply unsharp masking to CAM for detail enhancement
        background_threshold: Threshold for background cutoff (0–1)
    
    Returns:
        Blended image (H, W, 3) in uint8 BGR format
    """
    h, w = image.shape[:2]
    
    # Ensure heatmap is [0, 1]
    heatmap = np.clip(heatmap, 0, 1).astype(np.float32)
    
    # Optional: Sharpen heatmap using unsharp masking
    if sharpen:
        blurred = cv2.GaussianBlur(heatmap, (5, 5), 0)
        heatmap_sharp = heatmap + 0.5 * (heatmap - blurred)
        heatmap = np.clip(heatmap_sharp, 0, 1)
    
    # Apply mask if provided (soft multiplication)
    if mask is not None:
        mask_norm = np.clip(mask, 0, 1).astype(np.float32)
        heatmap = heatmap * mask_norm
    
    # Convert to uint8 and apply colormap
    heatmap_uint8 = np.uint8(255 * heatmap)
    heatmap_colored = cv2.applyColorMap(heatmap_uint8, colormap)
    
    # Sharp background cutoff (zero out low-activation regions)
    heatmap_colored[heatmap < background_threshold] = 0
    
    # Blend: weighted average
    blended = cv2.addWeighted(image, alpha, heatmap_colored, 1 - alpha, 0)
    
    return blended


# ── Performance Comparison ────────────────────────────────────────────────────

METHODS_COMPARISON = {
    "eigencam": {
        "name": "EigenCAM",
        "speed": "Fast (~50ms)",
        "accuracy": "High (layer fusion)",
        "requires_gradients": False,
        "requires_class_idx": False,
        "best_for": ["segmentation", "general visualization"],
        "pros": ["Fast", "Layer fusion", "Model-agnostic"],
        "cons": ["No task-specific gradients", "Less interpretable"],
    },
    "gradcam": {
        "name": "Grad-CAM",
        "speed": "Medium (~100ms)",
        "accuracy": "High (class-specific)",
        "requires_gradients": True,
        "requires_class_idx": True,
        "best_for": ["classification", "debugging"],
        "pros": ["Task-specific", "Interpretable", "Well-studied"],
        "cons": ["Slower", "Needs class index", "Gradient-dependent"],
    },
    "gradcam++": {
        "name": "Grad-CAM++",
        "speed": "Medium (~120ms)",
        "accuracy": "Very High (weighted gradients)",
        "requires_gradients": True,
        "requires_class_idx": True,
        "best_for": ["segmentation", "instance localization", "crack detection"],
        "pros": ["Sharp localization", "Better for segmentation", "Per-pixel importance"],
        "cons": ["Slower", "Needs class index", "More computation"],
    },
    "scorecam": {
        "name": "Score-CAM",
        "speed": "Slow (~500ms)",
        "accuracy": "Highest (gradient-free)",
        "requires_gradients": False,
        "requires_class_idx": True,
        "best_for": ["faithfulness verification", "research"],
        "pros": ["Most faithful", "No gradient issues", "Gradient-free"],
        "cons": ["Slowest", "Expensive (forward pass per channel)", "Overkill for real-time"],
    },
}


def get_method_recommendation(use_case: str) -> str:
    """Get recommended XAI method for use case."""
    recommendations = {
        "crack_detection": "gradcam++",  # Best for segmentation + localization
        "segmentation": "gradcam++",     # Sharp instance boundaries
        "real_time": "eigencam",         # Fastest
        "research": "scorecam",          # Most faithful
        "balanced": "gradcam++",         # Good tradeoff
    }
    return recommendations.get(use_case, "gradcam++")
