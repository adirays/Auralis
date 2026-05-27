from pydantic import BaseModel, ConfigDict
from typing import Literal
from datetime import datetime


class BoundingBox(BaseModel):
    x: float  # percentage of image width
    y: float  # percentage of image height
    w: float  # percentage of image width
    h: float  # percentage of image height


class Anomaly(BaseModel):
    id: str
    label: str
    confidence: float                  # 0.0 – 1.0
    bbox: BoundingBox
    severity: Literal["critical", "warning", "low"]
    # ── XAI / EigenCAM fields ─────────────────────────────────────────────────
    layer4_contribution: float = 0.0   # SVD activation weight from shallow layer
    layer9_contribution: float = 0.0   # SVD activation weight from deep layer
    xai_explanation: str = ""          # Natural-language model reasoning
    physics_analysis: str = ""         # Engineering physics interpretation
    repair_recommendation: str = ""    # Prioritised repair action


class AnalysisResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    scan_id: str
    anomalies: list[Anomaly]
    heatmap_b64: str                   # base64 encoded PNG (JET, 40/60 blend)
    severity: Literal["LOW", "MEDIUM", "HIGH", "NONE"]
    diagnostics: str
    processing_time_ms: int
    location: str = ""
    model_version: str = "auralis-cv-v4"
    timestamp: str = ""               # ISO-8601 UTC
    image_url: str | None = None       # Supabase Storage public URL (set after upload)
    heatmap_url: str | None = None     # Supabase Storage public URL for heatmap


class ScanRecord(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    id: str
    user_id: str
    timestamp: str
    location: str
    severity: str
    anomaly_count: int
    processing_time_ms: int
    image_url: str | None
    heatmap_url: str | None = None
    model_version: str = ""
    diagnostics: str
    acknowledged_at: str | None = None
