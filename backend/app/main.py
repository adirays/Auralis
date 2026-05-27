import os
import uuid
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ultralytics import YOLO
from supabase import create_client, Client
from dotenv import load_dotenv
from app.model import process_image
from app.topology import generate_topology

load_dotenv()

app = FastAPI(title="Structural Health API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_PATH = Path(__file__).parent.parent.parent / "model.pt"
BEST_MODEL_PATH = Path(__file__).parent.parent.parent / "mlops" / "weights" / "Best for V3 yolov8s.pt"

# Use best model if available, fall back to model.pt
_model_path = str(BEST_MODEL_PATH) if BEST_MODEL_PATH.exists() else str(MODEL_PATH)
model = YOLO(_model_path, task="detect")
print(f"Loaded model: {_model_path}")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY and not SUPABASE_KEY.startswith("your_"):
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def _status(detections: list) -> str:
    if not detections:
        return "NOMINAL"
    if any(d["confidence"] > 0.85 for d in detections):
        return "CRITICAL"
    return "ATTENTION"


@app.get("/health")
def health():
    return {"status": "ok", "supabase": supabase is not None}


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    suffix = Path(file.filename).suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        results = model(tmp_path)[0]
        detections = []
        for box in results.boxes:
            detections.append({
                "id": str(uuid.uuid4())[:8],
                "label": results.names[int(box.cls)],
                "confidence": round(float(box.conf), 3),
                "bbox": [round(v, 1) for v in box.xyxy[0].tolist()],
            })

        xai = {}
        topology = {}
        try:
            xai = process_image(tmp_path)
            topology = generate_topology(tmp_path)
        except Exception as e:
            print(f"XAI/topology failed: {e}")

        status = _status(detections)

        if supabase:
            try:
                supabase.table("scan_results").insert({
                    "filename": file.filename,
                    "anomaly_count": len(detections),
                    "status": status,
                    "detections": detections,
                }).execute()
            except Exception as e:
                print(f"Supabase insert failed: {e}")

        return JSONResponse({
            "filename": file.filename,
            "detections": detections,
            "count": len(detections),
            "status": status,
            "xai": xai,
            "topology": topology,
        })
    finally:
        os.unlink(tmp_path)


@app.get("/api/scan-history")
async def scan_history():
    if not supabase:
        return JSONResponse([])
    try:
        res = (
            supabase.table("scan_results")
            .select("id, scanned_at, filename, anomaly_count, status")
            .order("scanned_at", desc=True)
            .limit(10)
            .execute()
        )
        return JSONResponse(res.data)
    except Exception as e:
        print(f"Supabase fetch failed: {e}")
        return JSONResponse([])
