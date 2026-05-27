import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from unittest.mock import patch, MagicMock

mock_db = MagicMock()
mock_db.table.return_value.select.return_value.limit.return_value.execute.return_value.data = []

with patch("core.database.get_db", return_value=mock_db), \
     patch("core.database.probe_db", return_value=True):
    from core.config import get_settings
    get_settings.cache_clear()
    from main import app

    routes = [r.path for r in app.routes]
    history_routes = [r for r in routes if "history" in r]

    print("History routes registered:")
    for r in history_routes:
        print(" ", r)

    has_bulk  = any("with-anomalies" in r for r in history_routes)
    has_param = any("{scan_id}" in r for r in history_routes)

    print()
    print("with-anomalies route present:", has_bulk)
    print("{scan_id} route present:     ", has_param)

    if has_bulk and has_param:
        bulk_idx  = next(i for i, r in enumerate(routes) if "with-anomalies" in r)
        param_idx = next(i for i, r in enumerate(routes) if "history" in r and "{scan_id}" in r)
        print("with-anomalies index:", bulk_idx, "  {scan_id} index:", param_idx)
        print("Order correct (bulk before param):", bulk_idx < param_idx)
