"""Launcher backend dengan cleanup snapshot otomatis.

Tanpa mengubah kode lama: cukup jalankan `python run_with_cleanup.py`
atau jadwalkan file ini / batch wrapper-nya.
"""

from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timedelta

from app.main import create_app

# Import script cleanup (file tambahan)
try:
    from cleanup_snapshots import cleanup_snapshots
except Exception:
    cleanup_snapshots = None


def _seconds_until(hour: int = 3, minute: int = 0) -> float:
    """Hitung detik sampai jadwal berikutnya (default jam 03:00)."""
    now = datetime.now()
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target = target + timedelta(days=1)
    return (target - now).total_seconds()


def _cleanup_loop():
    # Ambil konfigurasi dari env
    retention_days = int(os.getenv("SNAPSHOT_RETENTION_DAYS", "2"))
    schedule_hour = int(os.getenv("CLEANUP_HOUR", "3"))
    schedule_minute = int(os.getenv("CLEANUP_MINUTE", "0"))

    # Cleanup sekali saat start (aman, cepat)
    if cleanup_snapshots is not None:
        try:
            cleanup_snapshots(retention_days)
        except Exception:
            pass

    # Loop harian
    while True:
        try:
            time.sleep(max(5.0, _seconds_until(schedule_hour, schedule_minute)))
            if cleanup_snapshots is not None:
                cleanup_snapshots(retention_days)
        except Exception:
            # Jangan sampai thread mati permanen
            time.sleep(60)


def main():
    # Jalankan cleanup thread
    t = threading.Thread(target=_cleanup_loop, daemon=True)
    t.start()

    # Jalankan Flask app seperti run.py
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"

    app = create_app()
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    main()
