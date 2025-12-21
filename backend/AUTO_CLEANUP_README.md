# Auto Cleanup Snapshot (UNKNOWN)

Kamu sudah punya `cleanup_snapshots.py`. File itu akan menghapus snapshot yang lebih tua dari:
- default: 2 hari
- ubah via env: `SNAPSHOT_RETENTION_DAYS=1` (1 hari)

## Cara paling simpel (tanpa ubah kode lama)
Jalankan backend pakai launcher baru:
- Windows: double click `start_with_cleanup.bat`
- Semua OS: `python run_with_cleanup.py`

Launcher ini:
- cleanup sekali saat start
- lalu cleanup otomatis setiap hari jam 03:00 (bisa diubah via env `CLEANUP_HOUR` dan `CLEANUP_MINUTE`)

## Alternatif: scheduler OS (lebih “resmi” untuk server)
### Linux (cron)
Jalankan tiap hari jam 03:00:
```
0 3 * * * /usr/bin/python3 /path/to/backend/cleanup_snapshots.py
```

### Windows Task Scheduler
Bisa pakai `task_scheduler_cleanup.xml` sebagai template (import).
Setelah import, atur Working Directory ke folder backend kamu.
