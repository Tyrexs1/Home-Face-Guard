from __future__ import annotations

import os
import time
from pathlib import Path

# Retensi snapshot (dalam hari). Default: 2 hari.
# Bisa diubah tanpa edit kode lewat environment variable:
#   SNAPSHOT_RETENTION_DAYS=1  -> hapus snapshot lebih dari 1 hari
RETENTION_DAYS = int(os.getenv("SNAPSHOT_RETENTION_DAYS", "2"))

BASE_DIR = Path(__file__).resolve().parent
SNAPSHOTS_DIR = BASE_DIR / "dataset" / "snapshots"

def cleanup_snapshots(days: int) -> int:
    """Hapus file snapshot .jpg yang lebih tua dari N hari.

    Menggunakan mtime (modified time) file sebagai acuan.
    Return: jumlah file yang berhasil dihapus.
    """
    if not SNAPSHOTS_DIR.exists():
        return 0

    cutoff = time.time() - (days * 86400)
    deleted = 0

    for p in SNAPSHOTS_DIR.glob("*.jpg"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
                deleted += 1
        except Exception:
            # Jika file sedang dipakai/permission error, skip saja.
            continue

    return deleted

if __name__ == "__main__":
    n = cleanup_snapshots(RETENTION_DAYS)
    print(f"Deleted {n} snapshot(s) older than {RETENTION_DAYS} day(s).")
