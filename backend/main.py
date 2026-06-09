import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings

settings = get_settings()

# ── Structured JSON logging ───────────────────────────────────────────────────

class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "ts":      self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level":   record.levelname,
            "logger":  record.name,
            "msg":     record.getMessage(),
        }
        for key in ("request_id", "user_id", "scan_id", "processing_time_ms"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def _configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


_configure_logging()
logger = logging.getLogger(__name__)

# ── App factory ───────────────────────────────────────────────────────────────

from api.auth.router import router as auth_router
from api.analysis.router import router as analysis_router
from api.history.router import router as history_router
from api.model.router import router as model_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up YOLO model at startup to eliminate first-request cold-start latency."""
    try:
        from services.analyzer import _get_model
        import asyncio
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _get_model)
        logger.info("[startup] YOLO model warm-up complete")
    except Exception as exc:
        logger.warning("[startup] YOLO model warm-up failed (non-fatal): %s", exc)
    yield


app = FastAPI(
    title="Auralis Structural Health Monitoring API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = str(uuid.uuid4())[:8]
    request.state.request_id = request_id
    t0 = time.monotonic()
    response = await call_next(request)
    ms = int((time.monotonic() - t0) * 1000)
    logger.info(
        "%s %s -> %s",
        request.method, request.url.path, response.status_code,
        extra={"request_id": request_id, "processing_time_ms": ms},
    )
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Log full 422 detail so mismatched fields are visible in the terminal."""
    logger.warning(
        "[422] Validation error on %s %s — %s",
        request.method, request.url.path, exc.errors(),
    )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


app.include_router(auth_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(model_router, prefix="/api")


@app.get("/health")
@app.get("/api/health")
async def health():
    from core.database import probe_db
    db_ok = probe_db()
    return {
        "status": "ok" if db_ok else "degraded",
        "version": "1.0.0",
        "database": "connected" if db_ok else "unreachable",
        "env": settings.app_env,
    }
