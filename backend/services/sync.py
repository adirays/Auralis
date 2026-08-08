"""
services/sync.py — Local ↔ Supabase Sync Engine

Future service for synchronising locally-stored scan data with the
remote Supabase database.  This module defines the interface that
will be implemented when offline-first / edge-device support is added.

Not yet implemented — all functions raise ``NotImplementedError``
with descriptive messages indicating planned behaviour.
"""

import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


# ── Public Interface ──────────────────────────────────────────────────────────

async def sync_scan_to_cloud(scan_id: str, *, force: bool = False) -> dict[str, Any]:
    """
    Upload a single locally-cached scan record to Supabase.

    Args:
        scan_id: The unique scan identifier (e.g. ``SCN-xxxx``).
        force: If True, overwrite the remote record even if it already exists.

    Returns:
        A dict with keys ``success`` (bool), ``scan_id``, and ``synced_at`` (ISO timestamp).

    Raises:
        NotImplementedError: This feature is not yet available.
    """
    raise NotImplementedError(
        "sync_scan_to_cloud is planned for the offline-first milestone. "
        "See https://github.com/your-org/auralis/issues/TBD for tracking."
    )


async def sync_all_pending(*, batch_size: int = 50) -> dict[str, Any]:
    """
    Batch-upload all locally-cached scans that have not yet been synced.

    Args:
        batch_size: Maximum number of records to sync in a single batch.

    Returns:
        A dict with ``synced_count``, ``failed_count``, and ``errors`` list.

    Raises:
        NotImplementedError: This feature is not yet available.
    """
    raise NotImplementedError(
        "sync_all_pending is planned for the offline-first milestone. "
        "See https://github.com/your-org/auralis/issues/TBD for tracking."
    )


async def get_sync_status() -> dict[str, Any]:
    """
    Return the current sync state: pending count, last sync timestamp,
    and connectivity status.

    Returns:
        A dict with ``pending_count``, ``last_synced_at``, and ``connected`` fields.

    Raises:
        NotImplementedError: This feature is not yet available.
    """
    raise NotImplementedError(
        "get_sync_status is planned for the offline-first milestone. "
        "See https://github.com/your-org/auralis/issues/TBD for tracking."
    )


__all__ = [
    "sync_scan_to_cloud",
    "sync_all_pending",
    "get_sync_status",
]