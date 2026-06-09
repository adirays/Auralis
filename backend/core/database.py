import threading
import logging
from supabase import create_client, Client
from core.config import get_settings

logger = logging.getLogger(__name__)

_client: Client | None = None
_lock = threading.Lock()


def get_db() -> Client:
    """Return the singleton Supabase client, initialising it on first call (thread-safe)."""
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                settings = get_settings()
                if not settings.supabase_url or not settings.supabase_service_key:
                    raise RuntimeError(
                        "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env"
                    )
                try:
                    _client = create_client(settings.supabase_url, settings.supabase_service_key)
                    logger.info("Supabase client initialised for project: %s", settings.supabase_url)
                except Exception as exc:
                    raise RuntimeError(f"Failed to initialise Supabase client: {exc}") from exc
    return _client


def probe_db() -> bool:
    """Lightweight connectivity check — returns True if Supabase is reachable."""
    try:
        db = get_db()
        db.rpc("pg_sleep", {"seconds": 0}).execute()
        return True
    except Exception:
        # Fall back to a minimal table query if rpc is unavailable
        try:
            db = get_db()
            db.table("users").select("id").limit(1).execute()
            return True
        except Exception as exc:
            logger.warning("Supabase probe failed: %s", exc)
            return False
