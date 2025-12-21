# Auto-hapus snapshot UNKNOWN (retensi 1-2 hari)

File script:
- `cleanup_snapshots.py`

## Jalankan manual
Dari folder `backend/`:
```bash
python cleanup_snapshots.py
```

## Ubah retensi (default 2 hari)
Set environment variable:

### Windows PowerShell
```powershell
$env:SNAPSHOT_RETENTION_DAYS="1"
python cleanup_snapshots.py
```

### Linux/macOS
```bash
SNAPSHOT_RETENTION_DAYS=1 python cleanup_snapshots.py
```

## Jadwalkan otomatis

### Windows Task Scheduler (disarankan)
- Program: `python`
- Arguments: `C:\path\to\home-face-guard\backend\cleanup_snapshots.py`
- Start in: `C:\path\to\home-face-guard\backend`
- Trigger: Daily (mis. jam 03:00)

### Linux Cron
Edit crontab:
```bash
crontab -e
```

Contoh jalan tiap hari jam 03:00:
```bash
0 3 * * * /usr/bin/python3 /path/to/home-face-guard/backend/cleanup_snapshots.py >> /path/to/home-face-guard/backend/cleanup.log 2>&1
```
